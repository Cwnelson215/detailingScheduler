import { db } from "./index";
import { services } from "./schema";
import { runMigrations } from "./migrate";

const sampleServices = [
  {
    name: "Express Wash",
    description: "Quick exterior hand wash, tire shine, and windows.",
    durationMins: 45,
    priceCents: 4500,
    sortOrder: 10,
  },
  {
    name: "Full Detail",
    description: "Exterior wash + clay bar, full interior vacuum, shampoo, and dressing.",
    durationMins: 180,
    priceCents: 17500,
    sortOrder: 20,
  },
  {
    name: "Interior Deep Clean",
    description: "Steam-clean carpets and upholstery, leather conditioning, headliner.",
    durationMins: 150,
    priceCents: 14000,
    sortOrder: 30,
  },
  {
    name: "Paint Correction & Wax",
    description: "Single-stage polish, swirl removal, carnauba wax application.",
    durationMins: 240,
    priceCents: 29500,
    sortOrder: 40,
  },
  {
    name: "Ceramic Coating",
    description: "Full prep + 2-year ceramic coating with cure-time.",
    durationMins: 360,
    priceCents: 65000,
    sortOrder: 50,
  },
];

async function main() {
  await runMigrations();

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
