import { embedTexts } from "@/lib/ai";
import { inTransaction, rows, run } from "@/lib/db";

export type Chunk = {
  id: string;
  document_id: string;
  course_id: string;
  chunk_text: string;
  page_number: number;
  file_name: string;
};

type StoredChunk = Chunk & { embedding: string | null; embedding_model: string | null };

function parseVector(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0 && parsed.every(Number.isFinite) ? parsed as number[] : null;
  } catch { return null; }
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length) return -1;
  let dot = 0, leftNorm = 0, rightNorm = 0;
  for (let i = 0; i < left.length; i++) {
    dot += left[i] * right[i]; leftNorm += left[i] * left[i]; rightNorm += right[i] * right[i];
  }
  if (!leftNorm || !rightNorm) return -1;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

/**
 * Retrieval is always scoped to the authenticated student's course before any
 * vector is embedded or ranked. Legacy and model-mismatched vectors are
 * re-embedded locally before they can participate in similarity comparisons.
 */
export async function retrieveChunks(courseId: string, userId: string, query: string, limit = 6): Promise<(Chunk & { score: number })[]> {
  const chunks = rows<StoredChunk>(`SELECT c.id,c.document_id,c.course_id,c.chunk_text,c.page_number,
      c.embedding,c.embedding_model,d.file_name
    FROM document_chunks c JOIN documents d ON d.id=c.document_id
    WHERE c.course_id=? AND c.user_id=? AND d.course_id=? AND d.user_id=?`, courseId, userId, courseId, userId);
  if (!chunks.length) return [];

  const queryResult = await embedTexts([query]);
  const queryVector = queryResult.embeddings[0];
  const modelIdentity = queryResult.modelIdentity;
  const stale = chunks.filter(chunk => {
    const vector = parseVector(chunk.embedding);
    return chunk.embedding_model !== modelIdentity || !vector || vector.length !== queryVector.length;
  });
  if (stale.length) {
    const refreshed = await embedTexts(stale.map(chunk => chunk.chunk_text));
    if (refreshed.modelIdentity !== modelIdentity) {
      throw new Error("The Ollama embedding model changed during retrieval. Retry so the course materials can be re-indexed safely.");
    }
    inTransaction(() => {
      stale.forEach((chunk, index) => run("UPDATE document_chunks SET embedding=?,embedding_model=? WHERE id=? AND user_id=? AND course_id=?",
        JSON.stringify(refreshed.embeddings[index]), modelIdentity, chunk.id, userId, courseId));
    });
    const byId = new Map(stale.map((chunk, index) => [chunk.id, refreshed.embeddings[index]]));
    for (const chunk of stale) {
      const vector = byId.get(chunk.id)!;
      chunk.embedding = JSON.stringify(vector);
      chunk.embedding_model = modelIdentity;
    }
  }

  return chunks.map(chunk => ({ ...chunk, score: cosineSimilarity(queryVector, parseVector(chunk.embedding) || []) }))
    .filter(chunk => chunk.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ embedding: _embedding, embedding_model: _model, ...chunk }) => chunk);
}
