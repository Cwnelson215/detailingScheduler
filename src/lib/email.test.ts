import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture what would be sent to Resend without making a network call. The render
// helpers in email.ts are private, so we exercise them through the public senders and
// assert on the payload (subject / html / text / to / replyTo).
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send: sendMock } })),
}));
vi.mock("@/lib/business-info", () => ({
  getBusinessInfo: vi.fn(async () => ({ name: "Nelson Detailing", address: "", phone: "" })),
}));

import { sendBookingConfirmation, sendOwnerNotification } from "@/lib/email";

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
    expect(payload.text).toContain("Duration:  5h");
  });

  it("skips silently (no throw, no send) when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendBookingConfirmation(base)).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
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
  });

  it("skips when BOOKING_NOTIFY_EMAIL is unset", async () => {
    delete process.env.BOOKING_NOTIFY_EMAIL;
    await sendOwnerNotification(base);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
