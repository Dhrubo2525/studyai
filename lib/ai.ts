import "server-only";

/** Provider boundary: local Ollama is the only enabled adapter. Additional
 * providers can implement this contract later without changing route handlers. */
export interface AIProviderAdapter {
  generateText(system: string, prompt: string, options?: { format?: "json"; maxTokens?: number }): Promise<string>;
  embedTexts(texts: string[]): Promise<EmbeddingResult>;
  status(): Promise<AIStatus>;
}

export type AIStatus = {
  provider: "ollama";
  reachable: boolean;
  chatModel: string;
  chatModelAvailable: boolean;
  embeddingModel: string;
  embeddingModelAvailable: boolean;
  installedModels: string[];
  modelDigests: Record<string, string>;
  message: string | null;
};

export type EmbeddingResult = { embeddings: number[][]; modelIdentity: string };

export class AIConfigurationError extends Error {}
export class AIRequestError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

const defaultChatModel = "qwen2.5:7b";
const defaultEmbeddingModel = "qwen3-embedding:0.6b";
const defaultBaseUrl = "http://localhost:11434";
const defaultChatTimeoutMs = 300_000;
const defaultEmbeddingTimeoutMs = 300_000;

function timeoutSetting(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 30_000 && parsed <= 600_000 ? parsed : fallback;
}

function config() {
  const baseUrl = (process.env.OLLAMA_BASE_URL || defaultBaseUrl).trim().replace(/\/+$/, "");
  let parsed: URL;
  try { parsed = new URL(baseUrl); }
  catch { throw new AIConfigurationError("OLLAMA_BASE_URL must be a valid local Ollama URL, such as http://localhost:11434."); }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (parsed.protocol !== "http:" || !localHosts.has(parsed.hostname.toLowerCase()) || parsed.username || parsed.password) {
    throw new AIConfigurationError("Ollama inference is restricted to this computer. Set OLLAMA_BASE_URL to http://localhost:11434.");
  }
  const chatModel = (process.env.OLLAMA_CHAT_MODEL || defaultChatModel).trim();
  const embeddingModel = (process.env.OLLAMA_EMBEDDING_MODEL || defaultEmbeddingModel).trim();
  if (!chatModel || !embeddingModel || /:cloud(?:$|\b)/i.test(chatModel) || /:cloud(?:$|\b)/i.test(embeddingModel)) {
    throw new AIConfigurationError("OLLAMA_CHAT_MODEL and OLLAMA_EMBEDDING_MODEL must name local Ollama models, not cloud models.");
  }
  return {
    baseUrl,
    chatModel,
    embeddingModel,
    chatTimeoutMs: timeoutSetting(process.env.OLLAMA_CHAT_TIMEOUT_MS, defaultChatTimeoutMs),
    embeddingTimeoutMs: timeoutSetting(process.env.OLLAMA_EMBEDDING_TIMEOUT_MS, defaultEmbeddingTimeoutMs),
  };
}

function normalizedTag(value: string) {
  return value.includes(":") ? value : `${value}:latest`;
}

function installedModel(models: Array<{ name?: string; model?: string; digest?: string }>, wanted: string) {
  return models.find(item => normalizedTag(item.name || item.model || "") === normalizedTag(wanted));
}

async function fetchWithRetry(url: string, init: RequestInit, timeoutMs: number, operation = "Ollama request") {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: "no-store", redirect: "error" });
      if ((response.status >= 500 || response.status === 429) && attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 350));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === 0 && !(error instanceof Error && error.name === "TimeoutError")) {
        await new Promise(resolve => setTimeout(resolve, 350));
        continue;
      }
      break;
    }
  }
  if (lastError instanceof Error && lastError.name === "TimeoutError") {
    const hint = operation.includes("chat model")
      ? " If this keeps happening, use qwen2.5:3b as the chat model in .env.local."
      : operation.includes("embedding model")
        ? " The first question indexes this course's document chunks; retry after Ollama finishes loading the embedding model."
        : " Check that the Ollama app is running.";
    throw new AIRequestError(`${operation} timed out after ${Math.round(timeoutMs / 1000)} seconds. Keep Ollama running and retry.${hint}`, 504);
  }
  throw new AIRequestError("Cannot connect to Ollama. Start the Ollama app on this computer, then retry.", 503);
}

async function readError(response: Response) {
  const data = await response.json().catch(() => ({})) as { error?: string };
  return typeof data.error === "string" ? data.error : "";
}

class OllamaProvider implements AIProviderAdapter {
  async status(): Promise<AIStatus> {
    let settings: ReturnType<typeof config>;
    try { settings = config(); }
    catch (error) {
      return { provider: "ollama", reachable: false, chatModel: defaultChatModel, chatModelAvailable: false,
        embeddingModel: defaultEmbeddingModel, embeddingModelAvailable: false, installedModels: [], modelDigests: {},
        message: error instanceof Error ? error.message : "Ollama configuration is invalid." };
    }
    try {
      const response = await fetchWithRetry(`${settings.baseUrl}/api/tags`, { method: "GET" }, 5000, "Ollama availability check");
      if (!response.ok) return { provider: "ollama", reachable: false, chatModel: settings.chatModel,
        chatModelAvailable: false, embeddingModel: settings.embeddingModel, embeddingModelAvailable: false,
        installedModels: [], modelDigests: {}, message: `Ollama returned HTTP ${response.status}. Restart the Ollama app and try again.` };
      const data = await response.json() as { models?: Array<{ name?: string; model?: string; digest?: string }> };
      const models = Array.isArray(data.models) ? data.models : [];
      return { provider: "ollama", reachable: true, chatModel: settings.chatModel,
        chatModelAvailable: Boolean(installedModel(models, settings.chatModel)), embeddingModel: settings.embeddingModel,
        embeddingModelAvailable: Boolean(installedModel(models, settings.embeddingModel)),
        installedModels: models.map(model => model.name || model.model || "").filter(Boolean),
        modelDigests: Object.fromEntries(models.filter(model => model.digest).map(model => [normalizedTag(model.name || model.model || ""), model.digest!])), message: null };
    } catch (error) {
      return { provider: "ollama", reachable: false, chatModel: settings.chatModel, chatModelAvailable: false,
        embeddingModel: settings.embeddingModel, embeddingModelAvailable: false, installedModels: [], modelDigests: {},
        message: error instanceof Error ? error.message : "Cannot connect to Ollama." };
    }
  }

