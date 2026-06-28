export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { adminSettings } from "@/db/schema";
import { requireAdmin } from "@/lib/require-admin";
import { businessInfoSchema } from "@/lib/validations";
import { BUSINESS_INFO_KEYS } from "@/lib/business-info";

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json();
  const parsed = businessInfoSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rows = [
    { key: BUSINESS_INFO_KEYS.name, value: parsed.data.name },
    { key: BUSINESS_INFO_KEYS.address, value: parsed.data.address },
    { key: BUSINESS_INFO_KEYS.phone, value: parsed.data.phone },
  ];

  await db
    .insert(adminSettings)
    .values(rows)
    .onConflictDoUpdate({
      target: adminSettings.key,
      set: { value: sql`excluded.value` },
    });

  return Response.json({ ok: true, info: parsed.data });
}
