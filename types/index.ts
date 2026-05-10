export interface Chunk {
  text: string;
  chunkIndex: number;
  source: string;
  pageApprox: number;
}

export interface ChunkWithVector extends Chunk {
  vector: number[];
}

export interface QdrantResult {
  text: string;
  source: string;
  chunkIndex: number;
  pageApprox: number;
  score: number;
}

export interface UploadResponse {
  success: boolean;
  collectionName: string;
  totalChunks: number;
}

export interface ChatResponse {
  answer: string;
  sources: QdrantResult[];
}
