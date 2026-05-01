"use client";

import { useEffect, useState, Suspense } from "react";
import { TransitionLink } from "@/components/TransitionLink";
import { useSearchParams } from "next/navigation";
import { googleOAuthSignInOptions } from "@/lib/auth/googleOAuth";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { AuthBrandMark } from "@/components/auth/AuthBrandMark";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { GoogleOAuthButton } from "@/components/auth/GoogleOAuthButton";
import { ShieldCheck } from "lucide-react";
import { AuthLoginPageSkeleton } from "@/components/route-loading/skeletons";
import { useShellRouteTransition } from "@/components/LandingViewTransition";
import { safeQueryMessage } from "@/lib/safe-query-message";

function LoginInner() {
  const { replaceWithTransition } = useShellRouteTransition();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = safeQueryMessage(searchParams.get("error"));
    if (q) setError(q);
  }, [searchParams]);

  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    let cancelled = false;
    void createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (cancelled) return;
        if (data.session) replaceWithTransition("/dashboard");
      });
    return () => {
      cancelled = true;
    };
  }, [replaceWithTransition]);

  async function onGoogle() {
    setError(null);
    if (!hasSupabaseConfig()) {
      setError("Sign-in isn’t configured for this site.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: googleOAuthSignInOptions(origin),
      });
      if (err) throw err;
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
      throw new Error("Couldn’t start sign-in. Try again or contact support.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setLoading(false);
    }
  }

  return (
    <>
      <AuthBrandMark />
      <AuthPanel>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/90">Welcome back</p>
        <h1 className="text-balance text-2xl font-bold tracking-tight text-white sm:text-[1.65rem]">Sign in</h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-zinc-400">
          Same Google account as the Stocks PM iPhone app — allocation, performance, and recommendations in the browser.
        </p>

        {!hasSupabaseConfig() && (
          <p className="mt-5 rounded-xl border border-primary/30 bg-primary/10 p-3.5 text-sm font-medium leading-snug text-zinc-100">
            Cloud sign-in isn’t set up for this deployment. For local dev, add your Supabase URL and anon key to{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-emerald-200/90">.env.local</code>.
          </p>
        )}
        {error && (
          <p className="mt-5 rounded-xl border border-red-500/35 bg-red-500/10 p-3.5 text-sm font-medium text-red-200">
            {error}
          </p>
        )}

        <div className="mt-8">
          <GoogleOAuthButton loading={loading} onClick={onGoogle} label="Continue with Google" />
        </div>

        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/80" strokeWidth={1.75} aria-hidden />
          <p className="text-xs leading-relaxed text-zinc-500">
            We never link your brokerage. Sign-in is only to sync your Stocks PM profile and encrypted portfolio data.
          </p>
        </div>

        <div className="mt-8 border-t border-white/[0.08] pt-6 text-center text-sm">
          <p className="text-zinc-500">
            New here?{" "}
            <TransitionLink
              href="/signup"
              prefetch={false}
              className="font-semibold text-emerald-400/95 no-underline underline-offset-4 hover:text-emerald-300 hover:underline"
            >
              Create an account
            </TransitionLink>
          </p>
          <p className="mt-3">
            <TransitionLink
              href="/"
              prefetch={false}
              className="font-medium text-zinc-500 no-underline transition-colors hover:text-zinc-300 hover:underline"
            >
              ← Back to home
            </TransitionLink>
          </p>
        </div>
      </AuthPanel>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLoginPageSkeleton />}>
      <LoginInner />
    </Suspense>
  );
}
