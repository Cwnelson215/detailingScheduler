import type { Config } from "drizzle-kit";

export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "detailing",
    user: process.env.DB_USER || "detailing",
    password: process.env.DB_PASSWORD || "detailing",
  },
} satisfies Config;
