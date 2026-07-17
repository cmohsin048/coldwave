import { promises as dns } from "node:dns";
import { emailDomain } from "@/lib/utils";

/**
 * Lightweight email verification used before import. Combines:
 *   - syntax check,
 *   - disposable-domain check,
 *   - MX record lookup (deliverable domain),
 *   - Apollo's own `email_status` signal when available.
 *
 * For production-grade SMTP mailbox probing, wire a provider (ZeroBounce,
 * NeverBounce, MillionVerifier) into `verifyExternal()`.
 */

export type Verification =
  | "valid"
  | "invalid"
  | "catch_all"
  | "risky"
  | "disposable"
  | "unknown";

// A small starter list; extend from a maintained source in production.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "trashmail.com",
  "yopmail.com",
  "getnada.com",
  "dispostable.com",
]);

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const mxCache = new Map<string, boolean>();

async function hasMx(domain: string): Promise<boolean> {
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  try {
    const records = await dns.resolveMx(domain);
    const ok = records.length > 0;
    mxCache.set(domain, ok);
    return ok;
  } catch {
    mxCache.set(domain, false);
    return false;
  }
}

export function mapApolloEmailStatus(status?: string): Verification {
  switch (status) {
    case "verified":
      return "valid";
    case "likely_to_engage":
      return "valid";
    case "guessed":
      return "risky";
    case "unavailable":
    case "bounced":
      return "invalid";
    default:
      return "unknown";
  }
}

export async function verifyEmail(
  email: string,
  apolloStatus?: string
): Promise<Verification> {
  if (!email || !EMAIL_RE.test(email)) return "invalid";

  const domain = emailDomain(email);
  if (DISPOSABLE_DOMAINS.has(domain)) return "disposable";

  const mx = await hasMx(domain);
  if (!mx) return "invalid";

  // Trust Apollo's stronger signal when it says verified.
  const apollo = mapApolloEmailStatus(apolloStatus);
  if (apollo === "valid") return "valid";
  if (apollo === "invalid") return "invalid";

  // MX exists but no stronger signal → risky (deliverable domain, unproven box).
  return apollo === "unknown" ? "risky" : apollo;
}
