import { cache } from "react";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { adminSettings } from "@/db/schema";

export type BusinessInfo = {
  name: string;
  address: string;
  phone: string;
};

const DEFAULTS: BusinessInfo = {
  name: "Nelson Detailing",
  address: "123 Detail Lane, Suite 100\nYour City, ST 12345",
  phone: "(555) 123-4567",
};

const KEYS = {
  name: "business_name",
  address: "business_address",
  phone: "business_phone",
} as const;

export const getBusinessInfo = cache(async (): Promise<BusinessInfo> => {
  let rows: { key: string; value: string }[];
  try {
    rows = await db
      .select()
      .from(adminSettings)
      .where(inArray(adminSettings.key, [KEYS.name, KEYS.address, KEYS.phone]));
  } catch {
    // The DB is unreachable during `next build` (no DB at image-build time) and could
    // be transiently down at runtime. Business identity has well-defined defaults, so
    // degrade gracefully rather than crash the page/metadata render.
    return DEFAULTS;
  }

  const byKey = new Map<string, string>(rows.map((r) => [r.key, r.value]));
  return {
    name: byKey.get(KEYS.name) ?? DEFAULTS.name,
    address: byKey.get(KEYS.address) ?? DEFAULTS.address,
    phone: byKey.get(KEYS.phone) ?? DEFAULTS.phone,
  };
});

export const BUSINESS_INFO_KEYS = KEYS;
