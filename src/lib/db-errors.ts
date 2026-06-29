// Detect a Postgres unique-constraint violation (SQLSTATE 23505) across both DB drivers.
// node-postgres (prod) throws an error with `.code` directly; drizzle's PGlite wrapper (tests)
// nests the original error under `.cause`. Check both, plus the message as a last resort.
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  if (e?.code === "23505" || e?.cause?.code === "23505") return true;
  const msg = `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;
  return msg.includes("23505") || /duplicate key value/i.test(msg);
}
