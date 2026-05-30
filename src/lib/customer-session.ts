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
const TTL_SECONDS = 2 * 60 * 60; // 2h

type Payload = { bookingId: number; exp: number };

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
