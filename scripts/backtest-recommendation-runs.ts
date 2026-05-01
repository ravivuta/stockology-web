/**
 * Standalone backtest: 10 runs × 20 random large-cap names × varied calendar windows.
 * Each trading day applies the same rules as `scripts/simulate-signal-year.ts`
 * (`computeIosRecommendation` + BUY/ADD/SELL/REDUCE execution).
 *
 * Data: tries Supabase `historical_prices` (service role), else Yahoo Finance chart API.
 * If a symbol fails, fills with deterministic synthetic prices for that window so the script always finishes.
 *
 * NOT wired into the Next app. Run from repo:
 *   cd website/next && npx tsx scripts/backtest-recommendation-runs.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  computeIosRecommendation,
  computeRiskReturnScore,
  type IosStockInput,
} from "../src/lib/ios-recommendation";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Sb = SupabaseClient<any, "public", any>;

const SHORT_SMA = 50;
const DYNAMIC_FACTOR = 20;
const STOCK_LIMIT = 10_000;
const TRANSACTION_LIMIT = 2_500;
const INITIAL_CASH = 10_000;
const ETF_PROFIT = 50;
const STOCK_PROFIT = 50;

type Bar = { date: string; close: number };
type Position = { qty: number; avg: number };

type TickerMeta = {
  name: string | null;
  analystTarget: number | null;
  analystAvg: string;
  marketCap: number | null;
  isETF: boolean;
};

/** Large liquid names to sample 20 from each run (no overlap requirement across runs except by chance). */
const STOCK_POOL = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "JPM", "V", "UNH", "JNJ",
  "WMT", "PG", "MA", "HD", "XOM", "BAC", "ABBV", "PFE", "KO", "PEP",
  "COST", "TMO", "ACN", "DHR", "MRK", "VZ", "ADBE", "CRM", "NFLX", "AMD",
  "INTC", "QCOM", "CSCO", "ORCL", "LOW", "SBUX", "IBM", "CAT", "GE", "HON",
  "UPS", "RTX", "DE", "GS", "BLK", "SCHW", "AMAT", "LRCX", "MU", "INTU",
  "NOW", "PANW", "ISRG", "GILD", "BMY", "CVX", "SLB", "MCD", "DIS", "BA",
] as const;

/** Candidate windows (calendar); 10 runs after shuffle. */
const WINDOW_CANDIDATES: { label: string; start: string; end: string }[] = [
  { label: "2018–2019", start: "2018-01-02", end: "2019-12-31" },
  { label: "2019–2020", start: "2019-01-02", end: "2020-12-31" },
  { label: "2020–2021", start: "2020-03-01", end: "2021-12-31" },
  { label: "2021–2022", start: "2021-01-04", end: "2022-12-30" },
  { label: "2022–2023", start: "2022-01-03", end: "2023-12-29" },
  { label: "2023–2024", start: "2023-01-03", end: "2024-11-29" },
  { label: "2018 H1–2019", start: "2018-03-01", end: "2019-09-30" },
  { label: "2019–2020 crash window", start: "2019-06-01", end: "2020-08-31" },
  { label: "2021 rally–2022 drawdown", start: "2021-02-01", end: "2022-10-31" },
  { label: "2022 bear–2023 rebound", start: "2022-04-01", end: "2023-10-31" },
  { label: "2017–2018", start: "2017-05-01", end: "2018-12-31" },
  { label: "2024", start: "2024-01-02", end: "2024-12-31" },
];

const WARMUP_DAYS = 400;
const YAHOO_UA = "Mozilla/5.0 (compatible; StocksPM-backtest/1.0; +https://github.com/ravivuta/iosStocksPM)";

