import { describe, it, expect } from "vitest";
import {
  bookingSchema,
  bookingUpdateSchema,
  contactSchema,
  serviceSchema,
  serviceUpdateSchema,
  businessHoursSchema,
  changePasswordSchema,
} from "@/lib/validations";

function futureDate(daysAhead = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const base = {
  serviceId: 1,
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  customerPhone: "(555) 123-4567",
  vehicleYear: "2020",
  vehicleMake: "Toyota",
  vehicleModel: "Camry",
  appointmentTime: "09:00",
};

describe("bookingSchema", () => {
  it("accepts a valid future booking", () => {
    expect(bookingSchema.safeParse({ ...base, appointmentDate: futureDate() }).success).toBe(true);
  });
  it("rejects an impossible calendar date", () => {
    expect(bookingSchema.safeParse({ ...base, appointmentDate: "2025-99-99" }).success).toBe(false);
  });
  it("rejects a past date", () => {
    expect(bookingSchema.safeParse({ ...base, appointmentDate: "2000-01-01" }).success).toBe(false);
  });
  it("rejects an impossible time of day", () => {
    expect(
      bookingSchema.safeParse({ ...base, appointmentDate: futureDate(), appointmentTime: "25:99" }).success,
    ).toBe(false);
  });
  it("rejects a phone number with too few digits", () => {
    expect(
      bookingSchema.safeParse({ ...base, appointmentDate: futureDate(), customerPhone: "abc" }).success,
    ).toBe(false);
  });
});

describe("bookingUpdateSchema", () => {
  it("rejects an empty update", () => {
    expect(bookingUpdateSchema.safeParse({}).success).toBe(false);
  });
  it("accepts a status change", () => {
    expect(bookingUpdateSchema.safeParse({ status: "confirmed" }).success).toBe(true);
  });
  it("rejects an unknown status", () => {
    expect(bookingUpdateSchema.safeParse({ status: "bogus" }).success).toBe(false);
  });
});

describe("contactSchema", () => {
  const valid = { name: "Jane", email: "jane@example.com", message: "Hi there" };
  it("accepts a valid message", () => expect(contactSchema.safeParse(valid).success).toBe(true));
  it("rejects a bad email", () =>
    expect(contactSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false));
  it("rejects an empty message", () =>
    expect(contactSchema.safeParse({ ...valid, message: "" }).success).toBe(false));
});

describe("serviceSchema", () => {
  const valid = { name: "Full Detail", durationMins: 300, priceCents: 15000 };
  it("accepts a valid service and applies defaults", () => {
    const parsed = serviceSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isActive).toBe(true);
      expect(parsed.data.description).toBe("");
    }
  });
  it("rejects a duration under 15 minutes", () =>
    expect(serviceSchema.safeParse({ ...valid, durationMins: 10 }).success).toBe(false));
  it("rejects a negative price", () =>
    expect(serviceSchema.safeParse({ ...valid, priceCents: -1 }).success).toBe(false));
});

describe("serviceUpdateSchema", () => {
  it("accepts a single-field update without applying defaults", () => {
    const parsed = serviceUpdateSchema.safeParse({ priceCents: 20000 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(Object.keys(parsed.data)).toEqual(["priceCents"]);
  });
  it("rejects an empty update", () =>
    expect(serviceUpdateSchema.safeParse({}).success).toBe(false));
  it("range-checks supplied fields", () =>
    expect(serviceUpdateSchema.safeParse({ durationMins: 1000 }).success).toBe(false));
});

describe("businessHoursSchema", () => {
  it("accepts an open day", () =>
    expect(
      businessHoursSchema.safeParse({
        dayOfWeek: 1,
        openTime: "08:00",
        closeTime: "17:00",
        isOpen: true,
      }).success,
    ).toBe(true));
  it("accepts a closed day with null times", () =>
    expect(
      businessHoursSchema.safeParse({
        dayOfWeek: 0,
        openTime: null,
        closeTime: null,
        isOpen: false,
      }).success,
    ).toBe(true));
  it("rejects an out-of-range dayOfWeek", () =>
    expect(
      businessHoursSchema.safeParse({ dayOfWeek: 7, openTime: null, closeTime: null, isOpen: false })
        .success,
    ).toBe(false));
});

describe("changePasswordSchema", () => {
  it("accepts a valid change", () =>
    expect(
      changePasswordSchema.safeParse({ currentPassword: "old-pass", newPassword: "new-pass-123" })
        .success,
    ).toBe(true));
  it("rejects a new password under 8 characters", () =>
    expect(
      changePasswordSchema.safeParse({ currentPassword: "old-pass", newPassword: "short" }).success,
    ).toBe(false));
  it("rejects when the new password equals the current one", () =>
    expect(
      changePasswordSchema.safeParse({ currentPassword: "samesame", newPassword: "samesame" })
        .success,
    ).toBe(false));
});
