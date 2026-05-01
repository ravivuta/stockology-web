import type { SupabaseClient } from "@supabase/supabase-js";
import type { TradeJournalEntry } from "@/store/portfolioStore";

export type NetWorthPoint = { t: number; value: number };

export type NetWorthSeriesMeta = {
  points: NetWorthPoint[];
  /** Where the primary series came from */
  source: "cloud" | "journal" | "live_only";
};

export type TodayChangeDelta = {
  change: number;
  percent: number;
  hasBaseline: boolean;
};

function etCalendarDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

function etWeekdayShort(d = new Date()): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);
}

function parseYmdUtcNoon(ymd: string): number {
  const p = ymd.trim().split("-").map((x) => parseInt(x, 10));
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return Date.now();
  return Date.UTC(p[0], p[1] - 1, p[2], 12, 0, 0);
}

export function computeTodayChangeFromHistory(
  cloudHistory: NetWorthPoint[],
  liveTotal: number,
  now = new Date()
): TodayChangeDelta {
  const weekday = etWeekdayShort(now);
  if (weekday === "Sat" || weekday === "Sun") {
    return { change: 0, percent: 0, hasBaseline: false };
  }

  if (!Number.isFinite(liveTotal) || liveTotal <= 0) {
    return { change: 0, percent: 0, hasBaseline: false };
  }

  const todayEt = etCalendarDateString(now);
  const todayT = parseYmdUtcNoon(todayEt);
  const baseline = [...cloudHistory]
    .filter((point) => Number.isFinite(point.value) && point.value > 0 && point.t < todayT)
    .sort((a, b) => a.t - b.t)
    .at(-1);

  if (!baseline || baseline.value <= 0) {
    return { change: 0, percent: 0, hasBaseline: false };
  }

  const change = liveTotal - baseline.value;
  const percent = (change / baseline.value) * 100;
  return { change, percent, hasBaseline: true };
}

export function computeTodayChangeFromLiveQuotes(
  stocks: Array<{ quantity: number; lastPrice?: number; dailyChangePercent?: number }>,
  cash: number
): TodayChangeDelta {
  let currentHoldings = 0;
  let previousHoldings = 0;
  let hasAnyQuoteDelta = false;

  for (const stock of stocks) {
    const value = stock.quantity * (stock.lastPrice ?? 0);
    if (!Number.isFinite(value) || value <= 0) continue;
    currentHoldings += value;

    const pct = stock.dailyChangePercent;
    if (pct != null && Number.isFinite(pct)) {
      const ratio = 1 + pct / 100;
      if (ratio > 0) {
        previousHoldings += value / ratio;
        hasAnyQuoteDelta = true;
        continue;
      }
    }

    previousHoldings += value;
  }

  if (!hasAnyQuoteDelta) return { change: 0, percent: 0, hasBaseline: false };

  const currentTotal = currentHoldings + cash;
  const previousTotal = previousHoldings + cash;
  if (!Number.isFinite(previousTotal) || previousTotal <= 0) {
    return { change: 0, percent: 0, hasBaseline: false };
  }

  const change = currentTotal - previousTotal;
  const percent = (change / previousTotal) * 100;
  return { change, percent, hasBaseline: true };
}

export function computeLivePortfolioTotal(
  stocks: { quantity: number; lastPrice?: number }[],
  cash: number
): number {
  let v = cash;
  for (const s of stocks) {
    v += s.quantity * (s.lastPrice ?? 0);
  }
  return v;
}

type SimHolding = { qty: number; avg: number; last: number };
type Sim = { cash: number; stocks: Map<string, SimHolding> };

function simTotal(s: Sim): number {
  let t = s.cash;
  for (const [, h] of s.stocks) {
    t += h.qty * h.last;
  }
  return t;
}

function seedBeforeFirstTrade(e: TradeJournalEntry): Sim {
  const stocks = new Map<string, SimHolding>();
  if (e.quantityBefore > 0) {
    stocks.set(e.symbol, {
      qty: e.quantityBefore,
      avg: e.averageCostBefore,
      last: e.lastPriceBefore,
    });
  }
  return { cash: e.cashBefore, stocks };
}

function applyBuy(sim: Sim, e: TradeJournalEntry) {
  const cost = e.quantity * e.price;
  sim.cash -= cost;
  const cur = sim.stocks.get(e.symbol);
  if (!cur || cur.qty <= 0) {
    sim.stocks.set(e.symbol, { qty: e.quantity, avg: e.price, last: e.price });
    return;
  }
  const costBasis = cur.qty * cur.avg + e.quantity * e.price;
  const q1 = cur.qty + e.quantity;
  sim.stocks.set(e.symbol, { qty: q1, avg: q1 > 0 ? costBasis / q1 : 0, last: e.price });
}

