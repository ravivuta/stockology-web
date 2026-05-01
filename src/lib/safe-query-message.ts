/** Sanitize user-visible messages from URL query params (e.g. OAuth errors). */
export function safeQueryMessage(raw: string | null | undefined, maxLen = 280): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (!t) return null;
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}
