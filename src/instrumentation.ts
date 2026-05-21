export async function register() {
  // Skip during `next build` — migrations connect to a DB and must only run when the
  // server actually starts, not while prerendering pages in the build worker.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./db/migrate");
    await runMigrations();
  }
}
