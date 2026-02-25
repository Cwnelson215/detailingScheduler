export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { blockedDates } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

export async function GET() {
  const dates = await db
    .select()
    .from(blockedDates)
    .orderBy(asc(blockedDates.date));
  return Response.json(dates);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().max(255).default(""),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [blocked] = await db.insert(blockedDates).values(parsed.data).returning();
  return Response.json(blocked, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(blockedDates)
    .where(eq(blockedDates.id, parseInt(id)))
    .returning();

  if (!deleted) {
    return Response.json({ error: "Blocked date not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}
