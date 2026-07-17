import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Middleware uses the edge-safe config only (no DB adapter / bcrypt).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg)).*)"],
};
