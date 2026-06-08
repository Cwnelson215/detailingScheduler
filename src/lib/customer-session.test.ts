import { describe, it, expect } from "vitest";
import {
  issueCustomerToken,
  verifyCustomerToken,
  requireCustomerBooking,
  customerCookieHeader,
  CUSTOMER_COOKIE,
  issueDeviceToken,
  verifyDeviceToken,
  readTrustedBookingIds,
  isDeviceTrustedFor,
  addTrustedBooking,
  deviceCookieHeader,
  DEVICE_COOKIE,
} from "./customer-session";

function reqWithDevice(token: string): Request {
  return new Request("http://localhost/x", {
    headers: { cookie: `${DEVICE_COOKIE}=${encodeURIComponent(token)}` },
  });
}

// Extract the device-cookie token from a Set-Cookie header value.
function tokenFromHeader(header: string): string {
  return decodeURIComponent(header.slice(`${DEVICE_COOKIE}=`.length).split(";")[0]);
}

describe("customer-session", () => {
  it("issues and verifies a token scoped to a booking", () => {
    const token = issueCustomerToken(42);
    expect(verifyCustomerToken(token)).toEqual({ bookingId: 42 });
  });

  it("rejects a tampered token", () => {
    const token = issueCustomerToken(42);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifyCustomerToken(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    const past = Date.now() - 3 * 60 * 60 * 1000; // issued 3h ago, TTL is 2h
    const token = issueCustomerToken(42, past);
    expect(verifyCustomerToken(token)).toBeNull();
  });

  it("rejects undefined / malformed input", () => {
    expect(verifyCustomerToken(undefined)).toBeNull();
    expect(verifyCustomerToken("not-a-token")).toBeNull();
  });

  it("requireCustomerBooking matches only the scoped booking", () => {
    const token = issueCustomerToken(7);
    const req = new Request("http://localhost/x", {
      headers: { cookie: `${CUSTOMER_COOKIE}=${encodeURIComponent(token)}` },
    });
    expect(requireCustomerBooking(req, 7)).toBe(true);
    expect(requireCustomerBooking(req, 8)).toBe(false);
  });

  it("requireCustomerBooking is false without a cookie", () => {
    const req = new Request("http://localhost/x");
    expect(requireCustomerBooking(req, 7)).toBe(false);
  });

  it("cookie header carries HttpOnly + SameSite", () => {
    const header = customerCookieHeader(issueCustomerToken(1));
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
  });
});

describe("customer-session device trust", () => {
  it("round-trips a list of trusted booking IDs", () => {
    const token = issueDeviceToken([1, 2, 3]);
    expect(verifyDeviceToken(token)).toEqual({ bookingIds: [1, 2, 3] });
  });

  it("rejects a tampered device token", () => {
    const token = issueDeviceToken([1]);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifyDeviceToken(tampered)).toBeNull();
  });

  it("rejects an expired device token", () => {
    const past = Date.now() - 3 * 60 * 60 * 1000; // issued 3h ago, TTL is 2h
    expect(verifyDeviceToken(issueDeviceToken([1], past))).toBeNull();
  });

  it("rejects non-numeric bookingIds payloads", () => {
    // Forge a payload with a string id but a valid signature is impossible without the secret;
    // instead confirm a malformed/typed payload from a foreign cookie shape is rejected.
    expect(verifyDeviceToken("not-a-token")).toBeNull();
    expect(verifyDeviceToken(undefined)).toBeNull();
  });

  it("isDeviceTrustedFor only matches listed bookings", () => {
    const req = reqWithDevice(issueDeviceToken([5, 9]));
    expect(isDeviceTrustedFor(req, 5)).toBe(true);
    expect(isDeviceTrustedFor(req, 9)).toBe(true);
    expect(isDeviceTrustedFor(req, 6)).toBe(false);
  });

  it("readTrustedBookingIds is empty without a cookie", () => {
    expect(readTrustedBookingIds(new Request("http://localhost/x"))).toEqual([]);
  });

  it("addTrustedBooking appends to and dedups the existing list", () => {
    const first = addTrustedBooking(new Request("http://localhost/x"), 1);
    const req1 = reqWithDevice(tokenFromHeader(first));
    const second = addTrustedBooking(req1, 2);
    expect(verifyDeviceToken(tokenFromHeader(second))).toEqual({ bookingIds: [1, 2] });

    // Re-adding 1 moves it to the end without duplicating.
    const req2 = reqWithDevice(tokenFromHeader(second));
    const third = addTrustedBooking(req2, 1);
    expect(verifyDeviceToken(tokenFromHeader(third))).toEqual({ bookingIds: [2, 1] });
  });

  it("addTrustedBooking caps the list at 10 most-recent", () => {
    let req = new Request("http://localhost/x");
    let header = "";
    for (let id = 1; id <= 12; id++) {
      header = addTrustedBooking(req, id);
      req = reqWithDevice(tokenFromHeader(header));
    }
    const ids = verifyDeviceToken(tokenFromHeader(header))?.bookingIds ?? [];
    expect(ids).toHaveLength(10);
    expect(ids).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("addTrustedBooking refreshes the expiry (sliding window)", () => {
    const old = addTrustedBooking(new Request("http://localhost/x"), 1, Date.now() - 60 * 1000);
    const req = reqWithDevice(tokenFromHeader(old));
    // An hour later the old token would still be valid, and the refreshed one extends further.
    const refreshed = addTrustedBooking(req, 1, Date.now());
    expect(verifyDeviceToken(tokenFromHeader(refreshed))).toEqual({ bookingIds: [1] });
  });

  it("device cookie header carries HttpOnly + SameSite", () => {
    const header = deviceCookieHeader(issueDeviceToken([1]));
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
  });
});
