export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { chatMessageSchema } from "@/lib/validations";
import { requireAdmin } from "@/lib/require-admin";
import { createMessage, loadHistory, markRead } from "@/lib/chat";
import { sendOwnerReplyNotification } from "@/lib/email";
import { logger } from "@/lib/logger";

function parseBookingId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}

// Admin reads a thread (and marks the customer's messages read).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const bookingId = parseBookingId((await params).bookingId);
  if (bookingId === null) return Response.json({ error: "Invalid booking id" }, { status: 400 });

  await markRead(bookingId, "customer");
  return Response.json(await loadHistory(bookingId));
}

// Admin replies; notify the customer by email (best-effort, env-gated).
export async function POST(request: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const bookingId = parseBookingId((await params).bookingId);
  if (bookingId === null) return Response.json({ error: "Invalid booking id" }, { status: 400 });

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!booking) return Response.json({ error: "Booking not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const message = await createMessage(bookingId, "owner", parsed.data.body);

  try {
    await sendOwnerReplyNotification({
      jobId: booking.jobId ?? "",
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      snippet: parsed.data.body,
    });
  } catch (err) {
    logger.error("chat customer-notify failed", { bookingId, err: String(err) });
  }

  return Response.json(message, { status: 201 });
}