function loadEnv() {
  const p = join(__dirname, "..", ".env.local");
  if (!existsSync(p)) return;
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] == null || process.env[m[1]] === "") process.env[m[1]] = v;
  }
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: readonly T[], seed: number): T[] {
  const out = [...arr];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function hashSym(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function detRand(sym: string, i: number): number {
  const x = Math.sin(hashSym(sym) * 9999 + i * 7777) * 10000;
  return x - Math.floor(x);
}

function yahooTicker(sym: string): string {
  return sym.replace(/\./g, "-");
}

function extendStart(iso: string, calendarDays: number): string {
  const d = new Date(iso + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() - calendarDays);
  return d.toISOString().slice(0, 10);
}

function weekdaysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const a = new Date(start + "T12:00:00.000Z");
  const b = new Date(end + "T12:00:00.000Z");
  for (let d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function mergeTradingDates(barsBySym: Map<string, Bar[]>): string[] {
  const set = new Set<string>();
  for (const bars of barsBySym.values()) {
    for (const b of bars) set.add(b.date);
  }
  return [...set].sort();
}

function closeOnOrBefore(bars: Bar[], d: string): number | null {
  let last: number | null = null;
  for (const b of bars) {
    if (b.date > d) break;
    last = b.close;
  }
  return last;
}

function closesThrough(bars: Bar[], d: string): number[] {
  const out: number[] = [];
  for (const b of bars) {
    if (b.date > d) break;
    out.push(b.close);
  }
  return out;
}

function estimateReduceQty(
  currentPrice: number,
  costBasis: number,
  stockLimit: number,
  transactionLimit: number,
  unrealizedGain: number
): number {
  const money2free = costBasis - stockLimit;
  if (money2free > transactionLimit && unrealizedGain > money2free / 2 && currentPrice > 0) {
    return Math.round(money2free / currentPrice);
  }
  return 0;
}

function synthBarsForDates(sym: string, dates: string[]): Bar[] {
  let p = 80 + (hashSym(sym) % 40) + detRand(sym, 0) * 5;
  return dates.map((date, i) => {
    const drift = (detRand(sym, i + 1) - 0.48) * 0.025;
    p = Math.max(5, p * (1 + drift));
    return { date, close: Math.round(p * 100) / 100 };
  });
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchYahooChart(sym: string, period1Sec: number, period2Sec: number): Promise<Bar[]> {
  const t = yahooTicker(sym);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?period1=${period1Sec}&period2=${period2Sec}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA } });
  if (!res.ok) return [];
  let j: unknown;
  try {
    j = await res.json();
  } catch {
    return [];
  }
  const chart = j as { chart?: { result?: unknown[] } };
  const r0 = chart.chart?.result?.[0] as
    | {
        timestamp: number[];
        indicators: {
          quote: { close: (number | null)[] }[];
          adjclose?: { adjclose: (number | null)[] }[];
        };
      }
    | undefined;
  if (!r0?.timestamp?.length) return [];
  const ts = r0.timestamp;
  const quote = r0.indicators.quote[0];
  const adj = r0.indicators.adjclose?.[0]?.adjclose;
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = adj?.[i] ?? quote?.close?.[i];
    if (c == null || !Number.isFinite(c)) continue;
    bars.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
  }
  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

async function loadBarsSupabase(
  supabase: Sb,
  sym: string,
  start: string,
  end: string
): Promise<Bar[]> {
  const { data, error } = await supabase
    .from("historical_prices")
    .select("date,close,adjusted_close")
    .eq("symbol", sym.toUpperCase())
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });
  if (error || !data?.length) return [];
  return data
    .map((r: { date: string; close: number; adjusted_close?: number | null }) => {
      const c = r.adjusted_close != null && Number.isFinite(Number(r.adjusted_close)) ? Number(r.adjusted_close) : Number(r.close);
      return { date: String(r.date).slice(0, 10), close: c };
    })
    .filter((b: Bar) => Number.isFinite(b.close) && b.close > 0);
}

function defaultMeta(sym: string): TickerMeta {
  return {
    name: sym,
    analystTarget: null,
    analystAvg: "4.35",
    marketCap: 120_000_000_000,
    isETF: false,
  };
}

function buildStockInput(
  sym: string,
  pos: Position,
  last: number,
  closes: number[],
  meta: TickerMeta
): IosStockInput {
  const s: IosStockInput = {
    symbol: sym,
    quantity: pos.qty,
    averageCost: pos.avg,
    lastPrice: last,
    shortSMA: SHORT_SMA,
    dynamicFactor: DYNAMIC_FACTOR,
    stockLimit: STOCK_LIMIT,
    transactionLimit: TRANSACTION_LIMIT,
    isETF: meta.isETF,
    analystTarget: meta.analystTarget ?? undefined,
    analystAvg: meta.analystAvg,
    marketCap: meta.marketCap ?? undefined,
    isShortlisted: true,
    isInWatchlistSize: true,
    movingAvg: undefined,
  };
  s.score = meta.isETF ? undefined : computeRiskReturnScore(s);
  return s;
}

