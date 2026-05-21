import { sql } from "drizzle-orm";
import { db } from "./index";
import { services } from "./schema";

// One-off: deactivate every service except the "Full Detail" tiers. Run once per
// environment after reducing the catalog to Full Detail only. Deactivation (not
// deletion) is required because bookings.service_id is a NOT NULL FK to services(id).
async function main() {
  const deactivated = await db
    .update(services)
    .set({ isActive: false })
    .where(sql`name NOT LIKE 'Full Detail%'`)
    .returning();

  console.log(`Deactivated ${deactivated.length} legacy service(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
