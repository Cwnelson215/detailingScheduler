import { describe, it, expect, vi } from "vitest";
import { rateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit, then blocks", () => {
    const key = `allow-${Math.random()}`;
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(false);
  });

  it("resets once the window elapses", () => {
    vi.useFakeTimers();
    try {
      const key = `reset-${Math.random()}`;
      expect(rateLimit(key, 1, 1000)).toBe(true);
      expect(rateLimit(key, 1, 1000)).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(rateLimit(key, 1, 1000)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tracks keys independently", () => {
    const a = `k-${Math.random()}`;
    const b = `k-${Math.random()}`;
    expect(rateLimit(a, 1, 60_000)).toBe(true);
    expect(rateLimit(a, 1, 60_000)).toBe(false);
    expect(rateLimit(b, 1, 60_000)).toBe(true);
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers x-real-ip", () => {
    const h: Record<string, string> = {
      "x-real-ip": "9.9.9.9",
      "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    };
    expect(clientIpFromHeaders((n) => h[n])).toBe("9.9.9.9");
  });

  it("falls back to the LAST x-forwarded-for entry (the trusted proxy hop)", () => {
    const h: Record<string, string> = { "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" };
    expect(clientIpFromHeaders((n) => h[n])).toBe("3.3.3.3");
  });

  it("returns 'unknown' when no IP headers are present", () => {
    expect(clientIpFromHeaders(() => undefined)).toBe("unknown");
  });
});
