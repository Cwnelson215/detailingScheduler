// Minimal in-memory fixed-window rate limiter. Adequate for the single-replica
// deployment; if the app is ever scaled out, replace with a shared store (Redis).

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

// Sweep expired windows so the Map can't grow unbounded across many distinct keys
// (e.g. a flood of unique client IPs). Amortized: only walk the whole Map once we've
// accumulated enough entries since the last sweep, so steady-state cost stays O(1).
const SWEEP_EVERY = 1000;
let writesSinceSweep = 0;

function sweep(now: number): void {
  for (const [key, win] of windows) {
    if (now > win.resetAt) windows.delete(key);
  }
  writesSinceSweep = 0;
}

// Returns true if the request is allowed, false if the limit is exceeded.
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now > existing.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    if (++writesSinceSweep >= SWEEP_EVERY) sweep(now);
    return true;
  }
  if (existing.count >= limit) {
    return false;
  }
  existing.count += 1;
  return true;
}

// Exposed for tests: clear all state and drop the sweep counter.
export function __resetRateLimitState(): void {
  windows.clear();
  writesSinceSweep = 0;
}

// Exposed for tests: current number of tracked windows (post-eviction visibility).
export function __windowCount(): number {
  return windows.size;
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
