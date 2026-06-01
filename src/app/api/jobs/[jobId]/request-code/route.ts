export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings, customerVerificationCodes } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { normalizeJobId } from "@/lib/job-id";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { readViewEmail, normalizeEmail } from "@/lib/customer-session";
import { sendVerificationCode } from "@/lib/email";
import { logger } from "@/lib/logger";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// Step-up part 1: the customer (already email-verified at the view tier) submits their Job ID
// to receive a one-time code. We confirm the Job ID belongs to *their* email, then email a
// fresh code. Generic success either way so a valid view session can't probe other Job IDs.
export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  if (!rateLimit(`code-req-ip:${getClientIp(request)}`, 10, 15 * 60 * 1000)) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const sessionEmail = readViewEmail(request);
  if (!sessionEmail) {
    return Response.json({ error: "Look up your booking first." }, { status: 401 });
  }

  const jobId = normalizeJobId(params.jobId);
  const [booking] = await db.select().from(bookings).where(eq(bookings.jobId, jobId));

  // Generic failure for unknown Job ID or one not on this email — no oracle.
  const ok = booking && normalizeEmail(booking.customerEmail) === sessionEmail;
  if (!ok) {
    return Response.json(
      { error: "We couldn't verify that Job ID for your email." },
      { status: 404 },
    );
  }

  // Per-booking throttle on top of the per-IP one, to prevent mail-bombing a customer.
  if (!rateLimit(`code-req-booking:${booking.id}`, 3, 15 * 60 * 1000)) {
    return Response.json({ error: "Too many code requests. Please try again later." }, { status: 429 });
  }

  // Invalidate any outstanding codes for this booking, then issue a fresh one.
  await db
    .update(customerVerificationCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(customerVerificationCodes.bookingId, booking.id),
        isNull(customerVerificationCodes.consumedAt),
      ),
    );

  const code = generateCode();
  await db.insert(customerVerificationCodes).values({
    bookingId: booking.id,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  try {
    await sendVerificationCode({
      customerEmail: booking.customerEmail,
      customerName: booking.customerName,
      code,
    });
  } catch (err) {
    logger.error("verification code send failed", { bookingId: booking.id, err: String(err) });
  }

  return Response.json({ ok: true });
}
