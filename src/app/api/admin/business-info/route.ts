export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { adminSettings } from "@/db/schema";
import { authOptions } from "@/lib/auth";
import { businessInfoSchema } from "@/lib/validations";
import { BUSINESS_INFO_KEYS } from "@/lib/business-info";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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
