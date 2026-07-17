import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config shared with middleware. It must NOT import the DB
 * adapter, bcrypt, or any Node-only module — middleware runs on the edge
 * runtime. Providers with heavy deps are added in `src/auth.ts`.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [], // populated in src/auth.ts
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/register");
      const isPublic =
        nextUrl.pathname === "/" ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/api/webhooks") ||
        nextUrl.pathname.startsWith("/api/track") ||
        nextUrl.pathname.startsWith("/api/unsubscribe") ||
        nextUrl.pathname.startsWith("/unsubscribe");

      if (isPublic) return true;
      if (isAuthPage) {
        if (isLoggedIn)
          return Response.redirect(new URL("/dashboard", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId && session.user) {
        session.user.id = token.userId as string;
      }
      if (token.activeOrgId && session.user) {
        session.user.activeOrgId = token.activeOrgId as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
