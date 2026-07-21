"use server";

import { headers } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import {
  users,
  organizations,
  memberships,
  passwordResetTokens,
} from "@/db/schema";
import { slugify } from "@/lib/slug";
import { normalizeEmail } from "@/lib/utils";
import { getEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { sendSystemEmail } from "@/lib/mailer";
import { logger } from "@/lib/logger";

const registerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  orgName: z.string().min(1).max(120),
});

export type RegisterResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Self-service registration: creates the user, their organization, and an
 * owner membership in a single transaction. Sign-in happens client-side via
 * the credentials provider after this succeeds.
 */
export async function registerAction(
  raw: z.infer<typeof registerSchema>
): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please check the form and try again." };
  }

  // Throttle registrations per IP (10/hour) to keep bots from farming orgs.
  // headers() throws outside a request scope (scripts, tests) — fall back to
  // a shared bucket there instead of crashing.
  let ip = "unknown";
  try {
    const hdrs = await headers();
    ip =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      hdrs.get("x-real-ip") ??
      "unknown";
  } catch {
    // not in a request context
  }
  const limit = await rateLimit(`register:${ip}`, 10, 60 * 60);
  if (!limit.allowed) {
    return {
      ok: false,
      error: "Too many sign-up attempts. Please try again later.",
    };
  }
  const { name, orgName } = parsed.data;
  const email = normalizeEmail(parsed.data.email);

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    return { ok: false, error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ name, email, passwordHash })
      .returning();

    const [org] = await tx
      .insert(organizations)
      .values({
        name: orgName,
        slug: slugify(orgName),
        companyAddress: getEnv().COMPANY_ADDRESS,
      })
      .returning();

    await tx.insert(memberships).values({
      orgId: org!.id,
      userId: user!.id,
      role: "owner",
    });

    await tx
      .update(users)
      .set({ activeOrgId: org!.id })
      .where(eq(users.id, user!.id));
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export type PasswordResetResult =
  | { ok: true }
  | { ok: false; error: string };

async function clientIp(): Promise<string> {
  // headers() throws outside a request scope (scripts, tests).
  try {
    const hdrs = await headers();
    return (
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      hdrs.get("x-real-ip") ??
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

/**
 * Step 1: request a reset link. Always answers with the same generic success
 * for unknown emails so accounts can't be enumerated.
 */
export async function requestPasswordResetAction(
  rawEmail: string
): Promise<PasswordResetResult> {
  const parsed = z.string().email().safeParse(rawEmail);
  if (!parsed.success) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  const email = normalizeEmail(parsed.data);

  const ip = await clientIp();
  const [ipLimit, emailLimit] = await Promise.all([
    rateLimit(`pwreset:ip:${ip}`, 10, 60 * 60),
    rateLimit(`pwreset:email:${email}`, 3, 60 * 60),
  ]);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return {
      ok: false,
      error: "Too many reset requests. Please try again later.",
    };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (!user) {
    // Generic success — do not reveal whether the account exists.
    return { ok: true };
  }

  const token = nanoid(48);
  await db.transaction(async (tx) => {
    // A new request invalidates any older outstanding links.
    await tx
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt)
        )
      );
    await tx.insert(passwordResetTokens).values({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });
  });

  const resetUrl = `${getEnv().APP_URL}/reset-password/${token}`;
  const sent = await sendSystemEmail({
    to: email,
    subject: "Reset your ColdWave password",
    text: `Hi${user.name ? ` ${user.name}` : ""},

We received a request to reset the password for your ColdWave account.

Reset it here (link valid for 1 hour):
${resetUrl}

If you didn't request this, you can safely ignore this email — your password will not change.

— ColdWave`,
  });

  if (!sent) {
    logger.error("password reset email could not be sent", { userId: user.id });
    return {
      ok: false,
      error: "We couldn't send the reset email. Please try again later.",
    };
  }
  return { ok: true };
}

/** Look up whether a reset token is currently valid (for the reset page). */
export async function isResetTokenValid(token: string): Promise<boolean> {
  if (!token) return false;
  const row = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.token, token),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date())
    ),
  });
  return !!row;
}

/** Step 2: consume the token and set the new password. */
export async function resetPasswordAction(input: {
  token: string;
  password: string;
}): Promise<PasswordResetResult> {
  const parsed = z
    .object({ token: z.string().min(1), password: z.string().min(8).max(200) })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Password must be at least 8 characters long.",
    };
  }

  const ipLimit = await rateLimit(`pwreset:confirm:${await clientIp()}`, 10, 60 * 60);
  if (!ipLimit.allowed) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const row = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.token, parsed.data.token),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date())
    ),
  });
  if (!row) {
    return {
      ok: false,
      error: "This reset link is invalid or has expired. Request a new one.",
    };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, row.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));
  });

  return { ok: true };
}
