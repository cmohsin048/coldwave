"use server";

import { headers } from "next/headers";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, organizations, memberships } from "@/db/schema";
import { slugify } from "@/lib/slug";
import { normalizeEmail } from "@/lib/utils";
import { getEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

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
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    "unknown";
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
