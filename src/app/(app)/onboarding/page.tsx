"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { appCtaButton } from "@/lib/appCtaClasses";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { runRefreshPipeline } from "@/lib/refresh";
import { usePortfolioStore } from "@/store/portfolioStore";
import { STOCKS_PM_ONBOARDING_USER_META_KEY } from "@/lib/onboarding-meta";
import { flushCurrentPortfolioSnapshotNow } from "@/lib/portfolio-snapshot-client";
import { recordExternalCashFlow } from "@/lib/external-cash-flows";

const steps = [
  { title: "Strategy", body: "Practice emotionless rules: buy near moving averages, scale in, take profits at targets." },
  { title: "Recommendations", body: "Signals use trend, targets, and position limits — all educational, not financial advice." },
  { title: "Cash", body: "Set cash available so position sizing matches your capital." },
  { title: "Risk", body: "Pick a risk level to filter which names surface in recommendations." },
  { title: "Disclaimer", body: "Educational companion only—not investment advice. Nothing here moves money or links a broker." },
];

export default function OnboardingPage() {
  const [i, setI] = useState(0);
  const [cash, setCash] = useState("10000");
  const [risk, setRisk] = useState<"Low" | "Medium" | "High">("Medium");
  const [isFinishing, setIsFinishing] = useState(false);
  const setCashStore = usePortfolioStore((s) => s.setCash);
  const setSettings = usePortfolioStore((s) => s.setSettings);
  const setOnboardingComplete = usePortfolioStore((s) => s.setOnboardingComplete);
  const addStock = usePortfolioStore((s) => s.addStock);
  const router = useRouter();

  async function fetchStarterSymbols() {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_top_recommended_stocks");
      if (error) throw error;
      if (!Array.isArray(data)) return [];

      const symbols = data
        .map((row) => (typeof row?.symbol === "string" ? row.symbol.trim().toUpperCase() : ""))
        .filter(Boolean);

      return symbols.length > 0 ? [...new Set(symbols)] : [];
    } catch (error) {
      console.warn("[onboarding starter symbols]", error);
      return [];
    }
  }

  async function finish() {
    if (isFinishing) return;
    setIsFinishing(true);

    const v = parseFloat(cash.replace(/,/g, "")) || 0;
    const starterSymbols = await fetchStarterSymbols();

    try {
      setCashStore(v);
      if (v > 0) {
        const flowResult = await recordExternalCashFlow({
          amount: v,
          flowType: "deposit",
          source: "web_onboarding_initial_cash",
          balanceBefore: 0,
          balanceAfter: v,
        });
        if (flowResult.error) {
          console.warn("[onboarding external cash flow]", flowResult.error.message);
        }
      }
      setSettings({ riskAppetite: risk });

      let seededSymbols: string[] = [];
      if (usePortfolioStore.getState().stocks.length === 0) {
        starterSymbols.forEach((sym) => {
          addStock({ symbol: sym, quantity: 0, averageCost: 0, lastPrice: 0, pendingOptimization: true });
        });
        seededSymbols = starterSymbols;
      }

      if (seededSymbols.length > 0) {
        const refreshResult = await runRefreshPipeline(seededSymbols, {
          optimizePending: true,
          includeSnapshot: false,
        });
        if (!refreshResult.ok) {
          console.warn("[onboarding starter hydration]", refreshResult.message);
        }
      }

      setOnboardingComplete(true);
      await flushCurrentPortfolioSnapshotNow(true);
      await createClient().auth.updateUser({
        data: { [STOCKS_PM_ONBOARDING_USER_META_KEY]: true },
      });
      router.refresh();
      router.replace("/dashboard");
    } finally {
      setIsFinishing(false);
    }
  }

  return (
    <div className="box-border flex min-h-[100dvh] min-h-screen w-full flex-col px-5 py-8 sm:px-10 sm:py-10 md:px-14 lg:px-20">
      <div className="mb-8 flex w-full gap-2 sm:mb-10 sm:gap-3">
        {steps.map((_, idx) => (
          <div
            key={idx}
            className={`h-2.5 flex-1 rounded-full sm:h-3 ${idx <= i ? "bg-primary" : "bg-battleship/25 dark:bg-battleship/20"}`}
          />
        ))}
      </div>
      <div className="flex w-full flex-1 flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="ui-hover-lift flex min-h-[min(56vh,560px)] flex-1 flex-col rounded-3xl border border-border bg-elevated p-8 dark:border-primary/15 sm:min-h-[min(62vh,720px)] sm:p-12 md:p-16 lg:min-h-[min(68vh,800px)]"
          >
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">
              {steps[i].title}
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-subtle sm:mt-6 sm:text-xl md:text-2xl">
              {steps[i].body}
            </p>
            {i === 2 && (
              <input
                type="text"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                className="mt-8 w-full max-w-xl rounded-xl border border-border bg-background px-4 py-4 text-lg text-foreground sm:mt-10 sm:py-5 sm:text-xl"
                placeholder="Cash available"
              />
            )}
            {i === 3 && (
              <select
                value={risk}
                onChange={(e) => setRisk(e.target.value as "Low" | "Medium" | "High")}
                className="mt-8 w-full max-w-xl rounded-xl border border-border bg-background px-4 py-4 text-lg text-foreground sm:mt-10 sm:py-5 sm:text-xl"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="mt-8 flex w-full gap-4 sm:mt-10">
          {i > 0 && (
            <button
              type="button"
              className="ui-hover-lift min-h-[52px] flex-1 rounded-2xl border-2 border-primary/40 py-4 text-base font-medium text-foreground dark:border-primary/30 sm:min-h-14 sm:text-lg"
              onClick={() => setI((x) => x - 1)}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className={appCtaButton(
              "ui-hover-spotlight min-h-[52px] flex-1 rounded-2xl py-4 text-base sm:min-h-14 sm:text-lg"
            )}
            disabled={isFinishing}
            onClick={() => (i < steps.length - 1 ? setI((x) => x + 1) : finish())}
          >
            {i < steps.length - 1 ? "Next" : isFinishing ? "Setting up..." : "Get started"}
          </button>
        </div>
      </div>
    </div>
  );
}
