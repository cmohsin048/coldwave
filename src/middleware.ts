import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Middleware uses the edge-safe config only (no DB adapter / bcrypt).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except API routes, static assets, and Next internals.
  // API routes are excluded: they are all public or self-authenticated (see
  // the `authorized` callback), and running the auth middleware over them
  // 404s every route handler under `next start` (works in dev only).
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg)).*)",
  ],
};
