import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes, type Mailbox } from "@/db/schema";
import { checkRateLimit, type RateLimitConfig } from "./rate-limiter";

function rateCfg(m: Mailbox): RateLimitConfig {
  return {
    hourlyLimit: m.hourlySendLimit,
    dailyLimit: m.dailySendLimit,
    minDelaySeconds: m.minDelaySeconds,
    maxDelaySeconds: m.maxDelaySeconds,
  };
}

/**
 * Pick the next mailbox from a campaign's sending pool (rotation) that is
 * currently allowed to send. Rotation is round-robin-ish: we sort by last send
 * time so the least-recently-used allowed mailbox goes next, spreading volume
 * across the pool and domains.
 */
export async function pickMailbox(
  orgId: string,
  poolIds: string[]
): Promise<{ mailbox: Mailbox; retryAfterSeconds?: number } | { mailbox: null; retryAfterSeconds: number }> {
  const where = poolIds.length
    ? and(eq(mailboxes.orgId, orgId), inArray(mailboxes.id, poolIds))
    : eq(mailboxes.orgId, orgId);

  const candidates = (await db.select().from(mailboxes).where(where)).filter(
    (m) => m.status === "active" || m.status === "warming"
  );

  // Least-recently-used first.
  candidates.sort(
    (a, b) =>
      (a.lastSentAt?.getTime() ?? 0) - (b.lastSentAt?.getTime() ?? 0)
  );

  let soonest = Number.MAX_SAFE_INTEGER;
  for (const m of candidates) {
    const decision = await checkRateLimit(m.id, rateCfg(m));
    if (decision.allowed) return { mailbox: m };
    if (decision.retryAfterSeconds)
      soonest = Math.min(soonest, decision.retryAfterSeconds);
  }

  // Nothing available now; tell caller when to retry (cap at 1h).
  return {
    mailbox: null,
    retryAfterSeconds: soonest === Number.MAX_SAFE_INTEGER ? 3600 : soonest,
  };
}
