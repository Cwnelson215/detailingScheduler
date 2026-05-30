import { EventEmitter } from "node:events";

// In-process pub/sub for live chat. Single-replica only: SSE subscribers and message
// publishers run in the same Node process, so an EventEmitter is sufficient. If the app is
// ever scaled out, replace this with a shared broker (e.g. Redis pub/sub) — see CLAUDE.md.
//
// Pinned on globalThis so Next.js HMR / module re-evaluation doesn't create a second
// emitter that publishers and subscribers wouldn't share (same trick as db/index.ts).

export type ChatMessage = {
  id: number;
  bookingId: number;
  sender: "customer" | "owner";
  body: string; // decrypted plaintext — published server-side after decrypt
  createdAt: string; // ISO string
};

const g = globalThis as unknown as { __chatBus?: EventEmitter };
if (!g.__chatBus) {
  const bus = new EventEmitter();
  // Each open SSE connection adds a listener; a busy thread can exceed the default 10.
  bus.setMaxListeners(0);
  g.__chatBus = bus;
}
const bus = g.__chatBus;

function channel(bookingId: number): string {
  return `booking:${bookingId}`;
}

export function publishMessage(message: ChatMessage): void {
  bus.emit(channel(message.bookingId), message);
}

// Subscribe to messages for a booking. Returns an unsubscribe function — callers MUST call
// it on disconnect (SSE abort) so listeners don't leak.
export function subscribe(bookingId: number, cb: (m: ChatMessage) => void): () => void {
  const ch = channel(bookingId);
  bus.on(ch, cb);
  return () => {
    bus.off(ch, cb);
  };
}

// Exposed for tests: how many subscribers a booking currently has.
export function listenerCount(bookingId: number): number {
  return bus.listenerCount(channel(bookingId));
}
