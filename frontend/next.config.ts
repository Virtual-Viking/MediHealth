import type { NextConfig } from "next";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const backendEnvPath = path.resolve(__dirname, "../backend/.env");
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: false });
}

if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && process.env.GOOGLE_MAPS_API_KEY) {
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
}

/**
 * Keep two separate environment variables for API access:
 * - NEXT_PUBLIC_API_URL      -> used **in the browser** when we need direct access to a public API origin
 * - INTERNAL_API_URL         -> used **only by Next.js rewrites** so the server can proxy to private origins
 *
 * This prevents leaking private hosts such as http://localhost:8000 to end users when the
 * app is deployed to a public environment (which previously caused network failures).
 */
const getRewriteTarget = () => {
  const candidate =
    process.env.INTERNAL_API_URL?.trim() ||
    process.env.API_SERVER_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://localhost:8000";

  return candidate.replace(/\/$/, "");
};

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",

  // Disable strict mode in production if needed
  reactStrictMode: true,

  // ESLint configuration - don't fail build on warnings
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors. Only use if you really need to.
    ignoreDuringBuilds: false, // Keep false to catch errors, but warnings won't fail build
  },

  // Configure API rewrites
  // NOTE: When using Cloudflare tunnel with /api routing, Next.js rewrites may conflict.
  // If Cloudflare is routing /api directly to backend, consider disabling rewrites.
  async rewrites() {
    // Check if we should disable rewrites (when Cloudflare handles /api routing)
    const disableRewrites = process.env.DISABLE_API_REWRITES === "true";
    
    if (disableRewrites) {
      // Return empty array to disable rewrites - let Cloudflare handle /api routing
      return [];
    }

    const destination = `${getRewriteTarget()}/:path*`;

    return [
      {
        source: "/api/:path*",
        destination,
      },
    ];
  },
};

export default nextConfig;
