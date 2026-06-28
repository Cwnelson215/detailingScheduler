import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { POST } from "@/app/api/admin/password/route";
import { getServerSession } from "next-auth";
import { resetDb } from "@/test/fixtures";
import { __resetRateLimitState } from "@/lib/rate-limit";

// Valid-shaped body with a deliberately wrong current password: each call passes the
// rate limiter then fails the bcrypt check (403), so we can observe the limiter flip to
// 429 without needing to know the real password.
function req(ip: string) {
  return new NextRequest("http://localhost/api/admin/password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify({ currentPassword: "definitely-wrong", newPassword: "newpassword123" }),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  __resetRateLimitState();
  await resetDb();
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: "Admin" } } as never);
});

describe("POST /api/admin/password", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(req("5.5.5.5"));
    expect(res.status).toBe(401);
  });

  it("throttles to 5 attempts per IP, then 429s", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(req("1.2.3.4"));
      expect(res.status).toBe(403); // allowed through the limiter, fails on wrong password
    }
    const blocked = await POST(req("1.2.3.4"));
    expect(blocked.status).toBe(429);

    // A different IP still has its own budget.
    const other = await POST(req("9.9.9.9"));
    expect(other.status).toBe(403);
  });
});
