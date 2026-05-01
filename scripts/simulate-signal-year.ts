/**
 * Simulates ~1 year of trading by running `computeIosRecommendation` (iOS-aligned) per
 * trading day for a fixed 20-symbol watchlist, starting with $10k cash and default params
 * (SMA 50, dynamic 20, stockLimit 10k, transactionLimit 2.5k).
 *
 * Loads closes via Supabase `get_historical_prices`; if history is thin, uses deterministic
 * synthetic series so SQL output is still generated.
 *
 * Usage:
 *   SQL file:  npx tsx scripts/simulate-signal-year.ts --email=you@gmail.com > demo.sql
 *   Apply DB:  npx tsx scripts/simulate-signal-year.ts --apply --email=you@gmail.com
 *              (uses SUPABASE_SERVICE_ROLE_KEY from website/next/.env.local — no DB password)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Script-side client; project has no generated Database types. */
type Sb = SupabaseClient<any, "public", any>;
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  computeIosRecommendation,
  computeRiskReturnScore,
  type IosStockInput,
} from "../src/lib/ios-recommendation";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WATCHLIST_20 = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "NVDA",
  "META",
  "JPM",
  "V",
  "UNH",
  "COST",
  "XOM",
  "PG",
  "MA",
  "HD",
  "DIS",
  "NFLX",
  "AMD",
  "INTC",
  "PEP",
  "KO",
] as const;

const SHORT_SMA = 50;
const DYNAMIC_FACTOR = 20;
const STOCK_LIMIT = 10_000;
const TRANSACTION_LIMIT = 2_500;
const INITIAL_CASH = 10_000;
const TRADING_DAYS_TARGET = 252;
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

type SimSnap = {
  et: string;
  cash: number;
  positions: Map<string, Position>;
  lastPx: Map<string, number>;
  recs: Map<string, { action: string; movingAvg: number }>;
};

type SnapshotRow = {
  user_id: string;
  et_calendar_date: string;
  holdings: Record<string, unknown>[];
  cash_balance: number;
  total_portfolio_value: number;
  total_cost_basis: number;
  total_unrealized_gain: number;
  updated_at: string;
};

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

