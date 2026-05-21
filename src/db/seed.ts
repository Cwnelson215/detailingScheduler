import { db } from "./index";
import { services } from "./schema";
import { runMigrations } from "./migrate";

const OUTER_WASH_DESC =
  "Hand wash, wheel and tire cleaning, tire shine, bug and tar spot removal, and a streak-free window finish.";
const WASH_WAX_DESC =
  "Everything in the Outer Wash, plus a hand-applied carnauba wax for added gloss and weeks of paint protection.";
const INNER_CLEANING_DESC =
  "Full interior vacuum, steam-cleaned carpets and upholstery, surface wipe-down and dressing, interior glass, and odor neutralization.";
const FULL_DETAIL_DESC =
  "Inside and out: exterior hand wash with clay-bar decontamination and hand-applied wax, plus a complete interior deep clean — vacuum, shampoo, leather/vinyl conditioning, and glass.";

const sampleServices: typeof services.$inferInsert[] = [
  { name: "Outer Wash – Sedan", description: OUTER_WASH_DESC, durationMins: 45, priceCents: 2000, sortOrder: 10 },
  { name: "Outer Wash – SUV", description: OUTER_WASH_DESC, durationMins: 55, priceCents: 3000, sortOrder: 11 },
  { name: "Outer Wash – Truck/Van", description: OUTER_WASH_DESC, durationMins: 65, priceCents: 4000, sortOrder: 12 },
  { name: "Wash + Wax – Sedan", description: WASH_WAX_DESC, durationMins: 75, priceCents: 5000, sortOrder: 20 },
  { name: "Wash + Wax – SUV", description: WASH_WAX_DESC, durationMins: 85, priceCents: 6000, sortOrder: 21 },
  { name: "Wash + Wax – Truck/Van", description: WASH_WAX_DESC, durationMins: 95, priceCents: 7000, sortOrder: 22 },
  { name: "Inner Cleaning – Sedan", description: INNER_CLEANING_DESC, durationMins: 150, priceCents: 9000, sortOrder: 30 },
  { name: "Inner Cleaning – SUV", description: INNER_CLEANING_DESC, durationMins: 170, priceCents: 11000, sortOrder: 31 },
  { name: "Inner Cleaning – Truck/Van", description: INNER_CLEANING_DESC, durationMins: 190, priceCents: 13000, sortOrder: 32 },
  { name: "Full Detail – Sedan", description: FULL_DETAIL_DESC, durationMins: 300, priceCents: 18000, sortOrder: 40 },
  { name: "Full Detail – SUV", description: FULL_DETAIL_DESC, durationMins: 330, priceCents: 22000, sortOrder: 41 },
  { name: "Full Detail – Truck/Van", description: FULL_DETAIL_DESC, durationMins: 360, priceCents: 26000, sortOrder: 42 },
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
