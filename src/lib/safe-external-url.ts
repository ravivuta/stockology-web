/**
 * Allow only http(s) URLs for user-controlled hrefs (e.g. news links from DB).
 * Blocks javascript:, data:, etc.
 */
export function safeHttpUrlForHref(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.hostname.length === 0) return null;
  return u.href;
}
