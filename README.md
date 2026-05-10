# NotebookLM Clone (RAG-powered)

A Google NotebookLM-style web app that lets you upload a PDF/TXT document, indexes it in a vector database (Qdrant), and then answers questions using **strictly grounded** Retrieval-Augmented Generation (RAG) with **Google Gemini**.

Key features:
- Upload **PDF** or **TXT** (max 10MB)
- Recursive Character Chunking (800 chars, 150 overlap)
- Gemini embeddings (`text-embedding-004`) stored in Qdrant Cloud
- Chat with your document using Gemini (`gemini-2.0-flash`) with **sources**

---

## Tech Stack

- **Next.js 14 (App Router) + TypeScript** — Full-stack web app (UI + API routes)
- **Tailwind CSS** — NotebookLM-like clean UI styling
- **Google Gemini API (Google AI Studio free tier)** —
	- LLM: `gemini-2.0-flash`
	- Embeddings: `text-embedding-004` (768 dims)
- **Qdrant Cloud (free tier)** — Vector DB for similarity search
- **@qdrant/js-client-rest** — Qdrant REST client
- **pdf-parse** — Server-side PDF text extraction

---

## Chunking Strategy (Recursive Character Chunking)

This project uses a **recursive character splitting** strategy (similar in spirit to LangChain's recursive splitter) to create retrieval-friendly chunks.

Why this approach:
- Preserves semantic boundaries when possible (paragraphs → lines → sentences → words)
- Produces chunks that are neither too large (hurts recall) nor too small (hurts context)
- Overlap helps prevent losing info at chunk boundaries

Parameters:
- `chunkSize = 800` characters
- `chunkOverlap = 150` characters

Delimiter cascade (largest to smallest):
1. `"\n\n"` (paragraphs)
2. `"\n"` (lines)
3. `". "` (sentence-ish)
4. `" "` (words)

If text is still longer than 800 chars after exhausting delimiters (e.g., a very long unbroken token), it is **hard-sliced** to guarantee an upper bound.

Filtering:
- Chunks shorter than 50 characters are dropped.

Approx page estimation:
- `pageApprox = Math.ceil(chunkIndex / 3)` (every ~3 chunks ≈ 1 page)

Implementation: `lib/chunker.ts`

---

## RAG Pipeline Diagram

```
UPLOAD (PDF/TXT)
	→ Extract Text (pdf-parse / utf-8 decode)
	→ Chunk (recursive delimiters + overlap)
	→ Embed Chunks (Gemini text-embedding-004, RETRIEVAL_DOCUMENT)
	→ Store in Qdrant (collection per upload)

CHAT QUESTION
	→ Embed Query (Gemini text-embedding-004, RETRIEVAL_QUERY)
	→ Search Qdrant (top k=5)
	→ Build Grounded System Prompt (STRICT: use ONLY provided context)
	→ Gemini (gemini-2.0-flash, temp=0.2)
	→ Answer + Sources
```

---

## Local Setup

1) Clone

```bash
git clone <your-repo-url>
cd notebooklm-clone
```

2) Install

```bash
npm install
```

3) Get a free Google API key

- Go to https://aistudio.google.com
- Create an API key (free tier, no credit card required)

4) Create a free Qdrant Cloud cluster

- Go to https://cloud.qdrant.io
- Create a free cluster
- Copy the cluster URL + API key

5) Configure env vars

```bash
cp .env.local.example .env.local
```

Fill in:
- `GOOGLE_API_KEY`
- `QDRANT_URL`
- `QDRANT_API_KEY`

6) Run dev server

```bash
npm run dev
```

Open http://localhost:3000

---

## Deployment to Vercel

1) Push to GitHub (public repo)
2) Go to https://vercel.com → Import Project
3) Add env vars in Vercel Project Settings:
	 - `GOOGLE_API_KEY`
	 - `QDRANT_URL`
	 - `QDRANT_API_KEY`
4) Deploy

---

## How to Use the App

1) Upload a **PDF** or **TXT** from the left panel.
2) Wait for the status to reach: **“✅ Ready! Ask me anything.”**
3) Ask questions in the chat on the right.
4) Expand **Sources** under any assistant answer to see which chunk/page it came from.
5) Uploading a new document replaces the active collection and resets the chat.

---

## Marking Scheme Mapping

| Criterion | Where implemented |
|---|---|
| Next.js 14 App Router + TS | `app/`, `tsconfig.json`, `package.json` |
| Upload API (multipart, validate types + 10MB) | `app/api/upload/route.ts` |
| PDF parsing via pdf-parse | `lib/pdf.ts` |
| Recursive chunking (800 / overlap 150 / delimiter cascade) | `lib/chunker.ts` |
| Qdrant collection (768 dims, cosine) | `lib/qdrant.ts` |
| Document embeddings (task_type RETRIEVAL_DOCUMENT) | `lib/gemini.ts`, `app/api/upload/route.ts` |
| Query embeddings (task_type RETRIEVAL_QUERY) | `lib/gemini.ts`, `app/api/chat/route.ts` |
| Top-k retrieval (k=5) | `app/api/chat/route.ts`, `lib/qdrant.ts` |
| Grounded system prompt forbids outside knowledge | `app/api/chat/route.ts` |
| Gemini generation (gemini-2.0-flash, temp=0.2) | `lib/gemini.ts` |
| Source citations shown in UI | `components/MessageBubble.tsx`, `components/ChatSection.tsx` |
| Two-panel NotebookLM-like responsive layout | `app/page.tsx`, Tailwind styles |
| Env vars server-side only | Used only in `lib/gemini.ts` / `lib/qdrant.ts` (route handlers) |
| next.config requirements | `next.config.ts` |

---

## Notes / Gotchas

- **Rate limits**: Gemini free tier has usage limits. Large docs may take time to embed.
- **Embedding model availability**: If `text-embedding-004` returns a 404 for your API key, the app automatically falls back to `embedding-001` (still expecting 768-dim vectors) so ingestion can proceed.
- **PDF quality**: Scanned PDFs without selectable text may extract poorly.
- **Collection-per-upload**: Each upload creates a new Qdrant collection. In a production app you’d add cleanup/retention policies.
- **Body size**: Upload size is enforced in `app/api/upload/route.ts` (10MB). Next.js config also sets 10MB as requested.

