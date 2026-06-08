export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { normalizeJobId } from "@/lib/job-id";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  isDeviceTrustedFor,
  issueCustomerToken,
  customerCookieHeader,
  addTrustedBooking,
} from "@/lib/customer-session";

// Trusted-device fast path: a customer on the device that created this booking (or that already
// passed the emailed-code step-up) can unlock the manage tier by supplying only the Job ID —
// the device-trust cookie stands in for the emailed code. Unlike request-code/verify-code this
// does NOT require a prior email lookup (cust_view): the device cookie is the proof, so it works
// straight off the confirmation page. Any device without the cookie gets { needsCode: true } and
// falls back to the emailed code. The generic 403 also avoids leaking which Job IDs exist.
export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  if (!rateLimit(`trusted-unlock:${getClientIp(request)}`, 20, 15 * 60 * 1000)) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const jobId = normalizeJobId(params.jobId);
  const [booking] = await db.select().from(bookings).where(eq(bookings.jobId, jobId));

  if (!booking || !isDeviceTrustedFor(request, booking.id)) {
    return Response.json({ needsCode: true }, { status: 403 });
  }

  // Issue the manage cookie and refresh the device-trust cookie (sliding window).
  const headers = new Headers();
  headers.append("Set-Cookie", customerCookieHeader(issueCustomerToken(booking.id)));
  headers.append("Set-Cookie", addTrustedBooking(request, booking.id));
  return Response.json({ ok: true, jobId }, { status: 200, headers });
}
