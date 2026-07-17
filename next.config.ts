import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
