"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import type { UploadResponse } from "@/types";

const STEPS = [
  "📄 Reading document...",
  "✂️ Chunking text...",
  "🔢 Generating embeddings...",
  "💾 Storing in vector database...",
] as const;

export function UploadSection(props: {
  active?: {
    filename: string;
    totalChunks: number;
    collectionName: string;
  } | null;
  onUploaded: (result: {
    filename: string;
    totalChunks: number;
    collectionName: string;
  }) => void;
  onReset: () => void;
}) {
  const { active, onUploaded, onReset } = props;

  const inputRef = useRef<HTMLInputElement | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      setError("");
      setIsUploading(true);
      onReset();

      let stepIndex = 0;
      setStatus(STEPS[stepIndex]);
      const timer = window.setInterval(() => {
        stepIndex = Math.min(stepIndex + 1, STEPS.length - 1);
        setStatus(STEPS[stepIndex]);
      }, 1200);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = (await res.json()) as UploadResponse | { error?: string };

        if (!res.ok) {
          throw new Error(data && "error" in data && data.error ? data.error : "Upload failed");
        }

        const ok = data as UploadResponse;
        setStatus("✅ Ready! Ask me anything.");
        onUploaded({
          filename: file.name,
          totalChunks: ok.totalChunks,
          collectionName: ok.collectionName,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(msg);
        setStatus("");
      } finally {
        window.clearInterval(timer);
        setIsUploading(false);
      }
    },
    [onUploaded, onReset]
  );

  const onBrowseChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadFile(file);
      e.target.value = "";
    },
    [uploadFile]
  );

  const onDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (isUploading) return;
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      await uploadFile(file);
    },
    [isUploading, uploadFile]
  );

  const activeCard = useMemo(() => {
    if (!active) return null;
    return (
      <div className="mt-6 rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--text)]">
              {active.filename}
            </div>
            <div className="mt-1 text-xs text-[var(--subtext)]">
              {active.totalChunks} chunks indexed
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            Active
          </span>
        </div>
        <button
          type="button"
          onClick={openPicker}
          className="mt-4 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--muted)]"
        >
          Upload a new document
        </button>
      </div>
    );
  }, [active, openPicker]);

  return (
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text)]">Document</h2>
      </div>

      <div
        onClick={openPicker}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] bg-white px-6 py-10 text-center shadow-sm hover:bg-[var(--muted)]"
        title={isUploading ? "Uploading…" : "Drop or click to upload"}
      >
        <div className="text-3xl">📎</div>
        <div className="mt-3 text-sm font-semibold text-[var(--text)]">
          Drop PDF or TXT here
        </div>
        <div className="mt-1 text-xs text-[var(--subtext)]">or click to browse</div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt"
          className="hidden"
          onChange={onBrowseChange}
          disabled={isUploading}
        />
      </div>

      {status ? (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-white p-4 text-sm text-[var(--text)] shadow-sm">
          <div className="flex items-center gap-2">
            <span
              className={
                isUploading
                  ? "inline-block h-2 w-2 animate-pulse rounded-full bg-brand"
                  : "inline-block h-2 w-2 rounded-full bg-emerald-500"
              }
            />
            <span className="font-medium">{status}</span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {activeCard}

      <div className="mt-auto pt-6 text-xs text-[var(--subtext)]">
        Max file size: 10MB. PDFs are parsed locally on the server.
      </div>
    </section>
  );
}
