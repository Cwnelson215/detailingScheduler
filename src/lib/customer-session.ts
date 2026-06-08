import crypto from "node:crypto";
import { getNextAuthSecret } from "./env";

// Lightweight signed token that proves a customer passed the Job ID + email check for a
// specific booking, without an account/login. Stored in an httpOnly cookie so the SSE
// EventSource (which can't send custom headers) authenticates automatically.
//
// Format: base64url(payloadJSON).base64url(HMAC-SHA256). We hand-roll this with node:crypto
// to avoid adding a JWT dependency; it is NOT interoperable with the NextAuth admin JWT and
// is only ever verified by verifyCustomerToken.

export const CUSTOMER_COOKIE = "cust_session";
// Email-scoped "view" cookie: proves the holder knows an email that has bookings, which
// grants read-only access to those bookings. It is deliberately weaker than CUSTOMER_COOKIE
// (which authorizes mutations + chat and is only issued after the Job ID + emailed-code
// step-up). See src/app/api/bookings/lookup + jobs/[jobId]/verify-code.
export const VIEW_COOKIE = "cust_view";
// Device-trust cookie: lists the booking IDs this device has either created or passed the
// emailed-code step-up for. Within its (short) TTL it lets the holder unlock the manage tier
// for those bookings by supplying only the Job ID — skipping the emailed code. It is a
// convenience factor layered on top of the Job ID, not a replacement for it; an attacker on a
// different device never gets this cookie and so always falls back to the emailed code.
export const DEVICE_COOKIE = "cust_device";
const TTL_SECONDS = 2 * 60 * 60; // 2h
// How many trusted booking IDs to keep in the device cookie (most recent wins; keeps it small).
const MAX_TRUSTED_BOOKINGS = 10;

type Payload = { bookingId: number; exp: number };
type ViewPayload = { email: string; exp: number };
type DevicePayload = { bookingIds: number[]; exp: number };

// Normalize emails the same way everywhere we compare them (lookup + view-cookie checks).
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function b64urlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return crypto.createHmac("sha256", getNextAuthSecret()).update(data).digest("base64url");
}

export function issueCustomerToken(bookingId: number, nowMs: number = Date.now()): string {
  const payload: Payload = { bookingId, exp: Math.floor(nowMs / 1000) + TTL_SECONDS };
  const body = b64urlEncode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyCustomerToken(
  token: string | undefined,
  nowMs: number = Date.now(),
): { bookingId: number } | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  // Constant-time signature comparison.
  const expected = sign(body);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.bookingId !== "number" || typeof payload.exp !== "number") return null;
  if (Math.floor(nowMs / 1000) > payload.exp) return null;
  return { bookingId: payload.bookingId };
}

// --- View (email) tier ---

export function issueViewToken(email: string, nowMs: number = Date.now()): string {
  const payload: ViewPayload = {
    email: normalizeEmail(email),
    exp: Math.floor(nowMs / 1000) + TTL_SECONDS,
  };
  const body = b64urlEncode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyViewToken(
  token: string | undefined,
  nowMs: number = Date.now(),
): { email: string } | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  // Constant-time signature comparison.
  const expected = sign(body);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: ViewPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.email !== "string" || typeof payload.exp !== "number") return null;
  if (Math.floor(nowMs / 1000) > payload.exp) return null;
  return { email: payload.email };
}

// The normalized email a request's view cookie proves, or null.
export function readViewEmail(request: Request): string | null {
  return verifyViewToken(readCookie(request, VIEW_COOKIE))?.email ?? null;
}

// True when the request carries a valid view cookie whose email matches this booking's.
export function requireCustomerEmail(request: Request, bookingEmail: string): boolean {
  const sessionEmail = readViewEmail(request);
  return sessionEmail !== null && sessionEmail === normalizeEmail(bookingEmail);
}

// Serialize the Set-Cookie header value for a freshly-issued view token.
export function viewCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${VIEW_COOKIE}=${encodeURIComponent(token)}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${TTL_SECONDS}`;
}

// --- Manage tier ---

// True when the request carries a valid cookie scoped to exactly this booking.
export function requireCustomerBooking(request: Request, bookingId: number): boolean {
  const token = readCookie(request, CUSTOMER_COOKIE);
  const verified = verifyCustomerToken(token);
  return verified !== null && verified.bookingId === bookingId;
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

// Serialize the Set-Cookie header value for a freshly-issued customer token.
export function customerCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${CUSTOMER_COOKIE}=${encodeURIComponent(token)}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${TTL_SECONDS}`;
}

// --- Device-trust tier ---

export function issueDeviceToken(bookingIds: number[], nowMs: number = Date.now()): string {
  const payload: DevicePayload = {
    bookingIds,
    exp: Math.floor(nowMs / 1000) + TTL_SECONDS,
  };
  const body = b64urlEncode(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyDeviceToken(
  token: string | undefined,
  nowMs: number = Date.now(),
): { bookingIds: number[] } | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  // Constant-time signature comparison.
  const expected = sign(body);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: DevicePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !Array.isArray(payload.bookingIds) ||
    !payload.bookingIds.every((id) => typeof id === "number" && Number.isFinite(id)) ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  if (Math.floor(nowMs / 1000) > payload.exp) return null;
  return { bookingIds: payload.bookingIds };
}

// The booking IDs a request's device cookie vouches for (empty if absent/expired/tampered).
export function readTrustedBookingIds(request: Request): number[] {
  return verifyDeviceToken(readCookie(request, DEVICE_COOKIE))?.bookingIds ?? [];
}

// True when the request's device cookie vouches for this specific booking.
export function isDeviceTrustedFor(request: Request, bookingId: number): boolean {
  return readTrustedBookingIds(request).includes(bookingId);
}

// Build a refreshed device cookie that adds bookingId to whatever the request already trusted,
// deduped and capped to the most recent MAX_TRUSTED_BOOKINGS, with a fresh (sliding) expiry.
// Returns the Set-Cookie header value.
export function addTrustedBooking(
  request: Request,
  bookingId: number,
  nowMs: number = Date.now(),
): string {
  const existing = readTrustedBookingIds(request).filter((id) => id !== bookingId);
  const next = [...existing, bookingId].slice(-MAX_TRUSTED_BOOKINGS);
  return deviceCookieHeader(issueDeviceToken(next, nowMs));
}

// Serialize the Set-Cookie header value for a freshly-issued device token.
export function deviceCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `${DEVICE_COOKIE}=${encodeURIComponent(token)}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${TTL_SECONDS}`;
}
