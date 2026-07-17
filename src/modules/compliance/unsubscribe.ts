import { createHmac } from "node:crypto";
import { getEnv } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";

/**
 * One-click unsubscribe token + RFC 8058 List-Unsubscribe headers.
 *
 * The token is a signed, URL-safe payload so the unsubscribe endpoint can honor
 * a click without a DB lookup for auth (it still writes the suppression row).
 */

export interface UnsubPayload {
  orgId: string;
  email: string;
  campaignId?: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(
    input.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64"
  );
}

function sign(data: string): string {
  return b64url(
    createHmac("sha256", getEnv().AUTH_SECRET).update(data).digest()
  );
}

export function createUnsubToken(payload: UnsubPayload): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyUnsubToken(token: string): UnsubPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  if (!safeEqual(sig, sign(body))) return null;
  try {
    return JSON.parse(b64urlDecode(body).toString("utf8")) as UnsubPayload;
  } catch {
    return null;
  }
}

export function unsubscribeUrl(payload: UnsubPayload): string {
  const token = createUnsubToken(payload);
  // Route handler at /api/unsubscribe supports both a human GET and the
  // RFC 8058 one-click POST from Gmail/Apple.
  return `${getEnv().APP_URL}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Build List-Unsubscribe + List-Unsubscribe-Post headers (RFC 8058). The
 * mailto gives a universal fallback; the https URL + One-Click POST enables
 * Gmail/Apple one-click unsubscribe.
 */
export function buildUnsubscribeHeaders(payload: UnsubPayload): Record<string, string> {
  const url = unsubscribeUrl(payload);
  const mailto = `mailto:unsubscribe@${payload.email.split("@")[1] ?? "example.com"}?subject=unsubscribe`;
  return {
    "List-Unsubscribe": `<${url}>, <${mailto}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
