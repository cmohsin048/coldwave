import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";

/**
 * Fixed-window rate limiter backed by Redis (INCR + EXPIRE). Fails OPEN — if
 * Redis is unreachable the request is allowed, so an infra hiccup never locks
 * users out of auth flows.
 */
export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const redis = getRedis();
    const redisKey = `ratelimit:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    return { allowed: count <= max, remaining: Math.max(0, max - count) };
  } catch (err) {
    logger.warn("rate limiter unavailable — allowing request", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, remaining: max };
  }
}
