"use client";

import { useMemo } from "react";

type Role = "user" | "assistant";

type SourceItem = {
  chunkIndex: number;
  pageApprox: number;
  source?: string;
  preview?: string;
  score?: number;
};

export function MessageBubble(props: {
  role: Role;
  text: string;
  isLoading?: boolean;
  sources?: SourceItem[];
}) {
  const { role, text, isLoading, sources } = props;

  const bubbleClass =
    role === "user"
      ? "bg-brand text-white"
      : "bg-white border border-[var(--border)] text-[var(--text)]";

  const containerClass = role === "user" ? "justify-end" : "justify-start";

  const dots = useMemo(() => {
    if (!isLoading) return null;
    return (
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--subtext)] [animation-delay:-0.2s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--subtext)] [animation-delay:-0.1s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--subtext)]" />
      </span>
    );
  }, [isLoading]);

  return (
    <div className={`flex ${containerClass}`}>
      <div className={`max-w-[85%] rounded-xl px-4 py-3 shadow-sm ${bubbleClass}`}>
        <div className="whitespace-pre-wrap leading-7">
          {isLoading ? dots : text}
        </div>

        {role === "assistant" && sources && sources.length > 0 && !isLoading ? (
          <details className="mt-3 rounded-lg bg-[var(--muted)] px-3 py-2">
            <summary className="cursor-pointer select-none text-sm font-medium text-[var(--subtext)]">
              Sources
            </summary>
            <div className="mt-2 space-y-2">
              {sources.map((s) => (
                <div
                  key={`${s.source ?? "doc"}-${s.chunkIndex}-${s.pageApprox}`}
                  className="rounded-lg bg-white p-3 text-sm text-[var(--text)] shadow-sm"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--subtext)]">
                    <span className="font-medium">chunk {s.chunkIndex}</span>
                    <span>page ~{s.pageApprox}</span>
                    {s.source ? <span className="truncate">{s.source}</span> : null}
                  </div>
                  {s.preview ? (
                    <div className="mt-2 whitespace-pre-wrap leading-6 text-[var(--text)]">
                      {s.preview}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
