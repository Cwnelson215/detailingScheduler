import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { services } from "@/db/schema";
import { formatCurrency, formatDuration } from "./utils";
import { getBusinessInfo } from "./business-info";

type ContactMessageInput = {
  name: string;
  email: string;
  message: string;
};

type BookingEmailInput = {
  bookingId: number;
  jobId?: string;
  serviceName: string;
  priceCents: number;
  durationMins: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  appointmentDate: string;
  appointmentTime: string;
  manageUrl?: string;
};

function siteUrl(): string {
  return process.env.SITE_URL || "https://detailing.cwnel.com";
}

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function formatDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Escapes both cells, so every caller passing user-controlled values (customer name,
// vehicle, contact fields) is safe from HTML injection without escaping at each call site.
function tableHtml(rows: [string, string][]): string {
  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;color:#666;">${escapeHtml(k)}</td><td style="padding:6px 12px;font-weight:600;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;border:1px solid #eee;border-radius:6px;overflow:hidden;margin-top:16px;">
    ${tableRows}
  </table>`;
}

function bookingRows(b: BookingEmailInput): [string, string][] {
  return [
    ["Booking #", String(b.bookingId)],
    ...(b.jobId ? ([["Job ID", b.jobId]] as [string, string][]) : []),
    ["Service", b.serviceName],
    ["Price", formatCurrency(b.priceCents)],
    ["Date", formatDate(b.appointmentDate)],
    ["Time", formatTime(b.appointmentTime)],
    ["Duration", formatDuration(b.durationMins)],
    ["Vehicle", `${b.vehicleYear} ${b.vehicleMake} ${b.vehicleModel}`],
  ];
}

function renderHtml(b: BookingEmailInput): string {
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;margin-bottom:4px;">Booking Confirmed</h1>
  <p style="color:#555;margin-top:0;">Thanks ${escapeHtml(b.customerName)} — your appointment is on the books.</p>
  ${tableHtml(bookingRows(b))}
  ${b.manageUrl ? `<p style="color:#555;margin-top:24px;">Need to make a change? <a href="${b.manageUrl}">Manage your booking</a>.</p>` : ""}
  ${b.jobId ? `<p style="color:#555;margin-top:8px;">Or look it up anytime with your Job ID <strong>${escapeHtml(b.jobId)}</strong> and this email address at <a href="${siteUrl()}/lookup">${siteUrl()}/lookup</a> — where you can also reschedule, cancel, or message us directly.</p>` : ""}
  <p style="color:#555;margin-top:24px;">We'll reach out at ${escapeHtml(b.customerPhone)} if anything changes. Reply to this email with questions.</p>
</body></html>`;
}

function renderText(b: BookingEmailInput): string {
  return [
    `Booking Confirmed`,
    ``,
    `Thanks ${b.customerName} — your appointment is on the books.`,
    ``,
    `Booking #: ${b.bookingId}`,
    `Service:   ${b.serviceName}`,
    `Price:     ${formatCurrency(b.priceCents)}`,
    `Date:      ${formatDate(b.appointmentDate)}`,
    `Time:      ${formatTime(b.appointmentTime)}`,
    `Duration:  ${formatDuration(b.durationMins)}`,
    `Vehicle:   ${b.vehicleYear} ${b.vehicleMake} ${b.vehicleModel}`,
    ``,
    ...(b.manageUrl ? [`Manage your booking: ${b.manageUrl}`, ``] : []),
    ...(b.jobId
      ? [`Or look it up with Job ID ${b.jobId} + this email at ${siteUrl()}/lookup`, ``]
      : []),
    `We'll reach out at ${b.customerPhone} if anything changes.`,
  ].join("\n");
}

function renderOwnerHtml(b: BookingEmailInput): string {
  const rows: [string, string][] = [
    ...bookingRows(b),
    ["Customer", b.customerName],
    ["Email", b.customerEmail],
    ["Phone", b.customerPhone],
  ];
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;margin-bottom:4px;">New Booking</h1>
  <p style="color:#555;margin-top:0;">A new appointment was just booked. Reply to this email to reach ${escapeHtml(b.customerName)} directly.</p>
  ${tableHtml(rows)}
</body></html>`;
}

function renderOwnerText(b: BookingEmailInput): string {
  return [
    `New Booking`,
    ``,
    `Booking #: ${b.bookingId}`,
    `Service:   ${b.serviceName}`,
    `Price:     ${formatCurrency(b.priceCents)}`,
    `Date:      ${formatDate(b.appointmentDate)}`,
    `Time:      ${formatTime(b.appointmentTime)}`,
    `Duration:  ${formatDuration(b.durationMins)}`,
    `Vehicle:   ${b.vehicleYear} ${b.vehicleMake} ${b.vehicleModel}`,
    ``,
    `Customer:  ${b.customerName}`,
    `Email:     ${b.customerEmail}`,
    `Phone:     ${b.customerPhone}`,
  ].join("\n");
}

