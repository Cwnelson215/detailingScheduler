// Minimal structured logger. Emits one JSON line per call via console.*, which k3s
// collects from the pod's stdout/stderr. Isomorphic (no node-only imports) so both
// server route handlers and client error boundaries can use it. Keep context PII-light —
// log identifiers (bookingId, ip) rather than message bodies or customer details.

type Level = "info" | "warn" | "error";
type Ctx = Record<string, unknown>;

function emit(level: Level, msg: string, ctx?: Ctx) {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...ctx });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (msg: string, ctx?: Ctx) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Ctx) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Ctx) => emit("error", msg, ctx),
};
