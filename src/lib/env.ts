import { z } from "zod";

/**
 * Centralized, validated environment access.
 *
 * Server-only variables are validated lazily so that importing this module in a
 * client bundle (which Next may do transitively) does not throw. Access
 * `serverEnv` only from server code (Server Components, Server Actions, Route
 * Handlers, workers).
 */

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be set (openssl rand -base64 32)"),
  AUTH_TRUST_HOST: z
    .string()
    .optional()
    .transform((v) => v === "true"),

  ENCRYPTION_KEY: z
    .string()
    .min(1, "ENCRYPTION_KEY is required (32 bytes, base64)"),

  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  APOLLO_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),

  SYSTEM_SMTP_HOST: z.string().optional(),
  SYSTEM_SMTP_PORT: z.coerce.number().default(587),
  SYSTEM_SMTP_USER: z.string().optional(),
  SYSTEM_SMTP_PASS: z.string().optional(),
  SYSTEM_MAIL_FROM: z.string().default("ColdWave <no-reply@localhost>"),

  COMPANY_NAME: z.string().default("Your Company, Inc."),
  COMPANY_ADDRESS: z
    .string()
    .default("123 Example St, City, ST 00000, USA"),

  SPAMASSASSIN_HOST: z.string().default("127.0.0.1"),
  SPAMASSASSIN_PORT: z.coerce.number().default(783),
  SPAM_SCORE_BLOCK_THRESHOLD: z.coerce.number().min(0).max(10).default(5),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Public (browser-safe) values. Only NEXT_PUBLIC_* style constants belong here. */
export const publicEnv = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
};