  private async requireModel(kind: "chat" | "embedding") {
    const status = await this.status();
    if (!status.reachable) throw new AIRequestError(status.message || "Cannot connect to Ollama. Start Ollama and retry.", 503);
    const available = kind === "chat" ? status.chatModelAvailable : status.embeddingModelAvailable;
    const model = kind === "chat" ? status.chatModel : status.embeddingModel;
    if (!available) throw new AIRequestError(`Ollama model “${model}” is not installed. Open PowerShell and run: ollama pull ${model}`, 424);
    const settings = config();
    return { baseUrl: settings.baseUrl, model, timeoutMs: kind === "chat" ? settings.chatTimeoutMs : settings.embeddingTimeoutMs };
  }

  async generateText(system: string, prompt: string, options: { format?: "json"; maxTokens?: number } = {}) {
    const { baseUrl, model, timeoutMs } = await this.requireModel("chat");
    const response = await fetchWithRetry(`${baseUrl}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: false, keep_alive: "15m", ...(options.format ? { format: options.format } : {}),
        options: { temperature: 0.35, ...(options.maxTokens ? { num_predict: options.maxTokens } : {}) },
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
    }, timeoutMs, `Ollama chat model ${model}`);
    if (!response.ok) {
      const details = await readError(response);
      if (response.status === 404 || /model.+not found/i.test(details)) {
        throw new AIRequestError(`Ollama model “${model}” is not installed. Run: ollama pull ${model}`, 424);
      }
      throw new AIRequestError(`Ollama chat request failed (HTTP ${response.status}). ${details || "Retry the request."}`, response.status >= 400 && response.status < 500 ? response.status : 502);
    }
    const data = await response.json() as { message?: { content?: string } };
    const output = data.message?.content?.trim();
    if (!output) throw new AIRequestError("Ollama returned an empty response. Please retry.");
    return output;
  }

  async embedTexts(texts: string[]): Promise<EmbeddingResult> {
    if (!texts.length) return { embeddings: [], modelIdentity: "" };
    const { baseUrl, model, timeoutMs } = await this.requireModel("embedding");
    const modelStatus = await this.status();
    const modelIdentity = `${normalizedTag(model)}@${modelStatus.modelDigests[normalizedTag(model)] || normalizedTag(model)}`;
    const embeddings: number[][] = [];
    let dimension = 0;
    // Ollama accepts an array of input strings. Batches keep requests predictable
    // for courses containing many pages while preserving input/result ordering.
    for (let offset = 0; offset < texts.length; offset += 16) {
      const response = await fetchWithRetry(`${baseUrl}/api/embed`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: texts.slice(offset, offset + 16), truncate: true, keep_alive: "15m" }),
      }, timeoutMs, `Ollama embedding model ${model}`);
      if (!response.ok) {
        const details = await readError(response);
        if (response.status === 404 || /model.+not found/i.test(details)) {
          throw new AIRequestError(`Ollama embedding model “${model}” is not installed. Run: ollama pull ${model}`, 424);
        }
        throw new AIRequestError(`Ollama embedding request failed (HTTP ${response.status}). ${details || "Retry the request."}`, response.status >= 400 && response.status < 500 ? response.status : 502);
      }
      const data = await response.json() as { embeddings?: number[][] };
      if (!Array.isArray(data.embeddings) || data.embeddings.length !== Math.min(16, texts.length - offset) ||
        data.embeddings.some(vector => !Array.isArray(vector) || !vector.length || vector.some(value => !Number.isFinite(value)))) {
        throw new AIRequestError("Ollama returned invalid embeddings. Check the embedding model and retry.");
      }
      const batchDimension = data.embeddings[0]?.length || 0;
      if (!batchDimension || data.embeddings.some(vector => vector.length !== batchDimension) || (dimension && dimension !== batchDimension)) {
        throw new AIRequestError("Ollama returned vectors with incompatible dimensions. No vectors were compared or stored.");
      }
      dimension = batchDimension;
      embeddings.push(...data.embeddings);
    }
    return { embeddings, modelIdentity };
  }
}

// This is the only enabled provider. Its URL is validated as loopback above,
// so AI inference cannot silently fall back to a cloud service.
const provider: AIProviderAdapter = new OllamaProvider();

export const getAIStatus = () => provider.status();
export const generateText = (system: string, prompt: string, options?: { format?: "json"; maxTokens?: number }) => provider.generateText(system, prompt, options);
export const embedTexts = (texts: string[]) => provider.embedTexts(texts);

export function aiErrorStatus(error: unknown) {
  if (error instanceof AIConfigurationError) return 503;
  if (error instanceof AIRequestError) return error.status;
  return 500;
}
