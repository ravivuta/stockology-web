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
  async rewrites() {
    return [
      {
        source: "/stocks-pm/brand/:path*",
        destination: "/brand/:path*",
      },
      {
        source: "/stocks-pm/landing/:path*",
        destination: "/landing/:path*",
      },
      // Serve marketing/legal pages under the /stocks-pm/ namespace
      { source: "/stocks-pm/privacy", destination: "/privacy" },
      { source: "/stocks-pm/terms", destination: "/terms" },
      { source: "/stocks-pm/about", destination: "/about" },
      { source: "/stocks-pm/contact", destination: "/contact" },
    ];
  },
  async redirects() {
    return [
      // Legacy / alternate privacy-policy URLs → canonical /stocks-pm/privacy
      {
        source: "/privacy-policy-2",
        destination: "/stocks-pm/privacy",
        permanent: true,
      },
      {
        source: "/privacy-policy",
        destination: "/stocks-pm/privacy",
        permanent: true,
      },
      {
        source: "/privacy",
        destination: "/stocks-pm/privacy",
        permanent: false,
      },
    ];
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
