export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { promoCodes } from "@/db/schema";
import { desc } from "drizzle-orm";
import { promoCodeSchema } from "@/lib/validations";
import { requireAdmin } from "@/lib/require-admin";
import { isUniqueViolation } from "@/lib/db-errors";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const result = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
  return Response.json(result);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json();
  const parsed = promoCodeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const [created] = await db
      .insert(promoCodes)
      .values({
        code: parsed.data.code,
        description: parsed.data.description,
        percentOff: parsed.data.percentOff,
        maxUses: parsed.data.maxUses ?? null,
        expiresAt: parsed.data.expiresAt ?? null,
        isActive: parsed.data.isActive,
      })
      .returning();
    return Response.json(created, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json({ error: "A promo code with that code already exists." }, { status: 409 });
    }
    throw err;
  }
}
