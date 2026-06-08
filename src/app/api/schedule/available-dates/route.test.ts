import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET, POST } from "@/app/api/schedule/available-dates/route";
import { getServerSession } from "next-auth";
import { db } from "@/db";
import { availableDates } from "@/db/schema";
import { resetDb, markAvailable } from "@/test/fixtures";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/schedule/available-dates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: "Admin" } } as never);
  await resetDb();
});

describe("GET /api/schedule/available-dates", () => {
  it("lists the opened dates in date order", async () => {
    await markAvailable("2030-02-02");
    await markAvailable("2030-01-01");
    const res = await GET();
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.map((r: { date: string }) => r.date)).toEqual(["2030-01-01", "2030-02-02"]);
  });
});

describe("POST /api/schedule/available-dates", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(postReq({ add: ["2030-01-01"], remove: [] }));
    expect(res.status).toBe(401);
  });

  it("400 on a malformed date", async () => {
    const res = await POST(postReq({ add: ["01-01-2030"], remove: [] }));
    expect(res.status).toBe(400);
  });

  it("applies add and remove in one call and returns the new set", async () => {
    await markAvailable("2030-03-03"); // pre-existing, will be removed
    const res = await POST(postReq({ add: ["2030-01-01", "2030-02-02"], remove: ["2030-03-03"] }));
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.map((r: { date: string }) => r.date)).toEqual(["2030-01-01", "2030-02-02"]);
  });

  it("re-adding an already-open date is a no-op (no duplicate)", async () => {
    await markAvailable("2030-01-01");
    const res = await POST(postReq({ add: ["2030-01-01"], remove: [] }));
    expect(res.status).toBe(200);
    const rows = await db.select().from(availableDates);
    expect(rows).toHaveLength(1);
  });
});
