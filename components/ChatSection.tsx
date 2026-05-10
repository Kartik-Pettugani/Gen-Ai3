"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ChatResponse, QdrantResult } from "@/types";
import { MessageBubble } from "@/components/MessageBubble";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  isLoading?: boolean;
  sources?: Array<QdrantResult & { preview?: string }>;
};

function uid(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function ChatSection(props: {
  collectionName?: string | null;
  disabled?: boolean;
  resetSignal?: number;
}) {
  const { collectionName, disabled, resetSignal } = props;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    setMessages([]);
    setInput("");
    setIsSending(false);
  }, [resetSignal]);

  const canSend = !disabled && !!collectionName && input.trim().length > 0 && !isSending;

  const send = useCallback(async () => {
    if (!collectionName || !input.trim() || isSending) return;

    setIsSending(true);
    const question = input.trim();
    setInput("");

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text: question,
    };

    const assistantId = uid();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      text: "",
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, collectionName }),
      });

      const data = (await res.json()) as ChatResponse | { error?: string };
      if (!res.ok) {
        throw new Error(data && "error" in data && data.error ? data.error : "Chat failed");
      }

      const ok = data as ChatResponse;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                isLoading: false,
                text: ok.answer,
                sources: (ok.sources as Array<QdrantResult & { preview?: string }>).map((s) => ({
                  ...s,
                  preview: (s as any).preview ?? s.text.slice(0, 220),
                })),
              }
            : m
        )
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                isLoading: false,
                text: `Error: ${msg}`,
              }
            : m
        )
      );
    } finally {
      setIsSending(false);
    }
  }, [collectionName, input, isSending]);

  const tooltip = disabled || !collectionName ? "Upload a document first" : "";

  const content = useMemo(() => {
    if (messages.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-center text-sm text-[var(--subtext)]">
          Ask a question to start chatting with your document.
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            role={m.role}
            text={m.text}
            isLoading={m.isLoading}
            sources={m.sources}
          />
        ))}
      </div>
    );
  }, [messages]);

  return (
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text)]">Chat</h2>
      </div>

      <div
        ref={listRef}
        className="mt-4 flex-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm"
      >
        {content}
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={!!disabled || !collectionName || isSending}
            placeholder="Ask anything about your document..."
            className="flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-[var(--muted)]"
            title={tooltip}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!canSend}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            title={tooltip}
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
