export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { businessHours } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { businessHoursSchema } from "@/lib/validations";
import { requireAdmin } from "@/lib/require-admin";
import { z } from "zod";

export async function GET() {
  const hours = await db
    .select()
    .from(businessHours)
    .orderBy(asc(businessHours.dayOfWeek));
  return Response.json(hours);
}

export async function PUT(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json();
  const schema = z.array(businessHoursSchema);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  for (const item of parsed.data) {
    await db
      .update(businessHours)
      .set({
        openTime: item.openTime,
        closeTime: item.closeTime,
        isOpen: item.isOpen,
      })
      .where(eq(businessHours.dayOfWeek, item.dayOfWeek));
  }

  const updated = await db
    .select()
    .from(businessHours)
    .orderBy(asc(businessHours.dayOfWeek));
  return Response.json(updated);
}
