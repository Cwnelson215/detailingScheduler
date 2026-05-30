import { describe, it, expect, vi } from "vitest";
import { publishMessage, subscribe, listenerCount, type ChatMessage } from "./chat-bus";

function msg(bookingId: number, body = "hi"): ChatMessage {
  return { id: 1, bookingId, sender: "customer", body, createdAt: "2026-01-01T00:00:00.000Z" };
}

describe("chat-bus", () => {
  it("delivers a published message to a subscriber", () => {
    const cb = vi.fn();
    const unsub = subscribe(1, cb);
    publishMessage(msg(1, "hello"));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].body).toBe("hello");
    unsub();
  });

  it("stops delivery after unsubscribe and clears the listener", () => {
    const cb = vi.fn();
    const unsub = subscribe(2, cb);
    expect(listenerCount(2)).toBe(1);
    unsub();
    expect(listenerCount(2)).toBe(0);
    publishMessage(msg(2));
    expect(cb).not.toHaveBeenCalled();
  });

  it("isolates messages per booking", () => {
    const a = vi.fn();
    const b = vi.fn();
    const ua = subscribe(10, a);
    const ub = subscribe(11, b);
    publishMessage(msg(10));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    ua();
    ub();
  });
});
