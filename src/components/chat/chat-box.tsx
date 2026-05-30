"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Message = {
  id: number;
  sender: "customer" | "owner";
  body: string;
  createdAt: string;
};

type ChatBoxProps = {
  // API endpoints differ between the customer view and the admin view.
  historyUrl: string;
  sendUrl: string;
  streamUrl: string;
  // Which side "you" are, so own messages align right.
  self: "customer" | "owner";
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ChatBox({ historyUrl, sendUrl, streamUrl, self }: ChatBoxProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Append a message unless we already have its id (dedupes the SSE echo of our own send).
  const addMessage = useCallback((m: Message) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  // Initial history load.
  useEffect(() => {
    let cancelled = false;
    fetch(historyUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("history failed"))))
      .then((data: Message[]) => {
        if (!cancelled) setMessages(data);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load messages.");
      });
    return () => {
      cancelled = true;
    };
  }, [historyUrl]);

  // Live updates via SSE. EventSource reconnects automatically on transient errors.
  useEffect(() => {
    const es = new EventSource(streamUrl);
    es.onmessage = (e) => {
      try {
        addMessage(JSON.parse(e.data) as Message);
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => es.close();
  }, [streamUrl, addMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error("send failed");
      addMessage((await res.json()) as Message);
      setDraft("");
    } catch {
      setError("Couldn't send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-white">
      <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "28rem", minHeight: "16rem" }}>
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages yet. Send one to get started.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex flex-col", m.sender === self ? "items-end" : "items-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-2 text-sm",
                  m.sender === self
                    ? "bg-primary text-white"
                    : "bg-muted text-foreground",
                )}
              >
                {m.body}
              </div>
              <span className="mt-1 text-xs text-muted-foreground">{formatTime(m.createdAt)}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="border-t border-border p-3">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Type a message..."
            rows={2}
            className="resize-none"
          />
          <Button type="submit" disabled={sending || !draft.trim()}>
            {sending ? "..." : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
