import { describe, it, expect, afterEach, vi } from "vitest";
import { GET } from "@/app/ready/route";
import { db } from "@/db";

describe("GET /ready", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 {status: ready} when the DB answers", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });

  it("returns 503 {status: db_unavailable} when the DB query throws", async () => {
    vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("connection refused"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "db_unavailable" });
  });
});
