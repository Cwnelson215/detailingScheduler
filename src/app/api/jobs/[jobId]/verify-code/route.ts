export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings, customerVerificationCodes } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { verifyCodeSchema } from "@/lib/validations";
import { normalizeJobId } from "@/lib/job-id";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  readViewEmail,
  normalizeEmail,
  issueCustomerToken,
  customerCookieHeader,
  addTrustedBooking,
} from "@/lib/customer-session";

const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Step-up part 2: the customer submits the emailed code. On success we issue the manage
// cookie (cust_session) scoped to this booking, which authorizes /manage + /messages.
export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  if (!rateLimit(`code-verify:${getClientIp(request)}`, 20, 15 * 60 * 1000)) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const sessionEmail = readViewEmail(request);
  if (!sessionEmail) {
    return Response.json({ error: "Look up your booking first." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = verifyCodeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const jobId = normalizeJobId(params.jobId);
  const [booking] = await db.select().from(bookings).where(eq(bookings.jobId, jobId));
  if (!booking || normalizeEmail(booking.customerEmail) !== sessionEmail) {
    return Response.json({ error: "Invalid or expired code." }, { status: 400 });
  }

  // Most recent un-consumed code for this booking.
  const [code] = await db
    .select()
    .from(customerVerificationCodes)
    .where(
      and(
        eq(customerVerificationCodes.bookingId, booking.id),
        isNull(customerVerificationCodes.consumedAt),
      ),
    )
    .orderBy(desc(customerVerificationCodes.createdAt))
    .limit(1);

  if (!code || code.expiresAt.getTime() < Date.now()) {
    return Response.json({ error: "Invalid or expired code." }, { status: 400 });
  }
  if (code.attempts >= MAX_ATTEMPTS) {
    return Response.json(
      { error: "Too many incorrect attempts. Request a new code." },
      { status: 429 },
    );
  }

  if (!hashesEqual(code.codeHash, hashCode(parsed.data.code))) {
    await db
      .update(customerVerificationCodes)
      .set({ attempts: code.attempts + 1 })
      .where(eq(customerVerificationCodes.id, code.id));
    return Response.json({ error: "Invalid or expired code." }, { status: 400 });
  }

  await db
    .update(customerVerificationCodes)
    .set({ consumedAt: new Date() })
    .where(eq(customerVerificationCodes.id, code.id));

  // Issue the manage cookie and (re)plant the device-trust cookie, so this device can skip the
  // emailed code next time within the trust window. Two Set-Cookie headers require append().
  const headers = new Headers();
  headers.append("Set-Cookie", customerCookieHeader(issueCustomerToken(booking.id)));
  headers.append("Set-Cookie", addTrustedBooking(request, booking.id));
  return Response.json({ ok: true, jobId }, { status: 200, headers });
}