async function hydrateMeta(supabase: Sb | null, symbols: string[]): Promise<Map<string, TickerMeta>> {
  const map = new Map<string, TickerMeta>();
  for (const sym of symbols) map.set(sym, defaultMeta(sym));

  if (!supabase) return map;

  const { data } = await supabase
    .from("ticker_data")
    .select("symbol, company_name, analyst_target, market_cap, analyst_average, is_etf")
    .in("symbol", symbols);

  for (const sym of symbols) {
    const row = data?.find((r: { symbol?: string }) => (r.symbol || "").toUpperCase() === sym);
    if (!row) continue;
    map.set(sym, {
      name: row.company_name ?? sym,
      analystTarget:
        row.analyst_target != null && Number.isFinite(Number(row.analyst_target))
          ? Number(row.analyst_target)
          : null,
      analystAvg:
        row.analyst_average != null && String(row.analyst_average).trim()
          ? String(row.analyst_average).trim()
          : "4.35",
      marketCap:
        row.market_cap != null && Number.isFinite(Number(row.market_cap)) ? Number(row.market_cap) : 120_000_000_000,
      isETF: row.is_etf === true,
    });
  }

  for (const sym of symbols) {
    const m = map.get(sym)!;
    const last = m.analystTarget;
    if (last == null || last <= 0) {
      map.set(sym, { ...m, analystTarget: null });
    }
  }

  return map;
}

/** After meta load, set analyst target from first close if missing (engine needs upside for scoring). */
function ensureAnalystTargetFromPrice(meta: TickerMeta, approxPrice: number): TickerMeta {
  if (meta.analystTarget != null && meta.analystTarget > 0) return meta;
  if (approxPrice <= 0) return meta;
  return { ...meta, analystTarget: Math.round(approxPrice * 1.18 * 100) / 100 };
}

type MonthRow = {
  month: string;
  stratPct: number;
  spyPct: number;
  excessPct: number;
};

/** Month-over-month: last trading day of month vs prior month-end (first month vs run start). */
function computeMonthlyReturns(
  tradingDates: string[],
  stratValues: number[],
  spyValues: number[]
): MonthRow[] {
  const rows: MonthRow[] = [];
  const n = tradingDates.length;
  if (n === 0 || stratValues.length !== n || spyValues.length !== n) return rows;

  const lastIdxByMonth = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    lastIdxByMonth.set(tradingDates[i].slice(0, 7), i);
  }
  const months = [...lastIdxByMonth.keys()].sort();

  for (let mi = 0; mi < months.length; mi++) {
    const m = months[mi]!;
    const lastI = lastIdxByMonth.get(m)!;
    const baseI = mi === 0 ? 0 : lastIdxByMonth.get(months[mi - 1]!)!;
    const sb = stratValues[baseI]!;
    const spb = spyValues[baseI]!;
    const se = stratValues[lastI]!;
    const spe = spyValues[lastI]!;
    const stratPct = sb > 0 ? ((se / sb - 1) * 100) : 0;
    const spyPct = spb > 0 ? ((spe / spb - 1) * 100) : 0;
    rows.push({ month: m, stratPct, spyPct, excessPct: stratPct - spyPct });
  }

  return rows;
}

type RunResult = {
  runIndex: number;
  window: { label: string; start: string; end: string };
  symbols: string[];
  tradingDates: string[];
  totalStratPct: number;
  totalSpyPct: number;
  excessTotalPct: number;
  months: MonthRow[];
  dataSource: string;
};

async function loadAllBars(
  supabase: Sb | null,
  symbols: string[],
  warmupStart: string,
  end: string,
  onProgress?: (msg: string) => void
): Promise<{ barsBySym: Map<string, Bar[]>; source: string }> {
  const barsBySym = new Map<string, Bar[]>();
  const need = [...symbols, "SPY"];
  const p1 = Math.floor(new Date(warmupStart + "T12:00:00Z").getTime() / 1000);
  const p2 = Math.floor(new Date(end + "T23:59:59Z").getTime() / 1000);

  let usedDb = 0;
  let usedYahoo = 0;
  let usedSynth = 0;

  const allDates = weekdaysBetween(warmupStart, end);

  for (const sym of need) {
    let bars: Bar[] = [];
    // Benchmark must span the full window; partial DB history makes SPY look flat vs strategy.
    const skipDb = sym === "SPY";
    if (supabase && !skipDb) {
      bars = await loadBarsSupabase(supabase, sym, warmupStart, end);
      if (bars.length >= 120) usedDb++;
    }
    if (bars.length < 120) {
      bars = await fetchYahooChart(sym, p1, p2);
      await sleep(320);
      if (bars.length >= 60) usedYahoo++;
    }
    if (bars.length < 60) {
      bars = synthBarsForDates(sym, allDates);
      usedSynth++;
    }
    barsBySym.set(sym, bars);
    onProgress?.(`${sym}: ${bars.length} bars`);
  }

  const source =
    usedSynth > 0
      ? `mixed (DB:${usedDb} Yahoo:${usedYahoo} synth:${usedSynth} symbols)`
      : usedDb > 0
        ? `Supabase+Yahoo (DB-heavy)`
        : `Yahoo Finance`;
  return { barsBySym, source };
}