function hashSym(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function detRand(sym: string, i: number): number {
  const x = Math.sin(hashSym(sym) * 9999 + i * 7777) * 10000;
  return x - Math.floor(x);
}

function synthBarsForSymbol(sym: string, dates: string[]): Bar[] {
  let p = 80 + (hashSym(sym) % 40) + detRand(sym, 0) * 5;
  return dates.map((date, i) => {
    const drift = (detRand(sym, i + 1) - 0.48) * 0.025;
    p = Math.max(5, p * (1 + drift));
    return { date, close: Math.round(p * 100) / 100 };
  });
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

function holdingRow(
  sym: string,
  pos: Position,
  last: number,
  rec: { action: string; movingAvg: number },
  meta: TickerMeta
): Record<string, unknown> {
  return {
    symbol: sym,
    quantity: pos.qty,
    averageCost: pos.avg,
    lastPrice: last,
    currentPrice: last,
    shortSMA: SHORT_SMA,
    dynamicFactor: DYNAMIC_FACTOR,
    stockLimit: STOCK_LIMIT,
    transactionLimit: TRANSACTION_LIMIT,
    targetPrice: null,
    isShortlisted: true,
    name: meta.name,
    recommendation: rec.action,
    moving_avg: rec.movingAvg > 0 ? rec.movingAvg : null,
    isETF: meta.isETF,
    analystTarget: meta.analystTarget,
    analystAvg: meta.analystAvg,
    marketCap: meta.marketCap,
  };
}

function sqlString(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function sqlJson(obj: unknown): string {
  return sqlString(JSON.stringify(obj));
}

async function findAuthUserId(supabase: Sb, email: string): Promise<string | null> {
  let page = 1;
  const perPage = 200;
  for (; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || "").toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

async function deleteSnapshotsRest(supabaseUrl: string, serviceKey: string, userId: string) {
  const base = supabaseUrl.replace(/\/$/, "").trim();
  const k = serviceKey.trim();
  const endpoint = `${base}/rest/v1/user_portfolio_snapshots?user_id=eq.${encodeURIComponent(userId)}`;
  const ms = 25_000;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(endpoint, {
      method: "DELETE",
      signal: controller.signal,
      headers: {
        apikey: k,
        Authorization: `Bearer ${k}`,
        Prefer: "return=minimal",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DELETE ${res.status}: ${text.slice(0, 400)}`);
    }
  } catch (e: unknown) {
    if (e && typeof e === "object" && "name" in e && (e as { name: string }).name === "AbortError") {
      throw new Error(`DELETE timed out after ${ms / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(to);
  }
}

function buildSnapshotRows(
  uid: string,
  snapshots: SimSnap[],
  metaBySym: Map<string, TickerMeta>
): SnapshotRow[] {
  const rows: SnapshotRow[] = [];
  let idx = 0;
  for (const s of snapshots) {
    const isLast = idx === snapshots.length - 1;
    const holdings: Record<string, unknown>[] = [];
    for (const sym of WATCHLIST_20) {
      const pos = s.positions.get(sym)!;
      const px = s.lastPx.get(sym) ?? pos.avg;
      if (px <= 0) continue;
      const rec = s.recs.get(sym) ?? { action: "WAIT_BUY", movingAvg: 0 };
      holdings.push(holdingRow(sym, pos, px, rec, metaBySym.get(sym)!));
    }
    const mktV = WATCHLIST_20.reduce((a, sym) => {
      const p = s.positions.get(sym)!;
      const px = s.lastPx.get(sym) ?? p.avg;
      return a + p.qty * px;
    }, 0);
    const tpv = mktV + s.cash;
    const costB = WATCHLIST_20.reduce((a, sym) => {
      const p = s.positions.get(sym)!;
      return a + p.qty * p.avg;
    }, 0);
    const unreal = mktV - costB;
    rows.push({
      user_id: uid,
      et_calendar_date: s.et,
      holdings,
      cash_balance: Number(s.cash.toFixed(2)),
      total_portfolio_value: Number(tpv.toFixed(2)),
      total_cost_basis: Number(costB.toFixed(2)),
      total_unrealized_gain: Number(unreal.toFixed(2)),
      updated_at: isLast ? new Date().toISOString() : `${s.et}T20:00:00.000Z`,
    });
    idx++;
  }
  return rows;
}

function snapshotRowsToSql(uid: string, email: string, rows: SnapshotRow[], finalTpv: number): string {
  const out: string[] = [];
  out.push(`-- Simulated 1y watchlist signals: ${email} (${uid})`);
  out.push(
    `-- Engine: computeIosRecommendation; ${INITIAL_CASH} start cash; 20 symbols; SMA${SHORT_SMA} DF${DYNAMIC_FACTOR} limits ${STOCK_LIMIT}/${TRANSACTION_LIMIT}.`
  );
  out.push("BEGIN;");
  out.push(`DELETE FROM public.user_portfolio_snapshots WHERE user_id = ${sqlString(uid)};`);
  out.push(`INSERT INTO public.users (id, email, login_method, created_at, is_active)`);
  out.push(`VALUES (${sqlString(uid)}, ${sqlString(email)}, 'google', now(), true)`);
  out.push(`ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, last_login = now();`);
  out.push("");
  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const isLast = idx === rows.length - 1;
    const updatedAt = isLast ? "now()" : `${sqlString(r.et_calendar_date + "T20:00:00Z")}::timestamptz`;
    out.push(`INSERT INTO public.user_portfolio_snapshots (`);
    out.push(`  user_id, et_calendar_date, holdings, cash_balance,`);
    out.push(`  total_portfolio_value, total_cost_basis, total_unrealized_gain, updated_at`);
    out.push(`) VALUES (`);
    out.push(`  ${sqlString(uid)},`);
    out.push(`  ${sqlString(r.et_calendar_date)}::date,`);
    out.push(`  ${sqlJson(r.holdings)}::jsonb,`);
    out.push(`  ${r.cash_balance.toFixed(2)},`);
    out.push(`  ${r.total_portfolio_value.toFixed(2)},`);
    out.push(`  ${r.total_cost_basis.toFixed(2)},`);
    out.push(`  ${r.total_unrealized_gain.toFixed(2)},`);
    out.push(`  ${updatedAt}`);
    out.push(`);`);
    out.push("");
  }
  out.push(`-- Final total_portfolio_value ≈ ${finalTpv.toFixed(2)}`);
  out.push("COMMIT;");
  return out.join("\n");
}

async function applySnapshotRows(
  supabase: Sb,
  url: string,
  key: string,
  uid: string,
  email: string,
  rows: SnapshotRow[],
  finalTpv: number
) {
  console.error(`Deleting existing snapshots for ${uid}…`);
  await deleteSnapshotsRest(url, key, uid);
  console.error("Upserting public.users…");
  const { error: uErr } = await supabase.from("users").upsert(
    {
      id: uid,
      email,
      login_method: "google",
      is_active: true,
    },
    { onConflict: "id" }
  );
  if (uErr) throw new Error(`users upsert: ${uErr.message}`);

  const chunk = 15;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    console.error(`Inserting snapshots ${i + 1}–${Math.min(i + chunk, rows.length)} / ${rows.length}…`);
    const { error } = await supabase.from("user_portfolio_snapshots").insert(slice);
    if (error) throw new Error(error.message);
  }
  console.error(`Done. Inserted ${rows.length} rows. total_portfolio_value ≈ $${finalTpv.toFixed(2)}`);
}

type SimResult = {
  uid: string;
  email: string;
  rows: SnapshotRow[];
  finalTpv: number;
};

async function simulatePortfolioYear(supabase: Sb, email: string): Promise<SimResult | null> {
  const uid = await findAuthUserId(supabase, email);
  if (!uid) {
    return null;
  }

  const { data: tickerRows } = await supabase
    .from("ticker_data")
    .select("symbol, company_name, analyst_target, market_cap, analyst_average, is_etf")
    .in("symbol", [...WATCHLIST_20]);

  const metaBySym = new Map<string, TickerMeta>();
  for (const sym of WATCHLIST_20) {
    const row = tickerRows?.find((r: { symbol?: string }) => (r.symbol || "").toUpperCase() === sym);
    metaBySym.set(sym, {
      name: row?.company_name ?? null,
      analystTarget:
        row?.analyst_target != null && Number.isFinite(Number(row.analyst_target))
          ? Number(row.analyst_target)
          : null,
      analystAvg:
        row?.analyst_average != null && String(row.analyst_average).trim()
          ? String(row.analyst_average).trim()
          : "4.2",
      marketCap:
        row?.market_cap != null && Number.isFinite(Number(row.market_cap)) ? Number(row.market_cap) : 5e11,
      isETF: row?.is_etf === true,
    });
  }

  const barsBySym = new Map<string, Bar[]>();

  for (const sym of WATCHLIST_20) {
    const { data, error } = await supabase.rpc("get_historical_prices", {
      p_symbol: sym,
      p_days: 400,
    });
    if (error) {
      console.error(`RPC get_historical_prices(${sym}):`, error.message);
    }
    const rows = (data || []) as { date: string; close: number }[];
    const asc = [...rows]
      .filter((r) => r.date && Number.isFinite(Number(r.close)))
      .map((r) => ({ date: String(r.date).slice(0, 10), close: Number(r.close) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    barsBySym.set(sym, asc);
  }

  let tradingDates = mergeTradingDates(barsBySym);
  const thin = tradingDates.length < 60;

  if (thin) {
    console.error(
      "-- Warning: thin historical_prices data; using deterministic synthetic series for all symbols."
    );
    const dates: string[] = [];
    let d = new Date();
    while (dates.length < TRADING_DAYS_TARGET + 80) {
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) {
        dates.unshift(d.toISOString().slice(0, 10));
      }
      d.setUTCDate(d.getUTCDate() - 1);
    }
    tradingDates = dates;
    for (const sym of WATCHLIST_20) {
      barsBySym.set(sym, synthBarsForSymbol(sym, tradingDates));
    }
  } else {
    tradingDates = tradingDates.slice(-TRADING_DAYS_TARGET);
  }

  const positions = new Map<string, Position>();
  for (const sym of WATCHLIST_20) positions.set(sym, { qty: 0, avg: 0 });
  let cash = INITIAL_CASH;

  const snapshots: SimSnap[] = [];

  for (const d of tradingDates) {
    const lastPx = new Map<string, number>();
    for (const sym of WATCHLIST_20) {
      const bars = barsBySym.get(sym) || [];
      const px = closeOnOrBefore(bars, d);
      if (px != null) lastPx.set(sym, px);
    }

    for (const sym of WATCHLIST_20) {
      const px = lastPx.get(sym);
      if (px == null || px <= 0) continue;
      const bars = barsBySym.get(sym) || [];
      const closes = closesThrough(bars, d);
      const pos = positions.get(sym)!;
      const meta = metaBySym.get(sym)!;
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
        const maxQ = Math.floor(cash / px);
        q = Math.min(q, maxQ);
        if (q > 0) {
          const cost = q * px;
          cash -= cost;
          positions.set(sym, { qty: q, avg: px });
        }
      } else if (action === "ADD" && pos.qty > 0) {
        let q = Math.round(TRANSACTION_LIMIT / px);
        const maxQ = Math.floor(cash / px);
        q = Math.min(q, maxQ);
        if (q > 0) {
          const cost = q * px;
          cash -= cost;
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

    const recs = new Map<string, { action: string; movingAvg: number }>();
    for (const sym of WATCHLIST_20) {
      const px = lastPx.get(sym);
      if (px == null || px <= 0) continue;
      const bars = barsBySym.get(sym) || [];
      const closes = closesThrough(bars, d);
      const pos = positions.get(sym)!;
      const meta = metaBySym.get(sym)!;
      const stock = buildStockInput(sym, pos, px, closes, meta);
      const rec = computeIosRecommendation(stock, {
        closes,
        etfProfitTargetPercent: ETF_PROFIT,
        stockProfitTargetPercent: STOCK_PROFIT,
        skipWashSaleCheck: true,
        relaxScoreRequirement: false,
      });
      recs.set(sym, { action: rec.action, movingAvg: rec.movingAvg });
    }

    snapshots.push({
      et: d,
      cash,
      positions: new Map(positions),
      lastPx: new Map(lastPx),
      recs,
    });
  }

  const lastSnap = snapshots[snapshots.length - 1];
  if (!lastSnap) {
    return null;
  }

  let mkt = 0;
  for (const sym of WATCHLIST_20) {
    const p = lastSnap.positions.get(sym)!;
    const px = lastSnap.lastPx.get(sym) ?? p.avg;
    mkt += p.qty * px;
  }
  const finalTpv = mkt + lastSnap.cash;

  const rows = buildSnapshotRows(uid, snapshots, metaBySym);
  return { uid, email, rows, finalTpv };
}

async function main() {
  loadEnv();
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    console.error("Need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const apply = process.argv.includes("--apply");
  const emailArg = process.argv.find((a) => a.startsWith("--email="));
  const email = emailArg ? emailArg.split("=")[1] : "appaitechmanager@gmail.com";

  const supabase: Sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result = await simulatePortfolioYear(supabase, email);
  if (!result) {
    console.error("No auth user for email:", email);
    process.exit(1);
  }

  if (apply) {
    await applySnapshotRows(supabase, url, key, result.uid, result.email, result.rows, result.finalTpv);
  } else {
    process.stdout.write(snapshotRowsToSql(result.uid, result.email, result.rows, result.finalTpv));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
