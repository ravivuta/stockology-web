import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options as never));
      },
    },
  });
  try {
    await supabase.auth.getUser();
  } catch {
    // Offline / invalid Supabase URL: continue without session refresh (same as app root).
  }
  return response;
}

export const config = {
  // Skip Flask-proxied API routes — refreshing session on every /api/python/* call added large latency.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/python|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
