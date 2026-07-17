import { getRedis } from "@/lib/redis";
import { randomInt } from "@/lib/utils";

/**
 * Per-mailbox send rate limiting backed by Redis counters, plus randomized
 * human-like inter-send delays. Enforces:
 *   - max sends per hour per mailbox,
 *   - max sends per day per mailbox,
 *   - a randomized 30-180s (configurable) gap between consecutive sends.
 */

export interface RateLimitConfig {
  hourlyLimit: number;
  dailyLimit: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
}

function hourKey(mailboxId: string): string {
  const h = new Date().toISOString().slice(0, 13); // yyyy-mm-ddThh
  return `cw:rl:${mailboxId}:h:${h}`;
}
function dayKey(mailboxId: string): string {
  const d = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
  return `cw:rl:${mailboxId}:d:${d}`;
}
function lastSendKey(mailboxId: string): string {
  return `cw:rl:${mailboxId}:last`;
}

export interface RateDecision {
  allowed: boolean;
  reason?: "hourly" | "daily" | "cooldown";
  /** Seconds to wait before this mailbox may send again. */
  retryAfterSeconds?: number;
}

/** Check whether a mailbox may send right now (without consuming quota). */
export async function checkRateLimit(
  mailboxId: string,
  cfg: RateLimitConfig
): Promise<RateDecision> {
  const redis = getRedis();
  const [hourStr, dayStr, lastStr] = await redis.mget(
    hourKey(mailboxId),
    dayKey(mailboxId),
    lastSendKey(mailboxId)
  );
  const hour = Number(hourStr ?? 0);
  const day = Number(dayStr ?? 0);
  const last = Number(lastStr ?? 0);

  if (day >= cfg.dailyLimit) return { allowed: false, reason: "daily" };
  if (hour >= cfg.hourlyLimit) return { allowed: false, reason: "hourly" };

  const now = Date.now();
  const cooldownMs =
    randomInt(cfg.minDelaySeconds, cfg.maxDelaySeconds) * 1000;
  if (last && now - last < cooldownMs) {
    return {
      allowed: false,
      reason: "cooldown",
      retryAfterSeconds: Math.ceil((cooldownMs - (now - last)) / 1000),
    };
  }
  return { allowed: true };
}

/** Consume one unit of quota after a successful send. */
export async function consumeRateLimit(mailboxId: string): Promise<void> {
  const redis = getRedis();
  const hk = hourKey(mailboxId);
  const dk = dayKey(mailboxId);
  const multi = redis.multi();
  multi.incr(hk).expire(hk, 3600);
  multi.incr(dk).expire(dk, 86400);
  multi.set(lastSendKey(mailboxId), Date.now().toString(), "EX", 86400);
  await multi.exec();
}

/** A randomized delay (ms) to schedule the next send for human-like pacing. */
export function nextSendDelayMs(cfg: RateLimitConfig): number {
  return randomInt(cfg.minDelaySeconds, cfg.maxDelaySeconds) * 1000;
}
