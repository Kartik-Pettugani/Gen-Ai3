import { NextResponse } from "next/server";

import type { ChunkWithVector, UploadResponse } from "@/types";
import { chunkText } from "@/lib/chunker";
import { embedText } from "@/lib/gemini";
import { extractTextFromPDF, extractTextFromTXT } from "@/lib/pdf";
import { createCollection, upsertChunks } from "@/lib/qdrant";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

function parseRetryAfterSeconds(message: string): number | null {
  const m = message.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : null;
}

function isRateLimitError(message: string): boolean {
  return (
    message.includes("[429") ||
    message.includes("429 Too Many Requests") ||
    message.toLowerCase().includes("quota exceeded")
  );
}

function sanitizeBaseName(filename: string): string {
  const base = filename.replace(/\.[^/.]+$/, "");
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const idx = nextIndex;
      nextIndex += 1;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file. Use multipart/form-data with field name 'file'." },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large. Max size is 10MB." },
        { status: 400 }
      );
    }

    const filename = file.name || "document";
    const lower = filename.toLowerCase();
    const isPdf = lower.endsWith(".pdf");
    const isTxt = lower.endsWith(".txt");

    if (!isPdf && !isTxt) {
      return NextResponse.json(
        { error: "Invalid file type. Upload a .pdf or .txt file." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const rawText = isPdf
      ? await extractTextFromPDF(buffer)
      : extractTextFromTXT(buffer);

    const cleaned = rawText.trim();
    if (!cleaned) {
      return NextResponse.json(
        { error: "No text could be extracted from the uploaded document." },
        { status: 400 }
      );
    }

    const ts = Date.now();
    const safeName = sanitizeBaseName(filename);
    const collectionName = `doc_${safeName || "doc"}_${ts}`;

    const chunks = chunkText(cleaned, filename);
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "Document produced no usable chunks (try a larger document)." },
        { status: 400 }
      );
    }

    // Embed one chunk first so we know the embedding dimension, then create
    // the Qdrant collection with the correct vector size.
    const firstChunk = chunks[0];
    const firstVector = await embedText(firstChunk.text, "RETRIEVAL_DOCUMENT");

    await createCollection(collectionName, firstVector.length);

    const rest = chunks.slice(1);
    const restVectors = await mapWithConcurrency(rest, 10, async (chunk) => {
      const vector = await embedText(chunk.text, "RETRIEVAL_DOCUMENT");
      const withVector: ChunkWithVector = { ...chunk, vector };
      return withVector;
    });

    const vectors: ChunkWithVector[] = [
      { ...firstChunk, vector: firstVector },
      ...restVectors,
    ];

    await upsertChunks(collectionName, vectors);

    const response: UploadResponse = {
      success: true,
      collectionName,
      totalChunks: chunks.length,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (isRateLimitError(message)) {
      const retryAfter = parseRetryAfterSeconds(message);
      return NextResponse.json(
        { error: `Upload/ingestion failed: ${message}`, retryAfterSeconds: retryAfter },
        {
          status: 429,
          headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
        }
      );
    }

    return NextResponse.json(
      { error: `Upload/ingestion failed: ${message}` },
      { status: 500 }
    );
  }
}
