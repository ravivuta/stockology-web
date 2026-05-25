import Link from "next/link";
import type { Metadata } from "next";
import { withAppBasePath } from "@/lib/base-path";

export const metadata: Metadata = {
  title: "Terms — Stocks PM by AppAiTech",
  description: "Terms of use for Stocks PM and AppAiTech web properties.",
};

export default function TermsPage() {
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
        <h1 className="mb-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">Terms of use</h1>

        <div className="space-y-6 text-base leading-relaxed text-zinc-300">
          <p>
            Stocks PM is provided for educational, analytical, and simulated portfolio management purposes only. Nothing on this site or in the app is investment, tax, legal, or brokerage advice.
          </p>
          <p>
            You are responsible for the accuracy of any holdings, cash balances, watchlists, manual cash adjustments, or imported CSV data that you provide.
          </p>
          <p>
            Market data, analyst targets, news, and recommendation outputs are provided on a best-effort basis. Availability, timeliness, and completeness are not guaranteed.
          </p>
          <p>
            AppAiTech may change, suspend, or remove features at any time. Use of the product is at your own risk.
          </p>
        </div>

        <div className="mt-14 flex flex-wrap gap-4 border-t border-white/[0.06] pt-10 text-sm text-zinc-500">
          <Link href="/" className="no-underline transition-colors hover:text-zinc-300">Home</Link>
          <Link href="/about" className="no-underline transition-colors hover:text-zinc-300">About</Link>
          <Link href="/contact" className="no-underline transition-colors hover:text-zinc-300">Contact</Link>
          <Link href="/privacy" className="no-underline transition-colors hover:text-zinc-300">Privacy</Link>
          <span className="ml-auto text-zinc-600">© 2026 AppAiTech</span>
        </div>
      </main>
    </div>
  );
}
