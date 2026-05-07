import Link from "next/link";
import type { Metadata } from "next";
import { withAppBasePath } from "@/lib/base-path";

export const metadata: Metadata = {
  title: "Privacy — Stocks PM by AppAiTech",
  description: "Privacy policy for Stocks PM and AppAiTech web properties.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#101219] text-zinc-100">
      <header className="border-b border-white/[0.06] bg-[#101219]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <span className="text-base font-semibold text-white">
              Stocks <span className="bg-gradient-to-r from-emerald-300 to-cyan-300 bg-clip-text text-transparent">PM</span>
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-zinc-400">
            <Link href={withAppBasePath("/login")} className="no-underline transition-colors hover:text-white">Sign in</Link>
            <Link href={withAppBasePath("/signup")} className="rounded-full border border-emerald-400/35 px-3.5 py-1.5 text-sm font-semibold text-zinc-100 no-underline transition-colors hover:border-emerald-400/55">Sign up</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <h1 className="mb-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">Privacy policy</h1>

        <div className="space-y-6 text-base leading-relaxed text-zinc-300">
          <p>
            AppAiTech keeps data collection narrow. Stocks PM may store portfolio settings, holdings, snapshots, and account-linked preferences so the web app and iOS app stay in sync.
          </p>
          <p>
            Authentication is handled through Google via Supabase. Billing and subscription events may be processed through Stripe. We do not connect directly to brokerage accounts.
          </p>
          <p>
            Portfolio snapshots and external cash-flow records are stored server-side for history and comparison features. Sensitive snapshot and cash-flow payload fields are encrypted at rest.
          </p>
          <p>
            Browser-local settings such as appearance mode, onboarding completion, and cached market state may also be stored on your device to improve performance and preserve your workspace.
          </p>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <p className="text-sm text-zinc-400">
              This page is a product-facing privacy summary and should be replaced with your finalized legal policy before public launch.
            </p>
          </div>
        </div>

        <div className="mt-14 flex flex-wrap gap-4 border-t border-white/[0.06] pt-10 text-sm text-zinc-500">
          <Link href="/" className="no-underline transition-colors hover:text-zinc-300">Home</Link>
          <Link href="/about" className="no-underline transition-colors hover:text-zinc-300">About</Link>
          <Link href="/contact" className="no-underline transition-colors hover:text-zinc-300">Contact</Link>
          <Link href="/terms" className="no-underline transition-colors hover:text-zinc-300">Terms</Link>
          <span className="ml-auto text-zinc-600">© 2026 AppAiTech</span>
        </div>
      </main>
    </div>
  );
}
