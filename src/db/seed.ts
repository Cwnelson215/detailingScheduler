import { db } from "./index";
import { services } from "./schema";
import { runMigrations } from "./migrate";

const FULL_DETAIL_DESC =
  "Inside and out: exterior hand wash with clay-bar decontamination and hand-applied wax, plus a complete interior deep clean — vacuum, shampoo, leather/vinyl conditioning, and glass.";

const sampleServices: typeof services.$inferInsert[] = [
  { name: "Full Detail – Sedan", description: FULL_DETAIL_DESC, durationMins: 300, priceCents: 15000, sortOrder: 40 },
  { name: "Full Detail – SUV", description: FULL_DETAIL_DESC, durationMins: 330, priceCents: 18000, sortOrder: 41 },
  { name: "Full Detail – Truck/Van", description: FULL_DETAIL_DESC, durationMins: 360, priceCents: 21000, sortOrder: 42 },
];

async function main() {
  await runMigrations();

  if (sampleServices.length === 0) {
    console.log("No sample services to insert.");
    process.exit(0);
  }

  const existing = await db.select().from(services);
  if (existing.length > 0) {
    console.log(`Services table already has ${existing.length} row(s) — skipping seed.`);
    process.exit(0);
  }

  await db.insert(services).values(sampleServices);
  console.log(`Inserted ${sampleServices.length} sample services.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
