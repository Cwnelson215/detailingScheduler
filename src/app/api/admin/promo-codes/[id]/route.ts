import { NextRequest } from "next/server";
import { db } from "@/db";
import { promoCodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { promoCodeUpdateSchema } from "@/lib/validations";
import { requireAdmin } from "@/lib/require-admin";
import { isUniqueViolation } from "@/lib/db-errors";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = parseInt((await params).id);
  const body = await request.json();
  const parsed = promoCodeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(promoCodes)
      .set(parsed.data)
      .where(eq(promoCodes.id, id))
      .returning();
    if (!updated) {
      return Response.json({ error: "Promo code not found" }, { status: 404 });
    }
    return Response.json(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json({ error: "A promo code with that code already exists." }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const id = parseInt((await params).id);
  const [deleted] = await db.delete(promoCodes).where(eq(promoCodes.id, id)).returning();
  if (!deleted) {
    return Response.json({ error: "Promo code not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
