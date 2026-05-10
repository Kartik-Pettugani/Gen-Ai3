import { QdrantClient } from "@qdrant/js-client-rest";

import type { ChunkWithVector, QdrantResult } from "@/types";

function getQdrantClient(): QdrantClient {
  const url = process.env.QDRANT_URL;
  const apiKey = process.env.QDRANT_API_KEY;

  if (!url) {
    throw new Error("Missing QDRANT_URL. Set it in .env.local (server-side only).");
  }
  if (!apiKey) {
    throw new Error(
      "Missing QDRANT_API_KEY. Set it in .env.local (server-side only)."
    );
  }

  return new QdrantClient({ url, apiKey });
}

export async function createCollection(
  collectionName: string,
  vectorSize: number
): Promise<void> {
  const client = getQdrantClient();
  const collections = await client.getCollections();
  const exists = collections.collections?.some((c) => c.name === collectionName);
  if (exists) return;

  await client.createCollection(collectionName, {
    vectors: {
      size: vectorSize,
      distance: "Cosine",
    },
  });
}

export async function upsertChunks(
  collectionName: string,
  chunks: ChunkWithVector[]
): Promise<void> {
  const client = getQdrantClient();

  const points = chunks.map((c) => ({
    id: c.chunkIndex,
    vector: c.vector,
    payload: {
      text: c.text,
      source: c.source,
      chunkIndex: c.chunkIndex,
      pageApprox: c.pageApprox,
    },
  }));

  await client.upsert(collectionName, {
    wait: true,
    points,
  });
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function searchSimilar(
  collectionName: string,
  queryVector: number[],
  k: number
): Promise<QdrantResult[]> {
  const client = getQdrantClient();

  const results = await client.search(collectionName, {
    vector: queryVector,
    limit: k,
    with_payload: true,
    with_vector: false,
  });

  return results.map((r) => {
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    const text = typeof payload.text === "string" ? payload.text : "";
    const source = typeof payload.source === "string" ? payload.source : "";
    const chunkIndex = asNumber(payload.chunkIndex) ?? 0;
    const pageApprox = asNumber(payload.pageApprox) ?? 0;

    return {
      text,
      source,
      chunkIndex,
      pageApprox,
      score: r.score ?? 0,
    };
  });
}
