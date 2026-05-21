import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Typed as NodePgDatabase so query results are typed for consumers. At runtime the
// dev path is actually a PgliteDatabase, but both drivers share the query API we use
// (select/insert/update/execute). The require()-based loading below returns `any`, so
// assigning either driver to this binding type-checks.
let db: NodePgDatabase<typeof schema>;

if (process.env.DB_HOST) {
  // Production: use pg Pool
  const { drizzle } = require("drizzle-orm/node-postgres");
  const { Pool } = require("pg");
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "detailing",
    user: process.env.DB_USER || "detailing",
    password: process.env.DB_PASSWORD || "detailing",
    ssl:
      process.env.DB_SSL_REJECT_UNAUTHORIZED === "false"
        ? { rejectUnauthorized: false }
        : true,
  });
  db = drizzle(pool, { schema });
} else {
  // Local dev: use PGlite (embedded Postgres)
  // Use globalThis to ensure a single instance across module re-evaluations (Next.js HMR / bundling)
  const g = globalThis as any;
  if (!g.__pgliteDb) {
    const { PGlite } = require("@electric-sql/pglite");
    const { drizzle } = require("drizzle-orm/pglite");
    const client = new PGlite("./pglite-data");
    g.__pgliteDb = drizzle(client, { schema });
  }
  db = g.__pgliteDb;
}

export { db };
