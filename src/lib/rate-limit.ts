// Minimal in-memory fixed-window rate limiter. Adequate for the single-replica
// deployment; if the app is ever scaled out, replace with a shared store (Redis).

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

// Returns true if the request is allowed, false if the limit is exceeded.
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now > existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) {
    return false;
  }
  existing.count += 1;
  return true;
}

// Resolve the client IP from a header lookup. We sit behind Traefik, which sets
// `x-real-ip` to the real client and *appends* the real hop to `x-forwarded-for`.
// So trust `x-real-ip` first, then the LAST `x-forwarded-for` entry — never the
// first, which is whatever the client chose to send and is trivially spoofable.
export function clientIpFromHeaders(getHeader: (name: string) => string | undefined): string {
  const realIp = getHeader("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = getHeader("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    return parts[parts.length - 1].trim();
  }
  return "unknown";
}

export function getClientIp(request: Request): string {
  return clientIpFromHeaders((name) => request.headers.get(name) ?? undefined);
}
