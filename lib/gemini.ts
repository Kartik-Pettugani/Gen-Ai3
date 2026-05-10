import { GoogleGenerativeAI, TaskType as GeminiTaskType } from "@google/generative-ai";

function getGenAI(): GoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GOOGLE_API_KEY. Set it in .env.local (server-side only)."
    );
  }
  return new GoogleGenerativeAI(apiKey);
}

const EMBEDDING_MODEL_PRIMARY = "text-embedding-004";

type ApiVersion = "v1" | "v1beta";

type ResolvedEmbeddingModel = {
  modelName: string;
  apiVersion: ApiVersion;
  vectorSize: number;
};

let resolvedEmbeddingModel: ResolvedEmbeddingModel | null = null;

function isModelNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("[404") || msg.includes("404 Not Found") || msg.includes("is not found");
}

async function embedWithModel(
  text: string,
  taskType: GeminiTaskType,
  modelName: string,
  apiVersion: "v1" | "v1beta"
): Promise<number[]> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel(
    { model: modelName },
    {
      apiVersion,
    }
  );

  const result = await model.embedContent({
    content: {
      role: "user",
      parts: [{ text }],
    },
    taskType,
  });

  const vector = result.embedding?.values;
  if (!vector || !Array.isArray(vector)) {
    throw new Error("Embedding response missing vector values.");
  }
  if (vector.length === 0) {
    throw new Error(`Embedding vector from ${modelName} was empty.`);
  }
  return vector;
}

function getEmbeddingCandidates(): Array<{ modelName: string; apiVersion: ApiVersion }> {
  // We try v1 first for the primary model, but many keys only expose embeddings in v1beta.
  // We include the currently listed v1beta embedding models (via ListModels).
  return [
    { modelName: EMBEDDING_MODEL_PRIMARY, apiVersion: "v1" },
    { modelName: EMBEDDING_MODEL_PRIMARY, apiVersion: "v1beta" },
    { modelName: "gemini-embedding-001", apiVersion: "v1beta" },
    { modelName: "gemini-embedding-2", apiVersion: "v1beta" },
    { modelName: "gemini-embedding-2-preview", apiVersion: "v1beta" },
  ];
}

export async function embedText(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"
): Promise<number[]> {
  const mappedTaskType =
    taskType === "RETRIEVAL_DOCUMENT"
      ? GeminiTaskType.RETRIEVAL_DOCUMENT
      : GeminiTaskType.RETRIEVAL_QUERY;

  // To ensure query embeddings match document embeddings, we resolve and cache
  // a single working model + API version on the first successful call.
  if (resolvedEmbeddingModel) {
    try {
      const v = await embedWithModel(
        text,
        mappedTaskType,
        resolvedEmbeddingModel.modelName,
        resolvedEmbeddingModel.apiVersion
      );
      if (v.length !== resolvedEmbeddingModel.vectorSize) {
        throw new Error(
          `Embedding dimension changed for ${resolvedEmbeddingModel.modelName}: ${v.length} (expected ${resolvedEmbeddingModel.vectorSize}).`
        );
      }
      return v;
    } catch (e) {
      if (!isModelNotFoundError(e)) throw e;
      resolvedEmbeddingModel = null;
    }
  }

  const candidates = getEmbeddingCandidates();
  let lastNotFound: unknown = null;

  for (const c of candidates) {
    try {
      const v = await embedWithModel(text, mappedTaskType, c.modelName, c.apiVersion);
      resolvedEmbeddingModel = {
        modelName: c.modelName,
        apiVersion: c.apiVersion,
        vectorSize: v.length,
      };
      return v;
    } catch (e) {
      if (isModelNotFoundError(e)) {
        lastNotFound = e;
        continue;
      }
      throw e;
    }
  }

  const msg = lastNotFound instanceof Error ? lastNotFound.message : String(lastNotFound ?? "");
  throw new Error(
    `No embedding models were available for this API key. Last error: ${msg}`
  );
}

export async function generateAnswer(
  systemPrompt: string,
  question: string
): Promise<string> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.2,
    },
  });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: question }],
      },
    ],
  });

  const text = result.response.text();
  return text.trim();
}
