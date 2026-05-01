/**
 * Validates a post-login path for OAuth callbacks. Rejects open redirects
 * (e.g. //evil.com, /\evil, javascript: via encoded forms) and overlong paths.
 */
export function safeRelativeRedirectPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (raw == null || typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (t.length === 0 || t.length > 2048) return fallback;
  if (!t.startsWith("/")) return fallback;
  if (t.startsWith("//")) return fallback;
  if (t.includes("\\") || t.includes("\0")) return fallback;
  const lower = t.toLowerCase();
  if (lower.includes("://")) return fallback;
  // Path-only: avoid userinfo-style paths that confuse older parsers
  if (t.slice(1).includes("@")) return fallback;
  return t;
}
