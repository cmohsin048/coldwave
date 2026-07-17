import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "@/db/schema";

/**
 * Postgres connection using node-postgres. This wire protocol works against a
 * local Postgres in dev and Neon's pooled endpoint in production, so the same
 * client covers app runtime, workers, and scripts.
 */

declare global {
  // eslint-disable-next-line no-var
  var __coldwavePool: Pool | undefined;
}

function createPool(): Pool {
  return new Pool({
    connectionString: getEnv().DATABASE_URL,
    max: 10,
    // Neon requires SSL; connection string carries sslmode=require.
  });
}

// Reuse the pool across HMR reloads in dev to avoid exhausting connections.
const pool = global.__coldwavePool ?? createPool();
if (getEnv().NODE_ENV !== "production") {
  global.__coldwavePool = pool;
}

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export { schema };
