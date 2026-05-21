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

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
