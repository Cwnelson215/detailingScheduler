import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { GET, PUT } from "@/app/api/schedule/hours/route";
import { getServerSession } from "next-auth";
import { db } from "@/db";
import { businessHours } from "@/db/schema";
import { resetDb } from "@/test/fixtures";

function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/schedule/hours", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// The seeded weekday row, tweaked per test.
const weekdayRow = {
  dayOfWeek: 1,
  isOpen: true,
  morningEnabled: true,
  morningStart: "07:00",
  morningEnd: "09:00",
  eveningEnabled: true,
  eveningStart: "15:00",
  eveningEnd: "17:00",
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: "Admin" } } as never);
  await resetDb();
});

describe("GET /api/schedule/hours", () => {
  it("returns one row per weekday with the window columns", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(7);
    const monday = rows.find((r: { dayOfWeek: number }) => r.dayOfWeek === 1);
    expect(monday).toMatchObject({ morningEnabled: true, eveningEnabled: true });
  });
});

describe("PUT /api/schedule/hours", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await PUT(putReq([weekdayRow]));
    expect(res.status).toBe(401);
  });

  it("persists window edits (disabling the evening window)", async () => {
    const res = await PUT(putReq([{ ...weekdayRow, eveningEnabled: false, eveningStart: null, eveningEnd: null }]));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(businessHours).where(eq(businessHours.dayOfWeek, 1));
    expect(row.eveningEnabled).toBe(false);
    expect(row.morningStart?.slice(0, 5)).toBe("07:00");
  });

  it("400 on an enabled window with start at/after its end", async () => {
    const res = await PUT(putReq([{ ...weekdayRow, morningStart: "09:00", morningEnd: "08:00" }]));
    expect(res.status).toBe(400);
  });
});
