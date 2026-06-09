import { describe, it, expect } from "vitest";
import {
  bookingSchema,
  bookingUpdateSchema,
  contactSchema,
  serviceSchema,
  serviceUpdateSchema,
  businessHoursSchema,
  businessInfoSchema,
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
  dropoffWindow: "morning",
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
  it("rejects an unknown drop-off window", () => {
    expect(
      bookingSchema.safeParse({ ...base, appointmentDate: futureDate(), dropoffWindow: "afternoon" }).success,
    ).toBe(false);
  });
  it("rejects a phone number with too few digits", () => {
    expect(
      bookingSchema.safeParse({ ...base, appointmentDate: futureDate(), customerPhone: "abc" }).success,
    ).toBe(false);
  });
  it("rejects a 7-digit (non-US) phone number", () => {
    expect(
      bookingSchema.safeParse({ ...base, appointmentDate: futureDate(), customerPhone: "1234567" }).success,
    ).toBe(false);
  });
  it("normalizes a raw 10-digit phone to the canonical format", () => {
    const parsed = bookingSchema.safeParse({
      ...base,
      appointmentDate: futureDate(),
      customerPhone: "5551234567",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.customerPhone).toBe("(555) 123-4567");
  });
  it("trims and lowercases the email", () => {
    const parsed = bookingSchema.safeParse({
      ...base,
      appointmentDate: futureDate(),
      customerEmail: "  Jane@Example.COM ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.customerEmail).toBe("jane@example.com");
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
  const weekday = {
    dayOfWeek: 1,
    isOpen: true,
    morningEnabled: true,
    morningStart: "07:00",
    morningEnd: "09:00",
    eveningEnabled: true,
    eveningStart: "15:00",
    eveningEnd: "17:00",
  };
  it("accepts a day with valid windows", () =>
    expect(businessHoursSchema.safeParse(weekday).success).toBe(true));
  it("accepts a closed day with disabled, null windows", () =>
    expect(
      businessHoursSchema.safeParse({
        dayOfWeek: 0,
        isOpen: false,
        morningEnabled: false,
        morningStart: null,
        morningEnd: null,
        eveningEnabled: false,
        eveningStart: null,
        eveningEnd: null,
      }).success,
    ).toBe(true));
  it("rejects an enabled window with start at or after its end", () =>
    expect(
      businessHoursSchema.safeParse({ ...weekday, morningStart: "09:00", morningEnd: "09:00" }).success,
    ).toBe(false));
  it("rejects an enabled window missing its times", () =>
    expect(
      businessHoursSchema.safeParse({ ...weekday, eveningStart: null, eveningEnd: null }).success,
    ).toBe(false));
  it("rejects an out-of-range dayOfWeek", () =>
    expect(businessHoursSchema.safeParse({ ...weekday, dayOfWeek: 7 }).success).toBe(false));
});

describe("businessInfoSchema", () => {
  const valid = { name: "Nelson Detailing", address: "123 Lane", phone: "(555) 123-4567" };
  it("accepts a valid record and normalizes the phone", () => {
    const parsed = businessInfoSchema.safeParse({ ...valid, phone: "5551234567" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.phone).toBe("(555) 123-4567");
  });
  it("allows a blank phone", () =>
    expect(businessInfoSchema.safeParse({ ...valid, phone: "" }).success).toBe(true));
  it("rejects an invalid non-empty phone", () =>
    expect(businessInfoSchema.safeParse({ ...valid, phone: "555" }).success).toBe(false));
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
