export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notifyBookingStatus } from "@/lib/email";

// Customer-facing cancellation. Token-guarded rather than session-guarded: the
// unguessable confirmation token (emailed to the customer) is the bearer credential,
// so no admin login is required.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = body?.token;
  if (typeof token !== "string" || token.length === 0) {
    return Response.json({ error: "Missing token" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.confirmationToken, token));
  if (!existing) {
    return Response.json({ error: "Booking not found" }, { status: 404 });
  }
  if (existing.status === "cancelled") {
    return Response.json({ status: "cancelled" });
  }
  if (existing.status === "completed") {
    return Response.json(
      { error: "This booking can no longer be cancelled." },
      { status: 409 },
    );
  }

  const [updated] = await db
    .update(bookings)
    .set({ status: "cancelled" })
    .where(eq(bookings.id, existing.id))
    .returning();

  await notifyBookingStatus(updated, "cancelled");

  return Response.json({ status: "cancelled" });
}
