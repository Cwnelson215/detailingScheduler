import { NextRequest } from "next/server";
import { db } from "@/db";
import { services } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  const body = await request.json();

  const allowedFields = ["name", "description", "durationMins", "priceCents", "isActive", "sortOrder"];
  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(services)
    .set(updates)
    .where(eq(services.id, id))
    .returning();

  if (!updated) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  const [deleted] = await db
    .delete(services)
    .where(eq(services.id, id))
    .returning();

  if (!deleted) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}
