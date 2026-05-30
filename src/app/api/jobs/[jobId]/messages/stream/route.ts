export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeJobId } from "@/lib/job-id";
import { requireCustomerBooking } from "@/lib/customer-session";
import { chatStreamResponse } from "@/lib/sse";

// Live message stream for the customer, authorized by the booking-scoped cookie (the only
// credential an EventSource can carry).
export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  const [booking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.jobId, normalizeJobId(params.jobId)));
  if (!booking) return Response.json({ error: "Booking not found" }, { status: 404 });
  if (!requireCustomerBooking(request, booking.id)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return chatStreamResponse(booking.id, request.signal);
}
