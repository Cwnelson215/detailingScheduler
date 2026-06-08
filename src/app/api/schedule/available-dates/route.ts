export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { availableDates } from "@/db/schema";
import { asc, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/require-admin";
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
// `remove` dates in one transaction. Re-opening an already-open date is a no-op.
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
      await tx
        .insert(availableDates)
        .values(add.map((date) => ({ date })))
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
