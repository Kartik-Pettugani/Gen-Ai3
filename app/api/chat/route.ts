import { NextResponse } from "next/server";

import type { ChatResponse, QdrantResult } from "@/types";
import { embedText, generateAnswer } from "@/lib/gemini";
import { searchSimilar } from "@/lib/qdrant";

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      question?: unknown;
      collectionName?: unknown;
    };

    const question = typeof body.question === "string" ? body.question.trim() : "";
    const collectionName =
      typeof body.collectionName === "string" ? body.collectionName.trim() : "";

    if (!collectionName) {
      return NextResponse.json(
        { error: "Missing collectionName. Upload a document first." },
        { status: 400 }
      );
    }

    if (!question) {
      return NextResponse.json(
        { error: "Missing question." },
        { status: 400 }
      );
    }

    const queryVector = await embedText(question, "RETRIEVAL_QUERY");
    const topK = 5;
    const results = await searchSimilar(collectionName, queryVector, topK);

    const context = results
      .map((r) => {
        return `Source: ${r.source} | chunk ${r.chunkIndex} | page ~${r.pageApprox}\n\n${r.text}`;
      })
      .join("\n\n---\n\n");

    const systemPrompt = `You are a document assistant. Answer ONLY based on the context provided below.
Do NOT use any outside knowledge. If the answer is not in the context, say:
"I could not find this information in the uploaded document."

DOCUMENT CONTEXT:
${context}

Source metadata: ${results
      .map((r) => `${r.source} (chunk ${r.chunkIndex}, page ~${r.pageApprox})`)
      .join("; ")}`;

    const answer = await generateAnswer(systemPrompt, question);

    // Return sources with an additional preview field (UI uses it if present).
    const sources = results.map((r) => ({
      ...r,
      preview: r.text.slice(0, 220),
    }));

    const response: ChatResponse = {
      answer,
      sources: sources as unknown as QdrantResult[],
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (isRateLimitError(message)) {
      const retryAfter = parseRetryAfterSeconds(message);
      return NextResponse.json(
        {
          error: `Chat failed: ${message}`,
          retryAfterSeconds: retryAfter,
        },
        {
          status: 429,
          headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
        }
      );
    }

    return NextResponse.json(
      { error: `Chat failed: ${message}` },
      { status: 500 }
    );
  }
}
