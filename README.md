# LearnSphere AI — Syllabus to Study

LearnSphere turns a student's syllabus into reviewed topics, a checked study plan, a document-grounded tutor, quizzes, and saved learning progress. It is the existing Next.js application with local Ollama inference; no OpenAI, Gemini, or Anthropic API key is required.

## Architecture

- **Web and API:** Next.js App Router, React, TypeScript, and server route handlers.
- **AI provider boundary:** `lib/ai.ts` defines the provider interface and the enabled Ollama adapter. The adapter only accepts loopback URLs, so inference cannot silently be sent to a cloud host. Chat uses Ollama's `/api/chat`; vectors use `/api/embed`.
- **Local models:** `qwen2.5:7b` generates answers, topic suggestions, study effort estimates, quizzes, explanations, and adaptive recommendations. `qwen3-embedding:0.6b` powers semantic retrieval. Qwen3 Embedding is multilingual and supports more than 100 languages.
- **PDF and RAG:** PDF.js extracts selectable PDF text locally; TXT files are decoded locally. Text is chunked with the original page number. The first retrieval for a course creates local vectors and saves them with the model name and Ollama model digest. Existing or mismatched vectors are regenerated before similarity search. Search is scoped by signed-in user and course, and citations are made from stored document/page metadata.
- **Identity and database:** local email/password accounts, scrypt password hashes, opaque HttpOnly sessions, and SQLite through Node's built-in `node:sqlite`. Schema initialization and the embedding metadata migration preserve existing course and document rows.
- **Private uploads:** files are stored outside `public/` under `data/uploads/<user-id>/`. Uploads are limited to 15 MB and 100 pages.
- **Study plans and progress:** schedules are capacity checked before and during approval. Quiz scoring and mastery values are computed from saved answers; local AI provides study effort estimates and adaptive review guidance.
- **Product interface:** English and Bangla, light and dark themes, responsive workspace, dashboard, courses, tutor, planner, quiz center, and progress analytics.

`migrations/0001_supabase.sql` is a PostgreSQL/Supabase schema reference, not the active local runtime. `migrations/0002_ollama_embeddings.sql` upgrades an existing Supabase reference database and invalidates old, incompatible vectors while preserving chunks and page references. SQLite adds `embedding_model` idempotently at startup in `lib/db.ts`; old vectors without a matching model identity are re-created from the saved text on the next retrieval.

## Requirements

- Windows 10 or later, or another supported Ollama platform.
- Node.js 24 (Node 22.13+ also includes `node:sqlite`) and npm.
- Ollama installed and running locally.
- About 5.4 GB of free disk space for the requested quantized chat and embedding models, plus extra space for Ollama and application data. Download sizes may vary by Ollama tag.

## Install Ollama and models on Windows

1. Install Ollama from the [official Windows download page](https://ollama.com/download/windows), then open the Ollama app. It runs a local service at `http://localhost:11434`.
2. Open PowerShell and download both models:

   ```powershell
   ollama pull qwen2.5:7b
   ollama pull qwen3-embedding:0.6b
   ollama list
   ```

   The expected model names should appear in `ollama list`. Keep Ollama running while you use LearnSphere.

The chat model is roughly 4.7 GB and the embedding model roughly 639 MB in the current Ollama library listing. Local speed depends on available memory and GPU hardware.

## Configure and run LearnSphere

From the project folder in PowerShell:

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Using `npm.cmd` works in PowerShell installations where script execution policy blocks `npm.ps1`. Open [http://localhost:3000](http://localhost:3000), create an account, create a course, and upload a text-based PDF or UTF-8 TXT file.

The default `.env.local` settings are:

```dotenv
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=qwen2.5:7b
OLLAMA_EMBEDDING_MODEL=qwen3-embedding:0.6b
OLLAMA_CHAT_TIMEOUT_MS=300000
OLLAMA_EMBEDDING_TIMEOUT_MS=300000
```

No cloud AI key is needed. The app checks Ollama and both model tags in the workspace header. If Ollama is stopped, start the Ollama app. If a model is missing, the app displays the exact `ollama pull ...` command. The app reports connection and timeout errors and does not return simulated AI responses.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama service. Only `localhost`, `127.0.0.1`, and `::1` are accepted. |
| `OLLAMA_CHAT_MODEL` | `qwen2.5:7b` | Installed Ollama chat model used for generation. |
| `OLLAMA_EMBEDDING_MODEL` | `qwen3-embedding:0.6b` | Installed Ollama embedding model used for semantic retrieval. |
| `OLLAMA_CHAT_TIMEOUT_MS` | `300000` | Chat request timeout in milliseconds (30,000–600,000). |
| `OLLAMA_EMBEDDING_TIMEOUT_MS` | `300000` | Embedding request timeout in milliseconds (30,000–600,000). |

These model settings are read only by server-side code. Never add model settings or secrets to `NEXT_PUBLIC_*` variables. Old `AI_PROVIDER`, `AI_MODEL`, and `AI_API_KEY` settings are unused and can be removed from `.env.local`.

## Database and private files

The app creates `data/learnsphere.sqlite` and `data/uploads/` on first server use. Back up both together. Keep `data/` on persistent storage, restrict access to the server process, and do not serve it as static content. The SQLite runtime adds the embedding model identity column without removing existing chunk text or page numbers. When the embedding model or its installed digest changes, stale vectors are regenerated locally before they are used.

The SQLite adapter is intended for development and a single self-hosted Node instance on persistent disk. Standard ephemeral/serverless deployments do not provide durable shared local files; use database and private object-storage adapters before deploying there. Configure HTTPS when exposing the app publicly so production session cookies remain secure.

## Validation commands

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd start
```

The end-to-end API smoke workflow uses temporary accounts and removes them when it finishes. With the app running on port 3100:

```powershell
# Terminal 1
npm.cmd run dev -- --port 3100

# Terminal 2
node work/smoke.mjs
```

AI feature checks require Ollama and both model tags to be available. The example smoke suite covers account, course, upload, planning persistence, quiz scoring, analytics, and user-data isolation; run tutor, topic extraction, generated quiz, adaptive recommendation, and English/Bangla retrieval against your installed models as well.

## Privacy and behavior

- Every course, document, chunk, conversation, plan, quiz, and result query is scoped to the signed-in user. RAG also filters to the active course before embedding or ranking.
- Uploaded files and extracted chunks remain in private local storage. Inference and embedding requests go only to the local Ollama loopback service.
- Tutor citations use the actual stored file name and PDF/TXT page metadata. The model is instructed to cite only supplied labels; generated quiz source indices are mapped back to those real chunk records.
- Quiz answers are checked on the server. Mastery is derived from saved answers, and adaptive AI recommendations use those recorded values.
- PDF extraction needs selectable text; scanned/image-only PDFs are rejected because OCR is not included.
- AI output can be inaccurate. Review generated topics, study time estimates, explanations, and recommendations.
