import type { NextConfig } from "next";

const baseSecurityHeaders: { key: string; value: string }[] = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const BASE_PATH = "";

const nextConfig: NextConfig = {
  // Expose basePath to client & server code for manual fetch() calls and redirects
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
  serverExternalPackages: ["papaparse"],
  experimental: {
    optimizePackageImports: ["recharts", "framer-motion", "lucide-react"],
  },
  async headers() {
    const headers = [...baseSecurityHeaders];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
    }
    return [{ source: "/:path*", headers }];
  },
  // /api/python/* routes are served directly by Next.js Route Handlers (no external Flask server).
};

export default nextConfig;