function simulateRun(
  symbols: readonly string[],
  tradingDates: string[],
  barsBySym: Map<string, Bar[]>,
  metaBySym: Map<string, TickerMeta>
): { stratSeries: number[]; spySeries: number[] } {
  const positions = new Map<string, Position>();
  for (const sym of symbols) positions.set(sym, { qty: 0, avg: 0 });
  let cash = INITIAL_CASH;

  const spyBars = barsBySym.get("SPY") || [];
  const firstD = tradingDates[0];
  const spy0 = closeOnOrBefore(spyBars, firstD!) ?? 0;
  const spyShares = spy0 > 0 ? INITIAL_CASH / spy0 : 0;

  const stratSeries: number[] = [];
  const spySeries: number[] = [];

  for (const d of tradingDates) {
    const lastPx = new Map<string, number>();
    for (const sym of symbols) {
      const bars = barsBySym.get(sym) || [];
      const px = closeOnOrBefore(bars, d);
      if (px != null && px > 0) lastPx.set(sym, px);
    }

    for (const sym of symbols) {
      const px = lastPx.get(sym);
      if (px == null || px <= 0) continue;
      const bars = barsBySym.get(sym) || [];
      const closes = closesThrough(bars, d);
      let meta = metaBySym.get(sym)!;
      meta = ensureAnalystTargetFromPrice(meta, px);
      const pos = positions.get(sym)!;
      const stock = buildStockInput(sym, pos, px, closes, meta);
      const rec = computeIosRecommendation(stock, {
        closes,
        etfProfitTargetPercent: ETF_PROFIT,
        stockProfitTargetPercent: STOCK_PROFIT,
        skipWashSaleCheck: true,
        relaxScoreRequirement: false,
      });
      const action = rec.action.toUpperCase();

      if (action === "BUY" && pos.qty === 0) {
        let q = Math.round(TRANSACTION_LIMIT / px);
        q = Math.min(q, Math.floor(cash / px));
        if (q > 0) {
          cash -= q * px;
          positions.set(sym, { qty: q, avg: px });
        }
      } else if (action === "ADD" && pos.qty > 0) {
        let q = Math.round(TRANSACTION_LIMIT / px);
        q = Math.min(q, Math.floor(cash / px));
        if (q > 0) {
          cash -= q * px;
          const nq = pos.qty + q;
          const navg = (pos.qty * pos.avg + q * px) / nq;
          positions.set(sym, { qty: nq, avg: navg });
        }
      } else if (action === "SELL" && pos.qty > 0) {
        cash += pos.qty * px;
        positions.set(sym, { qty: 0, avg: 0 });
      } else if (action === "REDUCE" && pos.qty > 0) {
        const costBasis = pos.qty * pos.avg;
        const ug = (px - pos.avg) * pos.qty;
        let rq = estimateReduceQty(px, costBasis, STOCK_LIMIT, TRANSACTION_LIMIT, ug);
        rq = Math.min(rq, pos.qty);
        if (rq > 0) {
          cash += rq * px;
          const nq = pos.qty - rq;
          positions.set(sym, { qty: nq, avg: nq > 0 ? pos.avg : 0 });
        }
      }
    }

    let mkt = 0;
    for (const sym of symbols) {
      const p = positions.get(sym)!;
      const px = lastPx.get(sym) ?? p.avg;
      mkt += p.qty * px;
    }
    stratSeries.push(mkt + cash);

    const spyPx = closeOnOrBefore(spyBars, d) ?? spy0;
    spySeries.push(spyShares * spyPx);
  }

  return { stratSeries, spySeries };
}

