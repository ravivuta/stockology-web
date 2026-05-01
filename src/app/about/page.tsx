import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Stocks PM by AppAiTech",
  description: "Learn about AppAiTech and the Stocks PM portfolio management app.",
};

export default function AboutPage() {
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
            <Link href="/login" className="no-underline transition-colors hover:text-white">Sign in</Link>
            <Link href="/signup" className="rounded-full border border-emerald-400/35 px-3.5 py-1.5 text-sm font-semibold text-zinc-100 no-underline transition-colors hover:border-emerald-400/55">Sign up</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <h1 className="mb-6 text-3xl font-bold tracking-tight text-white sm:text-4xl">About AppAiTech</h1>

        <div className="space-y-6 text-base leading-relaxed text-zinc-300">
          <p>
            <strong className="text-white">AppAiTech</strong> builds intelligent tools that help everyday investors manage their portfolios with the precision of professional money managers.
          </p>
          <p>
            Our flagship product, <strong className="text-white">Stocks PM</strong>, combines rules-based portfolio optimization, backtesting simulation, and real-time market data into one accessible app — available on iOS and now on the web.
          </p>

          <h2 className="pt-4 text-xl font-semibold text-white">Our mission</h2>
          <p>
            We believe that data-driven investing should be accessible to everyone, not just institutional traders. Stocks PM helps you understand your portfolio, size your positions, and make more informed decisions — without the noise.
          </p>

          <h2 className="pt-4 text-xl font-semibold text-white">What we build</h2>
          <ul className="ml-4 list-disc space-y-2 text-zinc-400 marker:text-emerald-400">
            <li>Portfolio tracking and allocation analysis</li>
            <li>Rules-based buy/sell/hold recommendations</li>
            <li>Backtesting and paper-trading simulation</li>
            <li>Watchlist management and stock screening</li>
            <li>S&amp;P 500 benchmark comparison</li>
          </ul>

          <div className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <p className="text-sm text-zinc-400">
              ⚠️ <strong className="text-zinc-300">Educational &amp; practice trading only.</strong> Stocks PM is designed for learning and simulated portfolio tracking. No real money or actual trades are involved. Nothing on this site constitutes financial advice.
            </p>
          </div>
        </div>

        <div className="mt-14 flex flex-wrap gap-4 border-t border-white/[0.06] pt-10 text-sm text-zinc-500">
          <Link href="/" className="no-underline transition-colors hover:text-zinc-300">Home</Link>
          <Link href="/contact" className="no-underline transition-colors hover:text-zinc-300">Contact</Link>
          <Link href="/privacy" className="no-underline transition-colors hover:text-zinc-300">Privacy</Link>
          <Link href="/terms" className="no-underline transition-colors hover:text-zinc-300">Terms</Link>
          <span className="ml-auto text-zinc-600">© 2026 AppAiTech</span>
        </div>
      </main>
    </div>
  );
}
