import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[id]/route";
import { db } from "@/db";
import { promoCodes } from "@/db/schema";
import { resetDb, seedPromoCode } from "@/test/fixtures";
import { getServerSession } from "next-auth";

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/admin/promo-codes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function patchReq(id: number, body: unknown) {
  return new NextRequest(`http://localhost/api/admin/promo-codes/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function delReq(id: number) {
  return new NextRequest(`http://localhost/api/admin/promo-codes/${id}`, { method: "DELETE" });
}
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

function authed() {
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: "Admin" } } as never);
}

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb();
});

describe("admin promo-codes API", () => {
  it("401 on create when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(postReq({ code: "X", percentOff: 10 }));
    expect(res.status).toBe(401);
  });

  it("creates a promo code (uppercased, with max uses)", async () => {
    authed();
    const res = await POST(postReq({ code: "launch10", percentOff: 10, maxUses: 5 }));
    expect(res.status).toBe(201);
    const [row] = await db.select().from(promoCodes);
    expect(row.code).toBe("LAUNCH10");
    expect(row.percentOff).toBe(10);
    expect(row.maxUses).toBe(5);
    expect(row.usedCount).toBe(0);
  });

  it("rejects a duplicate code with 409", async () => {
    authed();
    await seedPromoCode({ code: "DUP", percentOff: 10 });
    const res = await POST(postReq({ code: "DUP", percentOff: 20 }));
    expect(res.status).toBe(409);
  });

  it("400 on invalid input (percent out of range)", async () => {
    authed();
    const res = await POST(postReq({ code: "BAD", percentOff: 0 }));
    expect(res.status).toBe(400);
  });

  it("lists codes when authenticated", async () => {
    authed();
    await seedPromoCode({ code: "A", percentOff: 10 });
    await seedPromoCode({ code: "B", percentOff: 20 });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("updates a code", async () => {
    authed();
    const p = await seedPromoCode({ code: "EDIT", percentOff: 10 });
    const res = await PATCH(patchReq(p.id, { isActive: false }), ctx(p.id));
    expect(res.status).toBe(200);
    const [row] = await db.select().from(promoCodes).where(eq(promoCodes.id, p.id));
    expect(row.isActive).toBe(false);
  });

  it("deletes a code", async () => {
    authed();
    const p = await seedPromoCode({ code: "GONE", percentOff: 10 });
    const res = await DELETE(delReq(p.id), ctx(p.id));
    expect(res.status).toBe(200);
    expect(await db.select().from(promoCodes)).toHaveLength(0);
  });
});
