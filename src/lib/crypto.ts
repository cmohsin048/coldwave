import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * AES-256-GCM authenticated encryption for secrets at rest (mailbox
 * credentials, OAuth tokens, API keys stored per-org).
 *
 * Serialized format (base64):  [12-byte IV][16-byte auth tag][ciphertext]
 *
 * The key comes from ENCRYPTION_KEY (32 raw bytes, base64-encoded). Rotate by
 * introducing a versioned key map if needed; for now a single key is used.
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // 96-bit nonce recommended for GCM
const TAG_LEN = 16;

let keyCache: Buffer | null = null;

function getKey(): Buffer {
  if (keyCache) return keyCache;
  const raw = getEnv().ENCRYPTION_KEY;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Generate with: openssl rand -base64 32`
    );
  }
  keyCache = key;
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(serialized: string): string {
  const data = Buffer.from(serialized, "base64");
  if (data.length < IV_LEN + TAG_LEN) {
    throw new Error("Ciphertext too short / malformed");
  }
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = data.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Encrypt a JSON-serializable object. */
export function encryptJson(value: unknown): string {
  return encrypt(JSON.stringify(value));
}

/** Decrypt back into a typed object. Caller asserts the shape. */
export function decryptJson<T>(serialized: string): T {
  return JSON.parse(decrypt(serialized)) as T;
}

/** Constant-time string comparison (e.g. webhook signatures). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