export async function sendBookingConfirmation(input: BookingEmailInput): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.log(
      `[email] RESEND_API_KEY not set — skipping confirmation email for booking #${input.bookingId} to ${input.customerEmail}`,
    );
    return;
  }

  const { name: businessName } = await getBusinessInfo();
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";
  const replyTo = process.env.EMAIL_REPLY_TO;

  const { error } = await resend.emails.send({
    from,
    to: input.customerEmail,
    ...(replyTo ? { replyTo } : {}),
    subject: `${businessName} — booking confirmed for ${formatDate(input.appointmentDate)} at ${formatTime(input.appointmentTime)}`,
    html: renderHtml(input),
    text: renderText(input),
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
}

function renderContactHtml(c: ContactMessageInput): string {
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;margin-bottom:4px;">New Message</h1>
  <p style="color:#555;margin-top:0;">Someone reached out from your website. Reply to this email to respond to ${escapeHtml(c.name)} directly.</p>
  ${tableHtml([
    ["Name", c.name],
    ["Email", c.email],
  ])}
  <p style="color:#555;margin-top:24px;white-space:pre-line;">${escapeHtml(c.message)}</p>
</body></html>`;
}

function renderContactText(c: ContactMessageInput): string {
  return [
    `New Message`,
    ``,
    `Name:  ${c.name}`,
    `Email: ${c.email}`,
    ``,
    c.message,
  ].join("\n");
}

export async function sendContactMessage(input: ContactMessageInput): Promise<void> {
  const notifyTo = process.env.BOOKING_NOTIFY_EMAIL;
  if (!notifyTo) {
    console.log(
      `[email] BOOKING_NOTIFY_EMAIL not set — skipping contact message from ${input.email}`,
    );
    return;
  }

  const resend = getResend();
  if (!resend) {
    console.log(
      `[email] RESEND_API_KEY not set — skipping contact message from ${input.email}`,
    );
    return;
  }

  const { name: businessName } = await getBusinessInfo();
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

  const { error } = await resend.emails.send({
    from,
    to: notifyTo,
    replyTo: input.email,
    subject: `${businessName} — new message from ${input.name}`,
    html: renderContactHtml(input),
    text: renderContactText(input),
  });

  if (error) {
    throw new Error(`Resend contact message failed: ${error.message}`);
  }
}

type BookingStatusKind = "confirmed" | "cancelled" | "rescheduled" | "reminder";

const statusCopy: Record<BookingStatusKind, { heading: string; subject: string; intro: string }> = {
  confirmed: {
    heading: "Booking Confirmed",
    subject: "your appointment is confirmed",
    intro: "your appointment is confirmed. Here are the details:",
  },
  cancelled: {
    heading: "Booking Cancelled",
    subject: "your appointment was cancelled",
    intro:
      "your appointment has been cancelled. If this wasn't expected, just reply to this email and we'll sort it out.",
  },
  rescheduled: {
    heading: "Booking Rescheduled",
    subject: "your appointment was rescheduled",
    intro: "your appointment has been moved. Here are the new details:",
  },
  reminder: {
    heading: "Appointment Reminder",
    subject: "a reminder about your upcoming appointment",
    intro: "this is a reminder about your upcoming appointment:",
  },
};

export async function sendBookingStatusUpdate(
  input: BookingEmailInput,
  kind: BookingStatusKind,
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.log(
      `[email] RESEND_API_KEY not set — skipping ${kind} email for booking #${input.bookingId} to ${input.customerEmail}`,
    );
    return;
  }

  const copy = statusCopy[kind];
  const { name: businessName } = await getBusinessInfo();
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";
  const replyTo = process.env.EMAIL_REPLY_TO;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;margin-bottom:4px;">${copy.heading}</h1>
  <p style="color:#555;margin-top:0;">Hi ${escapeHtml(input.customerName)} — ${copy.intro}</p>
  ${tableHtml(bookingRows(input))}
  <p style="color:#555;margin-top:24px;">Questions? Just reply to this email.</p>
