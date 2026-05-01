"use client";

import { useState } from "react";
import { appCtaButton } from "@/lib/appCtaClasses";

export default function SimulationPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [capital, setCapital] = useState("10000");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setResult(null);
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    try {
      const res = await fetch(`${basePath}/api/python/simulation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbol.trim().toUpperCase(), capital: parseFloat(capital) || 0 }),
      });
      const data = await res.json();
      setResult(data.message ?? JSON.stringify(data));
    } catch (e) {
      setResult(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Simulation</h1>
      <p className="text-sm text-subtle">
        Try different prices and limits to see how recommendations respond. This page may be limited while we finish the experience.
      </p>
      <div className="ui-hover-lift space-y-4 rounded-2xl border border-border bg-elevated p-6">
        <label className="block text-sm font-medium text-foreground">
          Symbol
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background text-foreground px-3 py-2" />
        </label>
        <label className="block text-sm font-medium text-foreground">
          Starting capital
          <input value={capital} onChange={(e) => setCapital(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background text-foreground px-3 py-2" />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={run}
          className={appCtaButton("ui-hover-spotlight w-full rounded-xl py-3 font-medium disabled:opacity-50")}
        >
          {loading ? "Running…" : "Run simulation"}
        </button>
        {result && <pre className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-xs text-subtle">{result}</pre>}
      </div>
    </div>
  );
}
