export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { db } from "@/db";
import { sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

// Readiness probe: unlike /health (static liveness), this pings Postgres so a DB outage
// marks the pod NotReady (pulled from the Service) without triggering a liveness restart
// loop. Wired to the k8s readinessProbe in k8s/base/deployment.yaml.
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ready" });
  } catch (err) {
    logger.error("readiness check failed", { err: String(err) });
    return Response.json({ status: "db_unavailable" }, { status: 503 });
  }
}
