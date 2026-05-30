export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { chatMessageSchema } from "@/lib/validations";
import { normalizeJobId } from "@/lib/job-id";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { requireCustomerBooking } from "@/lib/customer-session";
import { createMessage, loadHistory, markRead } from "@/lib/chat";
import { sendCustomerMessageNotification } from "@/lib/email";

async function authorize(request: NextRequest, jobId: string) {
  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.jobId, normalizeJobId(jobId)));
  if (!booking) return { error: Response.json({ error: "Booking not found" }, { status: 404 }) };
  if (!requireCustomerBooking(request, booking.id)) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { booking };
}

// Customer reads their thread (and marks the owner's messages read).
export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  const { booking, error } = await authorize(request, params.jobId);
  if (error) return error;
  await markRead(booking.id, "owner");
  return Response.json(await loadHistory(booking.id));
}

// Customer sends a message; notify the owner by email (best-effort).
export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  if (!rateLimit(`chat:${getClientIp(request)}`, 30, 10 * 60 * 1000)) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  const { booking, error } = await authorize(request, params.jobId);
  if (error) return error;

  const body = await request.json().catch(() => null);
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const message = await createMessage(booking.id, "customer", parsed.data.body);

  try {
    await sendCustomerMessageNotification({
      bookingId: booking.id,
      jobId: booking.jobId ?? "",
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      snippet: parsed.data.body,
    });
  } catch (err) {
    console.error(`[chat] failed to notify owner of message for booking #${booking.id}:`, err);
  }

  return Response.json(message, { status: 201 });
}
