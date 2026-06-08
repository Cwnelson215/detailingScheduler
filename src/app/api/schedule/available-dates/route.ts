export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { availableDates, businessHours } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/require-admin";
import { availableDateWindowsSchema } from "@/lib/validations";
import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function GET() {
  const dates = await db
    .select()
    .from(availableDates)
    .orderBy(asc(availableDates.date));
  return Response.json(dates);
}

// Batch diff apply for the admin multi-select calendar: open the `add` dates and close the
// `remove` dates in one transaction. Newly opened dates are seeded with their weekday
// template's windows (so the date is immediately bookable). Re-opening is a no-op — it never
// resets a date whose windows the admin has since edited.
export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json();
  const schema = z.object({
    add: z.array(dateStr).default([]),
    remove: z.array(dateStr).default([]),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const add = [...new Set(parsed.data.add)];
  const remove = [...new Set(parsed.data.remove)];

  await db.transaction(async (tx) => {
    if (add.length > 0) {
      const hours = await tx.select().from(businessHours);
      const byDay = new Map(hours.map((h) => [h.dayOfWeek, h]));
      const values = add.map((date) => {
        const t = byDay.get(new Date(date + "T00:00:00").getDay());
        // A closed weekday (isOpen=false) seeds no windows; the admin opens them per date.
        const open = t?.isOpen ?? false;
        return {
          date,
          morningEnabled: open ? (t?.morningEnabled ?? false) : false,
          morningStart: open ? t?.morningStart ?? null : null,
          morningEnd: open ? t?.morningEnd ?? null : null,
          eveningEnabled: open ? (t?.eveningEnabled ?? false) : false,
          eveningStart: open ? t?.eveningStart ?? null : null,
          eveningEnd: open ? t?.eveningEnd ?? null : null,
        };
      });
      await tx
        .insert(availableDates)
        .values(values)
        .onConflictDoNothing({ target: availableDates.date });
    }
    if (remove.length > 0) {
      await tx.delete(availableDates).where(inArray(availableDates.date, remove));
    }
  });

  const dates = await db
    .select()
    .from(availableDates)
    .orderBy(asc(availableDates.date));
  return Response.json(dates);
}

// Edit the drop-off windows of already-opened dates (per-date authoritative). Accepts an
// array, one object per date, mirroring the weekday hours PUT. Dates not in the allowlist are
// ignored (a 0-row update is harmless).
export async function PUT(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json();
  const parsed = z.array(availableDateWindowsSchema).safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  for (const item of parsed.data) {
    await db
      .update(availableDates)
      .set({
        morningEnabled: item.morningEnabled,
        morningStart: item.morningStart,
        morningEnd: item.morningEnd,
        eveningEnabled: item.eveningEnabled,
        eveningStart: item.eveningStart,
        eveningEnd: item.eveningEnd,
      })
      .where(eq(availableDates.date, item.date));
  }

  const dates = await db
    .select()
    .from(availableDates)
    .orderBy(asc(availableDates.date));
  return Response.json(dates);
}
