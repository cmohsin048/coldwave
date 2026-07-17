import IORedis, { type Redis } from "ioredis";
import { getEnv } from "@/lib/env";

/**
 * Shared Redis connection factory for BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the connection it uses for
 * blocking commands. We keep a single lazy singleton for the app process and a
 * separate factory for workers that need their own connection.
 */

let connection: Redis | null = null;

export function getRedis(): Redis {
  if (connection) return connection;
  connection = new IORedis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  connection.on("error", (err) => {
    // Avoid crashing on transient disconnects; ioredis auto-reconnects.
    console.error(JSON.stringify({ level: "error", msg: "redis error", err: err.message }));
  });
  return connection;
}

/** Create a fresh connection (workers should not share the app singleton). */
export function createRedisConnection(): Redis {
  return new IORedis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
