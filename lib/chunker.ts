import type { Chunk } from "@/types";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;
const MIN_CHUNK_LEN = 50;
const DELIMITERS = ["\n\n", "\n", ". ", " "] as const;

function hardSplit(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const out: string[] = [];
  for (let start = 0; start < text.length; start += maxLen) {
    out.push(text.slice(start, start + maxLen));
  }
  return out;
}

function splitKeepingDelimiter(text: string, delimiter: string): string[] {
  if (!text.includes(delimiter)) return [text];
  const parts = text.split(delimiter);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length === 0) continue;
    const withDelim = i < parts.length - 1 ? part + delimiter : part;
    out.push(withDelim);
  }
  return out.length ? out : [text];
}

function recursiveSplit(text: string, delimiters: readonly string[]): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  if (delimiters.length === 0) return hardSplit(text, CHUNK_SIZE);

  const delimiter = delimiters[0];
  const parts = splitKeepingDelimiter(text, delimiter);
  if (parts.length === 1) {
    return recursiveSplit(text, delimiters.slice(1));
  }

  const out: string[] = [];
  for (const part of parts) {
    if (part.length <= CHUNK_SIZE) {
      out.push(part);
    } else {
      out.push(...recursiveSplit(part, delimiters.slice(1)));
    }
  }
  return out;
}

function mergeWithOverlap(pieces: string[]): string[] {
  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0) chunks.push(trimmed);
  };

  for (const piece of pieces) {
    if (piece.length === 0) continue;

    if (current.length + piece.length <= CHUNK_SIZE) {
      current += piece;
      continue;
    }

    // Flush current chunk.
    pushCurrent();

    const overlapText = current.slice(Math.max(0, current.length - CHUNK_OVERLAP));
    current = overlapText;

    // If the new piece still doesn't fit, add it in slices.
    let remainingPiece = piece;
    while (remainingPiece.length > 0) {
      const spaceLeft = CHUNK_SIZE - current.length;
      if (spaceLeft <= 0) {
        pushCurrent();
        current = current.slice(Math.max(0, current.length - CHUNK_OVERLAP));
        continue;
      }

      if (remainingPiece.length <= spaceLeft) {
        current += remainingPiece;
        remainingPiece = "";
      } else {
        current += remainingPiece.slice(0, spaceLeft);
        remainingPiece = remainingPiece.slice(spaceLeft);
        pushCurrent();
        current = current.slice(Math.max(0, current.length - CHUNK_OVERLAP));
      }
    }
  }

  pushCurrent();
  return chunks;
}

export function chunkText(text: string, filename: string): Chunk[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const pieces = recursiveSplit(normalized, DELIMITERS);
  const rawChunks = mergeWithOverlap(pieces);

  const filtered = rawChunks
    .map((t) => t.trim())
    .filter((t) => t.length >= MIN_CHUNK_LEN);

  return filtered.map((chunkText, i) => {
    const chunkIndex = i + 1; // 1-based to match pageApprox estimation
    const pageApprox = Math.ceil(chunkIndex / 3);
    return {
      text: chunkText,
      chunkIndex,
      source: filename,
      pageApprox,
    };
  });
}