</body></html>`;

  const text = [
    copy.heading,
    ``,
    `Hi ${input.customerName} — ${copy.intro}`,
    ``,
    ...bookingRows(input).map(([k, v]) => `${k}: ${v}`),
    ``,
    `Questions? Just reply to this email.`,
  ].join("\n");

  const { error } = await resend.emails.send({
    from,
    to: input.customerEmail,
    ...(replyTo ? { replyTo } : {}),
    subject: `${businessName} — ${copy.subject} (${formatDate(input.appointmentDate)} at ${formatTime(input.appointmentTime)})`,
    html,
    text,
  });

  if (error) {
    throw new Error(`Resend ${kind} email failed: ${error.message}`);
  }
}

export async function sendOwnerNotification(input: BookingEmailInput): Promise<void> {
  const notifyTo = process.env.BOOKING_NOTIFY_EMAIL;
  if (!notifyTo) {
    console.log(
      `[email] BOOKING_NOTIFY_EMAIL not set — skipping owner notification for booking #${input.bookingId}`,
    );
    return;
  }

  const resend = getResend();
  if (!resend) {
    console.log(
      `[email] RESEND_API_KEY not set — skipping owner notification for booking #${input.bookingId}`,
    );
    return;
  }

  const { name: businessName } = await getBusinessInfo();
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";

  const { error } = await resend.emails.send({
    from,
    to: notifyTo,
    replyTo: input.customerEmail,
    subject: `${businessName} — new booking #${input.bookingId} for ${formatDate(input.appointmentDate)} at ${formatTime(input.appointmentTime)}`,
    html: renderOwnerHtml(input),
    text: renderOwnerText(input),
  });

  if (error) {
    throw new Error(`Resend owner notification failed: ${error.message}`);
  }
}

// --- Chat message notifications ---

type CustomerMessageNotifyInput = {
  bookingId: number;
  jobId: string;
  customerName: string;
  customerEmail: string;
  snippet: string;
};

