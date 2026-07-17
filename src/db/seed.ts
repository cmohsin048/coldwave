import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, organizations, memberships } from "@/db/schema";
import { slugify } from "@/lib/slug";
import { getEnv } from "@/lib/env";

/**
 * Seed a demo workspace so you can log in immediately after setup.
 *   npm run db:seed
 * Credentials: demo@coldwave.test / password123
 */
async function main() {
  const email = "demo@coldwave.test";
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    console.log("Demo user already exists:", email);
    return;
  }

  const passwordHash = await bcrypt.hash("password123", 12);

  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ name: "Demo User", email, passwordHash })
      .returning();

    const [org] = await tx
      .insert(organizations)
      .values({
        name: "ColdWave Demo",
        slug: slugify("ColdWave Demo"),
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

  console.log("Seeded demo workspace.");
  console.log("Login:  demo@coldwave.test");
  console.log("Pass:   password123");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
