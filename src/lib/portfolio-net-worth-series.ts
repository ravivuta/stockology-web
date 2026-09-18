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

export function mergeNetWorthOverlay(base: NetWorthPoint[], overlay: NetWorthPoint[]): NetWorthPoint[] {
  const byDay = new Map<string, NetWorthPoint>();
  for (const point of base) {
    if (!Number.isFinite(point.value) || point.value <= 0) continue;
    byDay.set(etCalendarDateString(new Date(point.t)), point);
  }
  for (const point of overlay) {
    if (!Number.isFinite(point.value) || point.value <= 0) continue;
    byDay.set(etCalendarDateString(new Date(point.t)), point);
  }
  return [...byDay.values()].sort((a, b) => a.t - b.t);
}

/** Mark current holdings to historical adjusted closes — same columns used for SPY. */
export function reconstructNetWorthFromHoldingsCloses(
  holdings: Array<{ symbol: string; quantity: number }>,
  cash: number,
  pricesBySymbol: Record<string, Array<{ date: string; close: number }>>
): NetWorthPoint[] {
  const positions = holdings.filter((h) => h.quantity > 0 && Number.isFinite(h.quantity));
  if (positions.length === 0) return [];

  const closeOnDate = new Map<string, Map<string, number>>();
  const allDays = new Set<string>();
  for (const holding of positions) {
    const rows = pricesBySymbol[holding.symbol] ?? pricesBySymbol[holding.symbol.toUpperCase()] ?? [];
    for (const row of rows) {
      const ymd = row.date.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !Number.isFinite(row.close) || row.close <= 0) continue;
      allDays.add(ymd);
      if (!closeOnDate.has(ymd)) closeOnDate.set(ymd, new Map());
      closeOnDate.get(ymd)!.set(holding.symbol.toUpperCase(), row.close);
    }
  }

  const lastClose = new Map<string, number>();
  const points: NetWorthPoint[] = [];
  for (const ymd of [...allDays].sort((a, b) => a.localeCompare(b))) {
    const dayCloses = closeOnDate.get(ymd);
    if (dayCloses) {
      for (const [symbol, close] of dayCloses) lastClose.set(symbol, close);
    }
    let total = Number.isFinite(cash) ? cash : 0;
    let missing = false;
    for (const holding of positions) {
      const close = lastClose.get(holding.symbol.toUpperCase());
      if (close == null) {
        missing = true;
        break;
      }
      total += holding.quantity * close;
    }
    if (missing || !Number.isFinite(total) || total <= 0) continue;
    points.push({ t: parseYmdUtcNoon(ymd), value: total });
  }
  return points;
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

function coerceRpcArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (typeof data === "string") {
    try {
      const parsed: unknown = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function snapshotEtYmd(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 10) return null;
  const ymd = trimmed.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

function rowsToNetWorthPoints(rows: unknown[]): NetWorthPoint[] {
  const byDate = new Map<string, { value: number; updated: string }>();
  for (const row of rows as { et_calendar_date?: unknown; total_portfolio_value?: unknown; updated_at?: unknown }[]) {
    const d = snapshotEtYmd(row.et_calendar_date) ?? snapshotEtYmd(String(row.updated_at ?? "").slice(0, 10));
    if (!d) continue;
    const v = Number(row.total_portfolio_value);
    if (!Number.isFinite(v) || v <= 0) continue;
    const upd = typeof row.updated_at === "string" ? row.updated_at : "";
    const cur = byDate.get(d);
    if (!cur || upd > cur.updated) byDate.set(d, { value: v, updated: upd });
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { value }]) => ({ t: parseYmdUtcNoon(date), value }));
}

function coerceLatestSnapshotRow(data: unknown): unknown | null {
  if (data == null) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  if (typeof data === "object") return data;
  if (typeof data === "string") {
    try {
      return coerceLatestSnapshotRow(JSON.parse(data));
    } catch {
      return null;
    }
  }
  return null;
}

export async function fetchCloudNetWorthHistory(
  supabase: SupabaseClient,
  dataUserId: string,
  maxDays = 400
): Promise<NetWorthPoint[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - maxDays);
  const sinceStr = since.toISOString().slice(0, 10);

  const chart = await supabase.rpc("get_portfolio_chart_history", {
    p_user_id: dataUserId,
    p_start_et_date: sinceStr,
  });
  const chartPts = rowsToNetWorthPoints(coerceRpcArray(chart.data));
  if (chartPts.length > 0) return chartPts;

  // Holdings are AES-256-CBC encrypted at rest; must read via RPC which decrypts server-side.
  const snapshots = await supabase.rpc("get_portfolio_snapshots", {
    p_user_id: dataUserId,
    p_start_et_date: sinceStr,
  });
  const snapshotPts = rowsToNetWorthPoints(coerceRpcArray(snapshots.data));
  if (snapshotPts.length > 0) return snapshotPts;

  const latest = await supabase.rpc("get_latest_portfolio_snapshot", {
    p_user_id: dataUserId,
  });
  const latestRow = coerceLatestSnapshotRow(latest.data);
  return latestRow ? rowsToNetWorthPoints([latestRow]) : [];
}

export function distinctEtCalendarDays(points: NetWorthPoint[]): number {
  const days = new Set<string>();
  for (const point of points) {
    days.add(etCalendarDateString(new Date(point.t)));
  }
  return days.size;
}

/** vs-SPY needs two real portfolio days. Synthetic live_only placeholders do not count. */
export function hasEnoughHistoryForSpyComparison(
  source: NetWorthSeriesMeta["source"] | undefined,
  cloudHistory: NetWorthPoint[] | null,
  points: NetWorthPoint[]
): boolean {
  if (!source || source === "live_only") return false;
  if ((cloudHistory?.length ?? 0) >= 1) return true;
  return distinctEtCalendarDays(points) >= 1;
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
  liveTotal: number,
  /** Pass false when position stocks exist but prices haven't loaded yet, so a near-zero
   *  liveTotal doesn't overwrite today's cloud snapshot and produce a spurious cliff. */
  pricesReady: boolean = true
): NetWorthSeriesMeta {
  const cloud = cloudHistory;

  if (cloud.length >= 1) {
    const withLive = pricesReady ? appendLiveToday(cloud, liveTotal) : cloud;
    return { points: mergeSortedPoints(withLive), source: "cloud" };
  }

  const journalPts = netWorthPointsFromJournal(journal);
  if (journalPts.length > 0) {
    const withLive = pricesReady ? appendLiveToday(journalPts, liveTotal) : journalPts;
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
