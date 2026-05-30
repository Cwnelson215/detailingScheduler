import { describe, it, expect, afterEach } from "vitest";
import crypto from "node:crypto";
import { encryptMessage, decryptMessage } from "./crypto";

describe("crypto (message encryption)", () => {
  const original = process.env.MESSAGE_ENCRYPTION_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.MESSAGE_ENCRYPTION_KEY;
    else process.env.MESSAGE_ENCRYPTION_KEY = original;
  });

  it("round-trips a message (dev-key fallback, no env)", () => {
    delete process.env.MESSAGE_ENCRYPTION_KEY;
    const sealed = encryptMessage("hello world");
    expect(sealed.ciphertext).not.toContain("hello");
    expect(decryptMessage(sealed)).toBe("hello world");
  });

  it("round-trips with a real 32-byte key", () => {
    process.env.MESSAGE_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    const sealed = encryptMessage("café ☕ unicode");
    expect(decryptMessage(sealed)).toBe("café ☕ unicode");
  });

  it("uses a fresh IV per call", () => {
    delete process.env.MESSAGE_ENCRYPTION_KEY;
    const a = encryptMessage("same");
    const b = encryptMessage("same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("throws when the auth tag is tampered with", () => {
    delete process.env.MESSAGE_ENCRYPTION_KEY;
    const sealed = encryptMessage("secret");
    const badTag = Buffer.from(sealed.authTag, "base64");
    badTag[0] ^= 0xff;
    expect(() => decryptMessage({ ...sealed, authTag: badTag.toString("base64") })).toThrow();
  });

  it("rejects a key that is not 32 bytes", () => {
    process.env.MESSAGE_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptMessage("x")).toThrow(/32 bytes/);
  });
});