function printTable(rows: MonthRow[]) {
  const w = (s: string, n: number) => s.padEnd(n);
  const hdr = `${w("Month", 10)} | ${w("Strategy %", 12)} | ${w("S&P 500 %", 12)} | ${w("Excess (strat − SPY)", 22)}`;
  console.log(hdr);
  console.log("-".repeat(hdr.length));
  for (const r of rows) {
    const ex = r.excessPct >= 0 ? `+${r.excessPct.toFixed(2)}` : r.excessPct.toFixed(2);
    console.log(
      `${w(r.month, 10)} | ${w((r.stratPct >= 0 ? "+" : "") + r.stratPct.toFixed(2), 12)} | ${w((r.spyPct >= 0 ? "+" : "") + r.spyPct.toFixed(2), 12)} | ${w(ex, 22)}`
    );
  }
}

async function main() {
  loadEnv();
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  let supabase: Sb | null = null;
  if (url && serviceKey) {
    supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  }

  const MASTER_SEED = 20260331;
  const windows = shuffle(WINDOW_CANDIDATES, MASTER_SEED).slice(0, 10);

  console.log("=== Stocks PM — recommendation backtest (10 runs, NOT part of the app) ===\n");
  console.log("Engine: computeIosRecommendation + daily BUY/ADD/SELL/REDUCE (same as simulate-signal-year).");
  console.log(`Start cash: $${INITIAL_CASH.toLocaleString()}; benchmark: 100% SPY buy-and-hold from first sim day.\n`);

  const allResults: RunResult[] = [];

  for (let run = 0; run < 10; run++) {
    const win = windows[run]!;
    const stockSeed = MASTER_SEED + run * 9973;
    const picked = shuffle(STOCK_POOL, stockSeed).slice(0, 20);
    const warmupStart = extendStart(win.start, WARMUP_DAYS);

    console.log(`\n${"=".repeat(72)}`);
    console.log(`RUN ${run + 1}/10 — ${win.label} (${win.start} → ${win.end})`);
    console.log(`${"=".repeat(72)}`);

    const { barsBySym, source } = await loadAllBars(supabase, picked, warmupStart, win.end, (m) =>
      console.error(`  [data] ${m}`)
    );
    console.log(`Data: ${source}`);

    let tradingDates = mergeTradingDates(barsBySym);
    tradingDates = tradingDates.filter((d) => d >= win.start && d <= win.end);
    if (tradingDates.length < 30) {
      console.log("SKIP: not enough overlapping trading days.");
      continue;
    }

    const metaBySym = await hydrateMeta(supabase, [...picked]);
    const { stratSeries, spySeries } = simulateRun(picked, tradingDates, barsBySym, metaBySym);

    const v0 = stratSeries[0]!;
    const vN = stratSeries[stratSeries.length - 1]!;
    const s0 = spySeries[0]!;
    const sN = spySeries[spySeries.length - 1]!;

    const totalStratPct = v0 > 0 ? ((vN / v0 - 1) * 100) : 0;
    const totalSpyPct = s0 > 0 ? ((sN / s0 - 1) * 100) : 0;
    const months = computeMonthlyReturns(tradingDates, stratSeries, spySeries);

    console.log(`\nTotal return (full window): strategy ${totalStratPct >= 0 ? "+" : ""}${totalStratPct.toFixed(2)}%  |  SPY ${totalSpyPct >= 0 ? "+" : ""}${totalSpyPct.toFixed(2)}%  |  Excess ${(totalStratPct - totalSpyPct >= 0 ? "+" : "") + (totalStratPct - totalSpyPct).toFixed(2)}%`);
    console.log("\nBy month (each row = that calendar month, last trading day vs prior month last):\n");
    printTable(months);

    allResults.push({
      runIndex: run + 1,
      window: win,
      symbols: [...picked],
      tradingDates,
      totalStratPct,
      totalSpyPct,
      excessTotalPct: totalStratPct - totalSpyPct,
      months,
      dataSource: source,
    });
  }

  console.log(`\n\n${"#".repeat(72)}`);
  console.log("# STOCK LISTS — 20 tickers per run (same order as simulation)");
  console.log(`${"#".repeat(72)}\n`);

  for (const r of allResults) {
    console.log(`Run ${r.runIndex} (${r.window.label}): ${r.symbols.join(", ")}`);
  }

  console.log("\n---\nDisclaimer: Yahoo/DB coverage gaps fall back to synthetic series so the script completes;");
  console.log("those runs are useful for pipeline checks, not literal market accuracy. For research, ensure");
  console.log("Supabase `historical_prices` is populated or Yahoo returns full windows.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
