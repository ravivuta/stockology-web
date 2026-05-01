function isPlaceholder(value: string): boolean {
  const v = value.trim();
  return !v || v.includes("REPLACE_WITH_YOUR");
}

export function getSupabaseEnv() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return { url, key };
}

export function hasValidSupabaseConfig() {
  const { url, key } = getSupabaseEnv();
  return !isPlaceholder(url) && !isPlaceholder(key);
}
