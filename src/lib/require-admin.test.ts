import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

import { requireAdmin } from "@/lib/require-admin";
import { getServerSession } from "next-auth";
import { db } from "@/db";
import { adminSettings } from "@/db/schema";
import { DEFAULT_ADMIN_PASSWORD_HASH } from "@/lib/admin-password";
import { resetDb } from "@/test/fixtures";

async function setPasswordHash(value: string) {
  await db
    .update(adminSettings)
    .set({ value })
    .where(eq(adminSettings.key, "admin_password_hash"));
}

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb(); // normalizes to a rotated (non-default) password
});

describe("requireAdmin", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await requireAdmin();
    expect(res?.status).toBe(401);
  });

  it("403 while the seeded default admin password is still in place", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { name: "Admin" } } as never);
    await setPasswordHash(DEFAULT_ADMIN_PASSWORD_HASH);
    const res = await requireAdmin();
    expect(res?.status).toBe(403);
  });

  it("allows the request once authed and the password has been rotated", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { name: "Admin" } } as never);
    const res = await requireAdmin(); // resetDb already rotated the hash
    expect(res).toBeNull();
  });
});
