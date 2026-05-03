import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // eodhd uses CommonJS and native Node.js modules internally —
  // mark as serverExternalPackage to prevent Next.js from bundling it.
  // Moved from experimental.serverComponentsExternalPackages to top-level in Next.js 15+.
  serverExternalPackages: ['eodhd', 'yahoo-finance2'],
};

export default nextConfig;
