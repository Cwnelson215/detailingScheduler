export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminSettings } from "@/db/schema";
import { authOptions } from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validations";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Throttle even though the route is auth-gated: caps how fast a compromised session
  // can brute-force the current password (the change requires it) or thrash the hash.
  if (!rateLimit(`pw-change:${getClientIp(request)}`, 5, 15 * 60 * 1000)) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(adminSettings)
    .where(eq(adminSettings.key, "admin_password_hash"));

  if (!row) {
    return Response.json({ error: "Admin password not initialized" }, { status: 500 });
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, row.value);
  if (!valid) {
    return Response.json({ error: "Current password is incorrect" }, { status: 403 });
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db
    .update(adminSettings)
    .set({ value: newHash })
    .where(eq(adminSettings.key, "admin_password_hash"));

  return Response.json({ ok: true });
}
