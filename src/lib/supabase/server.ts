import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv, hasValidSupabaseConfig } from "@/lib/supabase/config";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();
  if (!hasValidSupabaseConfig()) {
    throw new Error("Set valid NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in stockology-web/.env.local");
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(list: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options as never));
        } catch { /* Server Component */ }
      },
    },
  });
}
