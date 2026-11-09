import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTickerHydrationFromTables } from "@/lib/ticker-direct-hydration";
import { fetchHistoricalPricePoints } from "@/lib/supabase-stock-history";
import { passesRSIReversalWithHysteresis, rsiSeries } from "@/lib/ios-recommendation";

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
const INTRADAY_LOOKBACK_DAYS = 260;

type IntradayIndexMetrics = {
  close: number;
  sma200: number;
  vsSma200Pct: number;
  rsi: number;
  rsiRecovery: boolean;
};

export const defaultOutlookCashTargets = {
  riskOn: 10,
  neutral: 30,
  elevated: 50,
  riskOff: 70,
  severe: 90,
};

function etDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function isUsMarketOpenForIntradayOverlay(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  if (weekday === "Sat" || weekday === "Sun") return false;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? Number.NaN);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? Number.NaN);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  const totalMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30;
  const closeMinutes = 16 * 60 + 30;
  return totalMinutes >= openMinutes && totalMinutes < closeMinutes;
}

function deriveMarketRegimeNowcast(
  macroScore: number,
  spyVsSma200Pct: number | undefined,
  iwmVsSma200Pct: number | undefined,
  rsiRecovery: boolean
): { regime: MarketOutlook["regime"]; cashTargetPct: number } {
  const deepDrawdown = (spyVsSma200Pct ?? 100) <= -5 || (iwmVsSma200Pct ?? 100) <= -5;
  const overextended = (spyVsSma200Pct ?? -100) >= 6 || (iwmVsSma200Pct ?? -100) >= 6;
  const mildlyExtended = (spyVsSma200Pct ?? -100) >= 3 || (iwmVsSma200Pct ?? -100) >= 3;

  if (macroScore <= 20) return { regime: "risk_off", cashTargetPct: 90 };
  if (macroScore <= 35 || (macroScore <= 45 && overextended)) {
    return rsiRecovery && !overextended
      ? { regime: "elevated", cashTargetPct: 50 }
      : { regime: "risk_off", cashTargetPct: 70 };
  }
  if (deepDrawdown) {
    return rsiRecovery
      ? { regime: "elevated", cashTargetPct: 50 }
      : { regime: "risk_off", cashTargetPct: 70 };
  }
  if (macroScore <= 50 || overextended || (macroScore < 55 && mildlyExtended)) {
    return rsiRecovery && !overextended && macroScore >= 45
      ? { regime: "neutral", cashTargetPct: 30 }
      : { regime: "elevated", cashTargetPct: 50 };
  }
  if ((macroScore >= 65 || (rsiRecovery && macroScore >= 55)) && !overextended) {
    return { regime: "risk_on", cashTargetPct: 10 };
  }
  return { regime: "neutral", cashTargetPct: 30 };
}

function fmtPct(value: number | undefined): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${(value ?? 0) >= 0 ? "+" : ""}${(value ?? 0).toFixed(1)}%`;
}

function fmtRSI(value: number | undefined): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${Math.round(value ?? 0)}`;
}

async function fetchIntradayIndexMetrics(
  supabase: SupabaseClient,
  symbol: "SPY" | "IWM",
  livePrice: number | undefined
): Promise<IntradayIndexMetrics | null> {
  const history = await fetchHistoricalPricePoints(supabase, symbol, INTRADAY_LOOKBACK_DAYS);
  let closes = history.points
    .map((point) => Number(point.close))
    .filter((close) => Number.isFinite(close) && close > 0);
  if (closes.length === 0) return null;

  if (isUsMarketOpenForIntradayOverlay() && Number.isFinite(livePrice) && (livePrice ?? 0) > 0) {
    const today = etDateString(new Date());
    const lastDate = history.points.at(-1)?.date?.slice(0, 10);
    if (lastDate === today) {
      closes = [...closes.slice(0, -1), livePrice as number];
    } else {
      closes = [...closes, livePrice as number];
    }
  }

  if (closes.length < 50) return null;
  const close = closes.at(-1) ?? 0;
  const smaWindow = closes.slice(-Math.min(200, closes.length));
  const sma200 = smaWindow.reduce((sum, value) => sum + value, 0) / Math.max(1, smaWindow.length);
  if (!Number.isFinite(close) || close <= 0 || !Number.isFinite(sma200) || sma200 <= 0) return null;
  const vsSma200Pct = ((close - sma200) / sma200) * 100;
  const rsi = rsiSeries(closes, 14).at(-1) ?? 50;
  const rsiRecovery = passesRSIReversalWithHysteresis(closes, 14, 30, 5, 2);
  return { close, sma200, vsSma200Pct, rsi, rsiRecovery };
}

