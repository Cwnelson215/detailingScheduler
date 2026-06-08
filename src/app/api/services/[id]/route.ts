import { NextRequest } from "next/server";
import { db } from "@/db";
import { services } from "@/db/schema";
import { eq } from "drizzle-orm";
import { serviceUpdateSchema } from "@/lib/validations";
import { requireAdmin } from "@/lib/require-admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = parseInt((await params).id);
  const body = await request.json();
  const parsed = serviceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(services)
    .set(parsed.data)
    .where(eq(services.id, id))
    .returning();

  if (!updated) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  return Response.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = parseInt((await params).id);
  const [deleted] = await db
    .delete(services)
    .where(eq(services.id, id))
    .returning();

  if (!deleted) {
    return Response.json({ error: "Service not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}
