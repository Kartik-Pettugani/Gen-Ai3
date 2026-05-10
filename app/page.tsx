"use client";

import { useCallback, useState } from "react";

import { ChatSection } from "@/components/ChatSection";
import { UploadSection } from "@/components/UploadSection";

type ActiveDoc = {
  filename: string;
  totalChunks: number;
  collectionName: string;
};

export default function Home() {
  const [active, setActive] = useState<ActiveDoc | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  const onUploaded = useCallback((doc: ActiveDoc) => {
    setActive(doc);
    setResetSignal((n) => n + 1);
  }, []);

  const onReset = useCallback(() => {
    setActive(null);
    setResetSignal((n) => n + 1);
  }, []);

  return (
    <div className="flex flex-1 bg-[var(--muted)]">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 lg:py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-[var(--text)]">NotebookLM Clone</div>
            <div className="text-sm text-[var(--subtext)]">Upload a document and ask grounded questions.</div>
          </div>
          <div className="text-xs text-[var(--subtext)]">
            Powered by Gemini + Qdrant (free tier)
          </div>
        </header>

        <main className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
            <UploadSection active={active} onUploaded={onUploaded} onReset={onReset} />
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-sm">
            <ChatSection
              collectionName={active?.collectionName ?? null}
              disabled={!active?.collectionName}
              resetSignal={resetSignal}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