// Owner-facing: a customer sent a chat message about their booking. Reply-to is the
// customer so the owner can also just reply by email. Skips gracefully when unconfigured.
export async function sendCustomerMessageNotification(
  input: CustomerMessageNotifyInput,
): Promise<void> {
  const notifyTo = process.env.BOOKING_NOTIFY_EMAIL;
  if (!notifyTo) {
    console.log(
      `[email] BOOKING_NOTIFY_EMAIL not set — skipping message notification for booking #${input.bookingId}`,
    );
    return;
  }
  const resend = getResend();
  if (!resend) {
    console.log(
      `[email] RESEND_API_KEY not set — skipping message notification for booking #${input.bookingId}`,
    );
    return;
  }

  const { name: businessName } = await getBusinessInfo();
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";
  const threadUrl = `${siteUrl()}/admin/messages/${input.bookingId}`;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;margin-bottom:4px;">New Message</h1>
  <p style="color:#555;margin-top:0;">${escapeHtml(input.customerName)} sent a message about booking #${input.bookingId} (Job ID ${escapeHtml(input.jobId)}). Reply to this email to reach them directly, or open the thread in your admin.</p>
  <p style="color:#111;margin-top:16px;white-space:pre-line;border-left:3px solid #eee;padding-left:12px;">${escapeHtml(input.snippet)}</p>
  <p style="color:#555;margin-top:24px;"><a href="${threadUrl}">Open conversation</a></p>
</body></html>`;
  const text = [
    `New Message`,
    ``,
    `${input.customerName} sent a message about booking #${input.bookingId} (Job ID ${input.jobId}):`,
    ``,
    input.snippet,
    ``,
    `Open conversation: ${threadUrl}`,
  ].join("\n");

  const { error } = await resend.emails.send({
    from,
    to: notifyTo,
    replyTo: input.customerEmail,
    subject: `${businessName} — new message from ${input.customerName} (booking #${input.bookingId})`,
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend message notification failed: ${error.message}`);
  }
}

type OwnerReplyNotifyInput = {
  jobId: string;
  customerName: string;
  customerEmail: string;
  snippet: string;
};

// Customer-facing: the owner replied in chat. Lets the customer know without keeping the
// chat open. Skips gracefully when unconfigured.
export async function sendOwnerReplyNotification(input: OwnerReplyNotifyInput): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.log(
      `[email] RESEND_API_KEY not set — skipping owner-reply notification to ${input.customerEmail}`,
    );
    return;
  }

  const { name: businessName } = await getBusinessInfo();
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";
  const replyTo = process.env.EMAIL_REPLY_TO;
  const threadUrl = `${siteUrl()}/lookup`;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;margin-bottom:4px;">New Reply from ${escapeHtml(businessName)}</h1>
  <p style="color:#555;margin-top:0;">Hi ${escapeHtml(input.customerName)} — we replied to your message:</p>
  <p style="color:#111;margin-top:16px;white-space:pre-line;border-left:3px solid #eee;padding-left:12px;">${escapeHtml(input.snippet)}</p>
  <p style="color:#555;margin-top:24px;">View and reply with your Job ID <strong>${escapeHtml(input.jobId)}</strong> and this email at <a href="${threadUrl}">${threadUrl}</a>.</p>
</body></html>`;
  const text = [
    `New Reply from ${businessName}`,
    ``,
    `Hi ${input.customerName} — we replied to your message:`,
    ``,
    input.snippet,
    ``,
    `View and reply with Job ID ${input.jobId} + this email at ${threadUrl}`,
  ].join("\n");

  const { error } = await resend.emails.send({
    from,
    to: input.customerEmail,
    ...(replyTo ? { replyTo } : {}),
    subject: `${businessName} — we replied to your message`,
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend owner-reply notification failed: ${error.message}`);
  }
}

// Shared best-effort customer status email used by both the admin booking route and the
// customer self-service route. Loads the service for pricing/duration, then sends. A mail
// failure is logged, never thrown — it must not fail the caller's request.
type StatusNotifyBooking = {
  id: number;
  jobId?: string | null;
  serviceId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  appointmentDate: string;
  appointmentTime: string;
};

export async function notifyBookingStatus(
  booking: StatusNotifyBooking,
  kind: "confirmed" | "cancelled" | "rescheduled",
): Promise<void> {
  try {
    const [service] = await db
      .select({
        name: services.name,
        priceCents: services.priceCents,
        durationMins: services.durationMins,
      })
      .from(services)
      .where(eq(services.id, booking.serviceId));
    if (!service) return;

    await sendBookingStatusUpdate(
      {
        bookingId: booking.id,
        jobId: booking.jobId ?? undefined,
        serviceName: service.name,
        priceCents: service.priceCents,
        durationMins: service.durationMins,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        customerPhone: booking.customerPhone,
        vehicleYear: booking.vehicleYear,
        vehicleMake: booking.vehicleMake,
        vehicleModel: booking.vehicleModel,
        appointmentDate: booking.appointmentDate,
        appointmentTime: booking.appointmentTime,
      },
      kind,
    );
  } catch (err) {
    console.error(`[email] failed to send ${kind} email for booking #${booking.id}:`, err);
  }
}
