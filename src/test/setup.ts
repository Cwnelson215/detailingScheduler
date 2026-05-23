// Vitest global setup (registered via vitest.config.ts `setupFiles`). Stands up an
// in-memory PGlite Postgres and migrates it, so any test — or any app code under test
// that imports `@/db` — transparently uses an isolated database. Runs once per test
// file (Vitest isolates module state per file) BEFORE the test module's imports.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";

// Force src/db/index.ts down its PGlite branch (never the pg Pool / production path).
delete process.env.DB_HOST;

// src/db/index.ts reads globalThis.__pgliteDb. Assign an in-memory PGlite instance
// (no path = in-memory, dies with the process) BEFORE importing anything that pulls in
// `@/db`, so the app and the test share the one database.
const client = new PGlite();
(globalThis as { __pgliteDb?: unknown }).__pgliteDb = drizzle(client, { schema });

// Build the schema. Imported dynamically AFTER the global is set so that db/migrate's
// `import { db } from "./index"` resolves to the instance above. Silence the migration
// chatter so it doesn't repeat once per test file.
const log = console.log;
console.log = () => {};
const { runMigrations } = await import("@/db/migrate");
await runMigrations();
console.log = log;