async function applyIntradayMarketOutlookNowcast(
  supabase: SupabaseClient,
  snapshot: MarketOutlook
): Promise<MarketOutlook> {
  if (!isUsMarketOpenForIntradayOverlay()) return snapshot;

  const hydration = await fetchTickerHydrationFromTables(supabase, ["SPY", "IWM"]);
  const spyLive = hydration.prices.SPY?.last_price;
  const iwmLive = hydration.prices.IWM?.last_price;
  const [spyMetrics, iwmMetrics] = await Promise.all([
    fetchIntradayIndexMetrics(supabase, "SPY", spyLive),
    fetchIntradayIndexMetrics(supabase, "IWM", iwmLive),
  ]);
  if (!spyMetrics || !iwmMetrics) return snapshot;

  const nowcast = deriveMarketRegimeNowcast(
    snapshot.score,
    spyMetrics.vsSma200Pct,
    iwmMetrics.vsSma200Pct,
    spyMetrics.rsiRecovery || iwmMetrics.rsiRecovery
  );
  const weakerIsRussell = iwmMetrics.vsSma200Pct < spyMetrics.vsSma200Pct;
  const weakerLabel = weakerIsRussell ? "Russell 2000" : "S&P 500";

  const indexHighlight =
    `Indexes vs 200-day avg — S&P 500 ${fmtPct(spyMetrics.vsSma200Pct)}, Russell 2000 ${fmtPct(iwmMetrics.vsSma200Pct)} ` +
    `(weaker: ${weakerLabel}, intraday nowcast)`;
  const recoveringLabels = [
    spyMetrics.rsiRecovery ? "S&P 500" : null,
    iwmMetrics.rsiRecovery ? "Russell 2000" : null,
  ].filter((value): value is string => !!value);
  const rsiHighlight =
    spyMetrics.rsiRecovery || iwmMetrics.rsiRecovery
      ? `Index RSI recovering — ${recoveringLabels.join(" & ")} oversold trough with upward trend ` +
        `(S&P: ${fmtRSI(spyMetrics.rsi)}, Russell: ${fmtRSI(iwmMetrics.rsi)}). Sign to ease cash and start buying again. [intraday nowcast]`
      : `Index RSI — S&P 500: ${fmtRSI(spyMetrics.rsi)}, Russell 2000: ${fmtRSI(iwmMetrics.rsi)} ` +
        `(no oversold-bottom recovery yet) [intraday nowcast]`;
  const retainedInfluences = snapshot.influences.filter(
    (line) => !line.startsWith("Indexes vs 200-day") && !line.startsWith("Index RSI")
  );

  const severe = nowcast.regime === "risk_off" && snapshot.score <= 20;
  const label =
    nowcast.regime === "risk_on"
      ? "Favorable to buy"
      : nowcast.regime === "neutral"
        ? "Mixed"
        : nowcast.regime === "elevated"
          ? "Prefer holding cash"
          : severe
            ? "Severe defensive"
            : "Defensive — raise cash";
  const explanation = severe
    ? "Macro news is crisis-level (≤20/100) — severe early warning; use the Severe cash target even if indexes are still high."
    : nowcast.regime === "risk_on"
      ? "Macro news looks supportive, and/or index RSI shows an oversold bottom turning up — conditions favor buying again."
      : nowcast.regime === "neutral"
        ? "Signals are mixed — no strong push to buy or to raise cash."
        : nowcast.regime === "elevated"
          ? "Macro news and/or a high S&P 500 or Russell 2000 vs its long-term average suggest holding more cash. An RSI recovery can ease this."
          : "Macro news looks weak or the S&P 500 or Russell 2000 has dropped sharply — prioritize cash over new buys.";

  return {
    ...snapshot,
    regime: nowcast.regime,
    cashTargetPct: nowcast.cashTargetPct,
    label,
    explanation,
    preferCash: !snapshot.stale && (nowcast.regime === "elevated" || nowcast.regime === "risk_off"),
    influences: [indexHighlight, rsiHighlight, ...retainedInfluences],
  };
}

export function effectiveOutlookCashTargetPct(
  outlook: Pick<MarketOutlook, "regime" | "score" | "cashTargetPct">,
  targets: {
    riskOn: number;
    neutral: number;
    elevated: number;
    riskOff: number;
    severe: number;
  }
): number {
  const severe = outlook.regime === "risk_off" && outlook.score <= 20;
  const value =
    outlook.regime === "risk_on"
      ? targets.riskOn
      : outlook.regime === "neutral"
        ? targets.neutral
        : outlook.regime === "elevated"
          ? targets.elevated
          : severe
            ? targets.severe
            : targets.riskOff;
  return Math.min(95, Math.max(0, Number.isFinite(value) ? value : outlook.cashTargetPct));
}

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
  const mapped = mapMarketOutlookRow(data as Record<string, unknown>);
  if (!mapped) return null;
  return applyIntradayMarketOutlookNowcast(supabase, mapped);
}
