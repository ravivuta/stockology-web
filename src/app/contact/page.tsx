import Link from "next/link";
import type { Metadata } from "next";
import { withAppBasePath } from "@/lib/base-path";

export const metadata: Metadata = {
  title: "Contact — Stocks PM by AppAiTech",
  description: "Get in touch with the AppAiTech team.",
};

export default function ContactPage() {
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

      <main className="mx-auto max-w-2xl px-4 py-20 sm:px-6 sm:py-28">
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">Contact us</h1>
        <p className="mb-10 text-base text-zinc-400">
          Have a question, feedback, or need support? We&apos;d love to hear from you.
        </p>

        <div className="space-y-5">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <h2 className="mb-2 text-base font-semibold text-white">General enquiries</h2>
            <p className="text-sm text-zinc-400">
              For product questions and general feedback, email us at{" "}
              <a href="mailto:appaitechmanager@gmail.com" className="text-emerald-400 no-underline hover:underline">
                appaitechmanager@gmail.com
              </a>
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <h2 className="mb-2 text-base font-semibold text-white">Technical support</h2>
            <p className="text-sm text-zinc-400">
              Experiencing an issue with the app? Include your username or account email and a short description and we&apos;ll get back to you within 1–2 business days.
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <h2 className="mb-2 text-base font-semibold text-white">Subscription &amp; billing</h2>
            <p className="text-sm text-zinc-400">
              Subscriptions are managed through the App Store. For billing issues, visit your{" "}
              <a href="https://support.apple.com/en-us/118223" target="_blank" rel="noopener noreferrer" className="text-emerald-400 no-underline hover:underline">
                Apple subscription settings
              </a>
              .
            </p>
          </div>
        </div>

        <div className="mt-14 flex flex-wrap gap-4 border-t border-white/[0.06] pt-10 text-sm text-zinc-500">
          <Link href="/" className="no-underline transition-colors hover:text-zinc-300">Home</Link>
          <Link href="/about" className="no-underline transition-colors hover:text-zinc-300">About</Link>
          <Link href="/privacy" className="no-underline transition-colors hover:text-zinc-300">Privacy</Link>
          <Link href="/terms" className="no-underline transition-colors hover:text-zinc-300">Terms</Link>
          <span className="ml-auto text-zinc-600">© 2026 AppAiTech</span>
        </div>
      </main>
    </div>
  );
}
