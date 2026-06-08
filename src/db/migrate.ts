import { sql, isNull, eq } from "drizzle-orm";
import { db } from "./index";
import * as schema from "./schema";
import { DEFAULT_ADMIN_PASSWORD_HASH } from "../lib/admin-password";
import { generateJobId } from "../lib/job-id";

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

  // Allowlist of bookable dates. Empty by default — every date is unavailable until the admin
  // opens it in the Schedule page. Replaces the old `blocked_dates` denylist (kept above, unused).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS available_dates (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS available_dates_date_idx ON available_dates (date)`,
  );

  // Additive columns / indexes for existing deployments (idempotent).
  await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmation_token VARCHAR(64)`);
  await db.execute(
    sql`UPDATE bookings SET confirmation_token = gen_random_uuid()::text WHERE confirmation_token IS NULL`,
  );
  await db.execute(sql`ALTER TABLE bookings ALTER COLUMN confirmation_token SET NOT NULL`);
  await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP`);

  // Job ID: short customer-facing handle. Add nullable, backfill each existing row with a
  // unique code, then enforce NOT NULL + a unique index (mirrors confirmation_token above).
  await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS job_id VARCHAR(16)`);
  const needJobId = await db
    .select({ id: schema.bookings.id })
    .from(schema.bookings)
    .where(isNull(schema.bookings.jobId));
  if (needJobId.length > 0) {
    const existing = await db
      .select({ jobId: schema.bookings.jobId })
      .from(schema.bookings);
    const issued = new Set(existing.map((r) => r.jobId).filter(Boolean) as string[]);
    for (const row of needJobId) {
      let code = generateJobId();
      while (issued.has(code)) code = generateJobId();
      issued.add(code);
      await db.update(schema.bookings).set({ jobId: code }).where(eq(schema.bookings.id, row.id));
    }
  }
  await db.execute(sql`ALTER TABLE bookings ALTER COLUMN job_id SET NOT NULL`);

  // Drop-off windows: two fixed windows per weekday replace the legacy open→close model.
  // Add the per-window columns (idempotent), then backfill existing rows to the product
  // defaults. open_time/close_time are intentionally left in place but unused.
  await db.execute(sql`ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS morning_enabled BOOLEAN NOT NULL DEFAULT true`);
  await db.execute(sql`ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS morning_start TIME`);
  await db.execute(sql`ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS morning_end TIME`);
  await db.execute(sql`ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS evening_enabled BOOLEAN NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS evening_start TIME`);
  await db.execute(sql`ALTER TABLE business_hours ADD COLUMN IF NOT EXISTS evening_end TIME`);
  // Backfill any rows that predate the window columns (guarded so it runs once): Mon–Sat
  // get the 7–9am morning window; Mon–Fri additionally get the 3–5pm evening window.
  await db.execute(
    sql`UPDATE business_hours SET morning_enabled = true, morning_start = '07:00', morning_end = '09:00' WHERE morning_start IS NULL AND day_of_week BETWEEN 1 AND 6`,
  );
  await db.execute(
    sql`UPDATE business_hours SET evening_enabled = true, evening_start = '15:00', evening_end = '17:00' WHERE evening_start IS NULL AND day_of_week BETWEEN 1 AND 5`,
  );

  // Record which window each booking occupies. Add nullable, backfill existing rows by a
  // noon cutoff (their stored appointmentTime is arbitrary historical data), enforce NOT NULL.
  await db.execute(sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dropoff_window VARCHAR(10)`);
  await db.execute(
    sql`UPDATE bookings SET dropoff_window = CASE WHEN appointment_time < '12:00' THEN 'morning' ELSE 'evening' END WHERE dropoff_window IS NULL`,
  );
  await db.execute(sql`ALTER TABLE bookings ALTER COLUMN dropoff_window SET NOT NULL`);
  // One car per (date, window): a partial unique index over non-cancelled bookings is the
  // DB-level backstop for the app-level advisory-lock check. Guarded — legacy data could
  // (rarely) already hold two same-window bookings on a date; correctness going forward
  // still holds via the advisory lock + isWindowAvailable, so we log and continue.
  try {
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS bookings_date_window_active_idx ON bookings (appointment_date, dropoff_window) WHERE status != 'cancelled'`,
    );
  } catch (err) {
    console.warn(
      "Could not create bookings_date_window_active_idx (legacy duplicate windows on a date?):",
      err,
    );
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS booking_messages (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      sender VARCHAR(10) NOT NULL,
      ciphertext TEXT NOT NULL,
      iv VARCHAR(32) NOT NULL,
      auth_tag VARCHAR(32) NOT NULL,
      read_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS bookings_appointment_date_idx ON bookings (appointment_date)`,
  );
  await db.execute(sql`CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings (status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS bookings_service_id_idx ON bookings (service_id)`);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS bookings_confirmation_token_idx ON bookings (confirmation_token)`,
  );
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS bookings_job_id_idx ON bookings (job_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS booking_messages_booking_id_idx ON booking_messages (booking_id)`,
  );

  // One-time codes for the customer view→manage step-up (Job ID + emailed code).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS customer_verification_codes (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      code_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS customer_verification_codes_booking_id_idx ON customer_verification_codes (booking_id)`,
  );

  // Seed default business hours if empty. Mon–Fri offer both drop-off windows
  // (7–9am morning, 3–5pm evening); Saturday is morning-only; Sunday is closed.
  const existingHours = await db.select().from(schema.businessHours);
  if (existingHours.length === 0) {
    const weekday = {
      isOpen: true,
      morningEnabled: true,
      morningStart: "07:00",
      morningEnd: "09:00",
      eveningEnabled: true,
      eveningStart: "15:00",
      eveningEnd: "17:00",
    };
    const defaultHours = [
      {
        dayOfWeek: 0,
        isOpen: false,
        morningEnabled: false,
        morningStart: null,
        morningEnd: null,
        eveningEnabled: false,
        eveningStart: null,
        eveningEnd: null,
      },
      { dayOfWeek: 1, ...weekday },
      { dayOfWeek: 2, ...weekday },
      { dayOfWeek: 3, ...weekday },
      { dayOfWeek: 4, ...weekday },
      { dayOfWeek: 5, ...weekday },
      {
        dayOfWeek: 6,
        isOpen: true,
        morningEnabled: true,
        morningStart: "07:00",
        morningEnd: "09:00",
        eveningEnabled: false,
        eveningStart: null,
        eveningEnd: null,
      },
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
