"use client";

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
};

// Module-level store — decoupled from React so `toast()` is callable from anywhere
// without a context provider (the same approach sonner uses). A single <Toaster />
// mounted in the root layout subscribes and renders.
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
let nextId = 1; // incrementing counter, not Date.now()/Math.random()

function emit() {
  for (const listener of listeners) listener();
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function push(message: string, variant: ToastVariant) {
  const id = nextId++;
  toasts = [...toasts, { id, message, variant }];
  emit();
  // Auto-dismiss after ~4s.
  setTimeout(() => dismiss(id), 4000);
}

export const toast = {
  success: (message: string) => push(message, "success"),
  error: (message: string) => push(message, "error"),
  info: (message: string) => push(message, "info"),
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return toasts;
}

const EMPTY: Toast[] = [];

const variantStyles: Record<ToastVariant, string> = {
  success: "border-green-600 bg-green-50 text-green-900",
  error: "border-destructive bg-red-50 text-red-900",
  info: "border-border bg-background text-foreground",
};

const variantIcons: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />,
  error: <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />,
  info: <Info className="h-5 w-5 shrink-0 text-muted-foreground" />,
};

export function Toaster() {
  const items = React.useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4 shadow-lg data-[state=open]:animate-in",
            variantStyles[t.variant],
          )}
        >
          {variantIcons[t.variant]}
          <p className="flex-1 text-sm font-medium">{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
