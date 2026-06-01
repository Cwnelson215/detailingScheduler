export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookings, services } from "@/db/schema";
import { and, asc, eq, gte, ne, sql } from "drizzle-orm";
import { lookupSchema } from "@/lib/validations";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { issueViewToken, viewCookieHeader, normalizeEmail } from "@/lib/customer-session";

// Local (server-timezone) yyyy-mm-dd, matching how appointment_date is stored/compared.
function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// View tier: a customer enters only their email. We return their active/upcoming bookings
// (no Job ID, no numeric id — those stay secret) and set an email-scoped cookie that grants
// read-only access. Managing a booking then requires the Job ID + an emailed code.
export async function POST(request: NextRequest) {
  if (!rateLimit(`lookup:${getClientIp(request)}`, 10, 10 * 60 * 1000)) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);

  const rows = await db
    .select({
      token: bookings.confirmationToken,
      serviceName: services.name,
      appointmentDate: bookings.appointmentDate,
      appointmentTime: bookings.appointmentTime,
      dropoffWindow: bookings.dropoffWindow,
      status: bookings.status,
    })
    .from(bookings)
    .innerJoin(services, eq(bookings.serviceId, services.id))
    .where(
      and(
        // Emails are stored as the customer entered them (mixed case possible), so match
        // case-insensitively against the normalized (lowercased) input.
        eq(sql`lower(${bookings.customerEmail})`, email),
        ne(bookings.status, "cancelled"),
        gte(bookings.appointmentDate, todayStr()),
      ),
    )
    .orderBy(asc(bookings.appointmentDate));

  // Generic failure — same shape whether the email is unknown or simply has no upcoming
  // bookings. (Email-only lookup is inherently an enumeration oracle by product choice.)
  if (rows.length === 0) {
    return Response.json(
      { error: "No upcoming bookings found for that email." },
      { status: 404 },
    );
  }

  const token = issueViewToken(email);
  return Response.json(
    { bookings: rows.map((r) => ({ ...r, appointmentTime: r.appointmentTime.slice(0, 5) })) },
    { status: 200, headers: { "Set-Cookie": viewCookieHeader(token) } },
  );
}
