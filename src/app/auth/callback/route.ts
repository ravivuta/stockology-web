import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeRelativeRedirectPath } from "@/lib/safe-redirect";

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
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Missing OAuth code")}`);
  }

  const redirectResponse = NextResponse.redirect(`${origin}${safeNext}`);

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
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(oauthErrorForQuery(error.message))}`);
  }

  return redirectResponse;
}
