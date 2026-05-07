import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { withAppBasePath } from "@/lib/base-path";
import { safeRelativeRedirectPath } from "@/lib/safe-redirect";
import { ensureUserHasWebTrial } from "@/lib/billing";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";

function oauthErrorForQuery(message: string): string {
  const s = message.replace(/[\r\n\u0000]/g, " ").trim().slice(0, 200);
  return s || "Sign-in failed";
}

/**
 * OAuth callback: session cookies must be set on the same NextResponse as the redirect,
 * otherwise the browser may not persist the session until a later navigation.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;
  const safeNext = safeRelativeRedirectPath(url.searchParams.get("next"), "/dashboard");

  if (!code) {
    return NextResponse.redirect(`${origin}${withAppBasePath("/login")}?error=${encodeURIComponent("Missing OAuth code")}`);
  }

  const redirectResponse = NextResponse.redirect(`${origin}${withAppBasePath(safeNext)}`);

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          redirectResponse.cookies.set(name, value, options as never);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}${withAppBasePath("/login")}?error=${encodeURIComponent(oauthErrorForQuery(error.message))}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const dataUserId = await syncStocksPmAuthUser(supabase, user.id);
    await ensureUserHasWebTrial(dataUserId);
  }

  return redirectResponse;
}
