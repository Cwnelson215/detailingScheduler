import { sql } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import { DEFAULT_ADMIN_PASSWORD_HASH } from "../lib/admin-password";

export async function runMigrations() {
  console.log("Running database migrations...");

  // Create tables if they don't exist
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      duration_mins INTEGER NOT NULL,
      price_cents INTEGER NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS business_hours (
      id SERIAL PRIMARY KEY,
      day_of_week INTEGER NOT NULL,
      open_time TIME,
      close_time TIME,
      is_open BOOLEAN NOT NULL DEFAULT true
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS blocked_dates (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      reason VARCHAR(255) DEFAULT ''
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      service_id INTEGER NOT NULL REFERENCES services(id),
      customer_name VARCHAR(255) NOT NULL,
      customer_email VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(50) NOT NULL,
      vehicle_year VARCHAR(4) NOT NULL,
      vehicle_make VARCHAR(100) NOT NULL,
      vehicle_model VARCHAR(100) NOT NULL,
      appointment_date DATE NOT NULL,
      appointment_time TIME NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      notes TEXT DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Additive columns / indexes for existing deployments (idempotent).
  await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmation_token VARCHAR(64)`);
  await db.execute(
    sql`UPDATE bookings SET confirmation_token = gen_random_uuid()::text WHERE confirmation_token IS NULL`,
  );
  await db.execute(sql`ALTER TABLE bookings ALTER COLUMN confirmation_token SET NOT NULL`);
  await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP`);

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS bookings_appointment_date_idx ON bookings (appointment_date)`,
  );
  await db.execute(sql`CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS bookings_service_id_idx ON bookings (service_id)`);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS bookings_confirmation_token_idx ON bookings (confirmation_token)`,
  );

  // Seed default business hours if empty
  const existingHours = await db.select().from(schema.businessHours);
  if (existingHours.length === 0) {
    const defaultHours = [
      { dayOfWeek: 0, isOpen: false, openTime: null, closeTime: null },
      { dayOfWeek: 1, isOpen: true, openTime: "08:00", closeTime: "17:00" },
      { dayOfWeek: 2, isOpen: true, openTime: "08:00", closeTime: "17:00" },
      { dayOfWeek: 3, isOpen: true, openTime: "08:00", closeTime: "17:00" },
      { dayOfWeek: 4, isOpen: true, openTime: "08:00", closeTime: "17:00" },
      { dayOfWeek: 5, isOpen: true, openTime: "08:00", closeTime: "17:00" },
      { dayOfWeek: 6, isOpen: true, openTime: "09:00", closeTime: "14:00" },
    ];
    await db.insert(schema.businessHours).values(defaultHours);
    console.log("Seeded default business hours");
  }

  // Seed default admin password if not set (bcrypt hash of "admin123")
  const existingPassword = await db
    .select()
    .from(schema.adminSettings)
    .where(sql`key = 'admin_password_hash'`);
  if (existingPassword.length === 0) {
    // Default "admin123". The dashboard forces a change before it can be used while
    // this exact (un-rotated) hash is still in place — see isUsingDefaultAdminPassword.
    await db.insert(schema.adminSettings).values({
      key: "admin_password_hash",
      value: DEFAULT_ADMIN_PASSWORD_HASH,
    });
    console.log("Seeded default admin password (admin123)");
  }

  // Seed default business name if not set
  const existingName = await db
    .select()
    .from(schema.adminSettings)
    .where(sql`key = 'business_name'`);
  if (existingName.length === 0) {
    await db.insert(schema.adminSettings).values({
      key: "business_name",
      value: "Nelson Detailing",
    });
    console.log("Seeded business name");
  }

  console.log("Migrations complete");
}
