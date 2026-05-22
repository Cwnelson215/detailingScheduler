// Relative imports (not "@/...") so this module is also importable from the
// tsx-run db scripts, which don't resolve the path alias.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { adminSettings } from "../db/schema";

// bcrypt hash of "admin123", seeded as the initial admin password. Because bcrypt
// salts each hash, a real password change produces a different string — so an exact
// match against this constant reliably means the operator is still on the default.
export const DEFAULT_ADMIN_PASSWORD_HASH =
  "$2a$10$whapSoS2nQ.27Xyt/FA36ut6VbIf2O1bBpb3F8ckEK7PhSE5.fP3S";

export async function isUsingDefaultAdminPassword(): Promise<boolean> {
  try {
    const [row] = await db
      .select()
      .from(adminSettings)
      .where(eq(adminSettings.key, "admin_password_hash"));
    return row?.value === DEFAULT_ADMIN_PASSWORD_HASH;
  } catch {
    // DB unreachable (e.g. during build): don't assert the default is in use.
    return false;
  }
}
