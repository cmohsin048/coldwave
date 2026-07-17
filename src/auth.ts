import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  memberships,
} from "@/db/schema";
import { authConfig } from "@/auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/**
 * Full NextAuth setup (Node runtime). Uses the Drizzle adapter for user/account
 * persistence and a Credentials provider (email + bcrypt password) so there is
 * no dependency on any external auth service or API key.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await db.query.users.findFirst({
          where: eq(users.email, email.toLowerCase()),
        });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id;
      }
      // On first login (or when active org missing), resolve a default org.
      if (token.userId && !token.activeOrgId) {
        const membership = await db.query.memberships.findFirst({
          where: eq(memberships.userId, token.userId as string),
        });
        token.activeOrgId = membership?.orgId;
        token.role = membership?.role;
      }
      // Allow client-triggered org switch: await updateSession({ activeOrgId })
      if (trigger === "update" && session?.activeOrgId) {
        token.activeOrgId = session.activeOrgId;
      }
      return token;
    },
  },
});
