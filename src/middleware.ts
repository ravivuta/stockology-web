import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { APP_BASE_PATH, normalizeAppPathname, withAppBasePath } from "@/lib/base-path";
import { getSupabaseEnv, hasValidSupabaseConfig } from "@/lib/supabase/config";

function isLegacyAppPath(pathname: string): boolean {
  const exact = new Set([
    "/login",
    "/signup",
    "/dashboard",
    "/portfolio",
    "/watchlist",
    "/news",
    "/settings",
    "/help",
    "/simulation",
    "/optimization",
    "/onboarding",
    "/csv-help",
    "/profile",
  ]);
  if (exact.has(pathname)) return true;
  return (
    pathname.startsWith("/billing/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/stock/")
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === APP_BASE_PATH) {
    return NextResponse.redirect(new URL(withAppBasePath("/dashboard"), request.url));
  }

  if (isLegacyAppPath(pathname)) {
    return NextResponse.redirect(new URL(withAppBasePath(pathname), request.url));
  }

  const rewrittenPathname =
    pathname.startsWith(`${APP_BASE_PATH}/`) ? normalizeAppPathname(pathname) : null;
  const rewrittenUrl = rewrittenPathname
    ? new URL(`${rewrittenPathname}${request.nextUrl.search}`, request.url)
    : null;

  let response = rewrittenUrl ? NextResponse.rewrite(rewrittenUrl) : NextResponse.next({ request });
  const { url, key } = getSupabaseEnv();
  if (!hasValidSupabaseConfig()) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = rewrittenUrl ? NextResponse.rewrite(rewrittenUrl) : NextResponse.next({ request });
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
