import type { SupabaseClient } from "@supabase/supabase-js";

export type MarketOutlook = {
  computedAt: string;
  score: number;
  regime: "risk_on" | "neutral" | "elevated" | "risk_off";
  cashTargetPct: number;
  label: string;
  backdrop: string;
  explanation: string;
  preferCash: boolean;
  stale: boolean;
  influences: string[];
};

const STALE_MS = 3 * 24 * 60 * 60 * 1000;

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function highlightsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((line): line is string => typeof line === "string");
}

export function mapMarketOutlookRow(row: Record<string, unknown>): MarketOutlook | null {
  const computedAt = typeof row.computed_at === "string" ? row.computed_at : "";
  const score = asNumber(row.macro_sentiment_score);
  const regimeRaw = typeof row.regime === "string" ? row.regime : "";
  const cashTargetPct = asNumber(row.cash_target_pct);
  if (!computedAt || score == null || cashTargetPct == null) return null;
  if (regimeRaw !== "risk_on" && regimeRaw !== "neutral" && regimeRaw !== "elevated" && regimeRaw !== "risk_off") {
    return null;
  }
  const age = Date.now() - Date.parse(computedAt);
  const stale = !Number.isFinite(age) || age >= STALE_MS;
  const severe = regimeRaw === "risk_off" && score <= 20;
  const label =
    regimeRaw === "risk_on"
      ? "Favorable to buy"
      : regimeRaw === "neutral"
        ? "Mixed"
        : regimeRaw === "elevated"
          ? "Prefer holding cash"
          : severe
            ? "Severe defensive"
            : "Defensive — raise cash";
  const backdrop =
    score < 35
      ? "Economic backdrop looks weak"
      : score < 50
        ? "Economic backdrop is cautious"
        : score < 60
          ? "Economic backdrop is mixed"
          : "Economic backdrop looks supportive";
  const explanation = severe
    ? "Macro news is crisis-level (≤20/100) — severe early warning; use the Severe cash target even if indexes are still high."
    : regimeRaw === "risk_on"
      ? "Macro news looks supportive, and/or index RSI shows an oversold bottom turning up — conditions favor buying again."
      : regimeRaw === "neutral"
        ? "Signals are mixed — no strong push to buy or to raise cash."
        : regimeRaw === "elevated"
          ? "Macro news and/or a high S&P 500 or Russell 2000 vs its long-term average suggest holding more cash. An RSI recovery can ease this."
          : "Macro news looks weak or the S&P 500 or Russell 2000 has dropped sharply — prioritize cash over new buys.";
  const highlights = highlightsOf(row.highlights);
  const news = highlights
    .filter((line) => line.startsWith("NewsScore:"))
    .map((line) => line.slice("NewsScore:".length).trim())
    .filter(Boolean);
  const rsiLine = highlights.find((line) => line.startsWith("Index RSI"));
  const factors = highlights
    .filter((line) => line.startsWith("Factor:") && !line.startsWith("Factor: Macro news"))
    .map((line) => line.slice("Factor:".length).trim())
    .filter((line) => !rsiLine || !/index rsi|oversold-bottom|oversold trough/i.test(line))
    .filter(Boolean);
  const indexes = highlights.filter((line) => line.startsWith("Indexes vs") || line.startsWith("Index RSI"));
  return {
    computedAt,
    score,
    regime: regimeRaw,
    cashTargetPct,
    label,
    backdrop,
    explanation,
    preferCash: !stale && (regimeRaw === "elevated" || regimeRaw === "risk_off"),
    stale,
    influences: [...news, ...indexes, ...factors],
  };
}

export async function fetchLatestMarketOutlook(supabase: SupabaseClient): Promise<MarketOutlook | null> {
  const { data, error } = await supabase
    .from("market_regime_snapshots")
    .select("computed_at,macro_sentiment_score,regime,cash_target_pct,highlights")
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapMarketOutlookRow(data as Record<string, unknown>);
}
