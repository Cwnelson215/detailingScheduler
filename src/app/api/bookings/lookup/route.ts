export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { lookupSchema } from "@/lib/validations";
import { normalizeJobId } from "@/lib/job-id";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { issueCustomerToken, customerCookieHeader } from "@/lib/customer-session";

// Constant-time, length-independent string compare so the response timing doesn't reveal
// whether the email matched (vs. e.g. the Job ID being unknown).
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still run a compare of equal-length buffers to keep timing flat, then fail.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

// Customer authenticates with Job ID + the email on the booking (two factors). On success
// we set an httpOnly, booking-scoped cookie that authorizes the manage + chat endpoints
// (including the SSE stream, which can only carry cookies).
export async function POST(request: NextRequest) {
  if (!rateLimit(`lookup:${getClientIp(request)}`, 10, 10 * 60 * 1000)) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const jobId = normalizeJobId(parsed.data.jobId);
  const email = parsed.data.email.trim().toLowerCase();

  const [booking] = await db.select().from(bookings).where(eq(bookings.jobId, jobId));

  // Single generic failure for both unknown Job ID and wrong email — no enumeration oracle.
  const emailMatches = booking ? safeEqual(booking.customerEmail.trim().toLowerCase(), email) : false;
  if (!booking || !emailMatches) {
    return Response.json(
      { error: "We couldn't find a booking matching that Job ID and email." },
      { status: 404 },
    );
  }

  const token = issueCustomerToken(booking.id);
  return Response.json(
    { jobId },
    { status: 200, headers: { "Set-Cookie": customerCookieHeader(token) } },
  );
}
