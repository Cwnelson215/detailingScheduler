import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture what would be sent to Resend without making a network call. The render
// helpers in email.ts are private, so we exercise them through the public senders and
// assert on the payload (subject / html / text / to / replyTo).
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  // Use a non-arrow function so the mock is constructable: email.ts calls
  // `new Resend(apiKey)`, and vitest forwards `new` to this implementation
  // (arrow functions throw "is not a constructor").
  Resend: vi.fn(function () {
    return { emails: { send: sendMock } };
  }),
}));
vi.mock("@/lib/business-info", () => ({
  getBusinessInfo: vi.fn(async () => ({ name: "Nelson Detailing", address: "", phone: "" })),
}));

import {
  sendBookingConfirmation,
  sendOwnerNotification,
  sendBookingStatusUpdate,
} from "@/lib/email";
import { getBusinessInfo } from "@/lib/business-info";

const ADDRESS = "123 Detail Lane, Suite 100\nYour City, ST 12345";

function withAddress(address: string) {
  vi.mocked(getBusinessInfo).mockResolvedValue({
    name: "Nelson Detailing",
    address,
    phone: "",
  });
}

const base = {
  bookingId: 42,
  serviceName: "Full Detail – Sedan",
  priceCents: 15000,
  durationMins: 300,
  customerName: 'Jane <b>"Doe"</b>',
  customerEmail: "jane@example.com",
  customerPhone: "(555) 123-4567",
  vehicleYear: "2020",
  vehicleMake: "Toyota",
  vehicleModel: "Camry",
  appointmentDate: "2026-06-15",
  appointmentTime: "15:00",
  dropoffWindow: "evening" as const,
};

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ error: null });
  // Reset to the no-address default; individual tests opt in via withAddress().
  vi.mocked(getBusinessInfo).mockResolvedValue({ name: "Nelson Detailing", address: "", phone: "" });
  process.env.RESEND_API_KEY = "test-key";
  process.env.BOOKING_NOTIFY_EMAIL = "owner@example.com";
  delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_REPLY_TO;
});

describe("sendBookingConfirmation", () => {
  it("renders price, drop-off window, and HTML-escaped customer input", async () => {
    await sendBookingConfirmation(base);
    expect(sendMock).toHaveBeenCalledOnce();
    const payload = sendMock.mock.calls[0][0];
    expect(payload.to).toBe("jane@example.com");
    expect(payload.subject).toContain("Evening drop-off");
    expect(payload.html).toContain("Evening drop-off (3:00 PM)");
    expect(payload.html).toContain("$150.00");
    expect(payload.html).toContain("&lt;b&gt;"); // name escaped, not raw <b>
    expect(payload.html).not.toContain("<b>");
    expect(payload.text).toContain("Booking #: 42");
    expect(payload.text).not.toContain("Duration");
    expect(payload.html).not.toContain("Duration");
  });

  it("includes the drop-off location when an address is configured", async () => {
    withAddress(ADDRESS);
    await sendBookingConfirmation(base);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.html).toContain("Drop-off location");
    // Multi-line address renders with <br> in HTML and newlines in text.
    expect(payload.html).toContain("123 Detail Lane, Suite 100<br>Your City, ST 12345");
    expect(payload.text).toContain("Drop-off location:\n123 Detail Lane, Suite 100\nYour City, ST 12345");
  });

  it("omits the location block when no address is configured", async () => {
    await sendBookingConfirmation(base);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.html).not.toContain("Drop-off location");
    expect(payload.text).not.toContain("Drop-off location");
  });

  it("skips silently (no throw, no send) when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendBookingConfirmation(base)).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("sendBookingStatusUpdate", () => {
  it("includes the location for a non-cancelled status", async () => {
    withAddress(ADDRESS);
    await sendBookingStatusUpdate(base, "rescheduled");
    const payload = sendMock.mock.calls[0][0];
    expect(payload.html).toContain("Drop-off location");
    expect(payload.text).toContain("Drop-off location:");
  });

  it("omits the location for a cancelled status", async () => {
    withAddress(ADDRESS);
    await sendBookingStatusUpdate(base, "cancelled");
    const payload = sendMock.mock.calls[0][0];
    expect(payload.html).not.toContain("Drop-off location");
    expect(payload.text).not.toContain("Drop-off location");
  });
});

describe("sendOwnerNotification", () => {
  it("sends to the owner inbox with the customer as reply-to", async () => {
    await sendOwnerNotification(base);
    expect(sendMock).toHaveBeenCalledOnce();
    const payload = sendMock.mock.calls[0][0];
    expect(payload.to).toBe("owner@example.com");
    expect(payload.replyTo).toBe("jane@example.com");
    expect(payload.html).toContain("jane@example.com");
    expect(payload.html).toContain("Duration"); // owner still sees job length
  });

  it("never includes the drop-off location (owner knows their own address)", async () => {
    withAddress(ADDRESS);
    await sendOwnerNotification(base);
    const payload = sendMock.mock.calls[0][0];
    expect(payload.html).not.toContain("Drop-off location");
  });

  it("skips when BOOKING_NOTIFY_EMAIL is unset", async () => {
    delete process.env.BOOKING_NOTIFY_EMAIL;
    await sendOwnerNotification(base);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
