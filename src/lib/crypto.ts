import crypto from "node:crypto";

// AES-256-GCM encryption-at-rest for customer/owner chat messages. The key comes from
// MESSAGE_ENCRYPTION_KEY (32 bytes, base64) supplied via the k8s app-secrets Secret.
// This is NOT end-to-end: the server holds the key and decrypts server-side so the owner
// can read messages in /admin and we can include a snippet in notification emails. It
// protects the data at rest (DB dumps / backups), not from the application itself.

export type Sealed = {
  ciphertext: string; // base64
  iv: string; // base64 (12 raw bytes)
  authTag: string; // base64 (16 raw bytes)
};

let warnedDevKey = false;

function getKey(): Buffer {
  const raw = process.env.MESSAGE_ENCRYPTION_KEY;
  if (raw) {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error("MESSAGE_ENCRYPTION_KEY must decode to 32 bytes (generate with: openssl rand -base64 32)");
    }
    return key;
  }
  // No key configured. In real production that's a misconfiguration; mirror getNextAuthSecret
  // and refuse rather than silently encrypting with a publicly-known key. Outside production
  // (local dev, Vitest) derive a deterministic insecure key so round-trips work with zero config.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuildPhase) {
    throw new Error("MESSAGE_ENCRYPTION_KEY must be set in production");
  }
  if (!warnedDevKey) {
    console.warn(
      "[crypto] MESSAGE_ENCRYPTION_KEY is unset — using the insecure development key. Do not use in production.",
    );
    warnedDevKey = true;
  }
  return crypto.createHash("sha256").update("dev-insecure-message-key").digest();
}

export function encryptMessage(plaintext: string): Sealed {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

// Throws if the key is wrong or the ciphertext/tag was tampered with. Callers that render
// a whole thread should catch per-row so one bad/rotated message can't crash the page.
export function decryptMessage(sealed: Sealed): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
