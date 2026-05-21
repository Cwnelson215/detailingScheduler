import { describe, it, expect } from "vitest";
import { bookingSchema, bookingUpdateSchema } from "@/lib/validations";

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