function applySell(sim: Sim, e: TradeJournalEntry) {
  const proceeds = e.quantity * e.price;
  sim.cash += proceeds;
  const cur = sim.stocks.get(e.symbol);
  if (!cur) return;
  const q1 = Math.max(0, cur.qty - e.quantity);
  if (q1 <= 0) sim.stocks.delete(e.symbol);
  else sim.stocks.set(e.symbol, { qty: q1, avg: cur.avg, last: e.price });
}

/**
 * Approximate net worth after each journal entry using trade-time prices for the
 * traded symbol only; other symbols keep their last traded price from earlier steps.
 */
export function netWorthPointsFromJournal(journal: TradeJournalEntry[]): NetWorthPoint[] {
  if (journal.length === 0) return [];
  const sorted = [...journal].sort((a, b) => {
    const c = a.tradeDate.localeCompare(b.tradeDate);
    if (c !== 0) return c;
    return a.createdAt.localeCompare(b.createdAt);
  });
  const points: NetWorthPoint[] = [];
  const sim = seedBeforeFirstTrade(sorted[0]);
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.side === "BUY") applyBuy(sim, e);
    else applySell(sim, e);
    const ms = new Date(e.createdAt).getTime();
    points.push({ t: Number.isFinite(ms) ? ms + i : Date.now() + i, value: simTotal(sim) });
  }
  return points;
}

export async function fetchCloudNetWorthHistory(
  supabase: SupabaseClient,
  dataUserId: string,
  maxDays = 400
): Promise<NetWorthPoint[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - maxDays);
  const sinceStr = since.toISOString().slice(0, 10);

  // Holdings are AES-256-CBC encrypted at rest; must read via RPC which decrypts server-side.
  const { data, error } = await supabase.rpc("get_portfolio_snapshots", {
    p_user_id: dataUserId,
    p_start_et_date: sinceStr,
  });

  if (error || !data) return [];

  // RPC returns a JSONB array
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return [];

  const byDate = new Map<string, { value: number; updated: string }>();
  for (const row of rows as { et_calendar_date: string | null; total_portfolio_value: unknown; updated_at: string | null }[]) {
    const d = row.et_calendar_date;
    if (!d || typeof d !== "string") continue;
    const v = Number(row.total_portfolio_value);
    if (!Number.isFinite(v)) continue;
    const upd = row.updated_at ?? "";
    const cur = byDate.get(d);
    if (!cur || upd > cur.updated) byDate.set(d, { value: v, updated: upd });
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { value }]) => ({ t: parseYmdUtcNoon(date), value }));
}

function mergeSortedPoints(points: NetWorthPoint[]): NetWorthPoint[] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const out: NetWorthPoint[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && last.t === p.t) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** Append or update “today” (ET calendar date) with the live total from the client store. */
function appendLiveToday(points: NetWorthPoint[], liveTotal: number): NetWorthPoint[] {
  const todayEt = etCalendarDateString();
  const todayT = parseYmdUtcNoon(todayEt);
  const now = Date.now();
  const next = [...points];
  const idx = next.findIndex((p) => p.t === todayT);
  if (idx >= 0) next[idx] = { t: todayT, value: liveTotal };
  else next.push({ t: now, value: liveTotal });
  return mergeSortedPoints(next);
}

/**
 * Prefer Supabase daily snapshots when available; otherwise approximate from the trade journal.
 * `cloudHistory` is usually from {@link fetchCloudNetWorthHistory} (may be empty).
 */
export function finalizeNetWorthSeries(
  cloudHistory: NetWorthPoint[],
  journal: TradeJournalEntry[],
  liveTotal: number
): NetWorthSeriesMeta {
  const cloud = cloudHistory;

  if (cloud.length >= 1) {
    const withLive = appendLiveToday(cloud, liveTotal);
    return { points: mergeSortedPoints(withLive), source: "cloud" };
  }

  const journalPts = netWorthPointsFromJournal(journal);
  if (journalPts.length > 0) {
    const withLive = appendLiveToday(journalPts, liveTotal);
    return { points: mergeSortedPoints(withLive), source: "journal" };
  }

  const todayEt = etCalendarDateString();
  const todayT = parseYmdUtcNoon(todayEt);
  return {
    points: mergeSortedPoints([
      { t: todayT - 86400000, value: liveTotal },
      { t: Math.max(Date.now(), todayT), value: liveTotal },
    ]),
    source: "live_only",
  };
}
