"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv, hasValidSupabaseConfig } from "@/lib/supabase/config";

export function createClient() {
  const { url, key } = getSupabaseEnv();
  if (!hasValidSupabaseConfig()) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in stockology-web/.env.local");
  }
  return createBrowserClient(url, key);
}

export function hasSupabaseConfig() {
  return hasValidSupabaseConfig();
}
