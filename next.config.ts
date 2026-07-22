import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without this, stray package.json /
  // lockfiles in the home directory make Next treat C:\Users\<user> as the
  // root and scan far more files than needed.
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  serverExternalPackages: [
    "bullmq",
    "ioredis",
    "imapflow",
    "nodemailer",
    "pg",
    "bcryptjs",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // CSV imports
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
