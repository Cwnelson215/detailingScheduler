import { Resend } from "resend";
import { formatCurrency, formatDuration } from "./utils";
import { getBusinessInfo } from "./business-info";

type ContactMessageInput = {
  name: string;
  email: string;
  message: string;
};

type BookingEmailInput = {
  bookingId: number;
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
};

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

function tableHtml(rows: [string, string][]): string {
  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;color:#666;">${k}</td><td style="padding:6px 12px;font-weight:600;">${v}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;width:100%;border:1px solid #eee;border-radius:6px;overflow:hidden;margin-top:16px;">
    ${tableRows}
  </table>`;
}

function bookingRows(b: BookingEmailInput): [string, string][] {
  return [
    ["Booking #", String(b.bookingId)],
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
  <p style="color:#555;margin-top:0;">Thanks ${b.customerName} — your appointment is on the books.</p>
  ${tableHtml(bookingRows(b))}
  <p style="color:#555;margin-top:24px;">We'll reach out at ${b.customerPhone} if anything changes. Reply to this email with questions.</p>
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
  <p style="color:#555;margin-top:0;">A new appointment was just booked. Reply to this email to reach ${b.customerName} directly.</p>
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
    ["Name", escapeHtml(c.name)],
    ["Email", escapeHtml(c.email)],
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
