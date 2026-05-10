import pdf from "pdf-parse";

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer);
  return data.text ?? "";
}

export function extractTextFromTXT(buffer: Buffer): string {
  return buffer.toString("utf-8");
}
