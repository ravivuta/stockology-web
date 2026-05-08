import type { PricePoint } from "@/lib/stock-chart";

const STORAGE_PREFIX = "stocks-pm-historical-price-cache:v1:";
const MAX_POINTS_PER_SYMBOL = 2500;

type HistoricalPriceCacheEntry = {
  points: PricePoint[];
  fetchedAt: number;
  etDay: string;
};

const historyBySymbol = new Map<string, HistoricalPriceCacheEntry>();

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function storageKey(symbol: string): string {
  return `${STORAGE_PREFIX}${symbol}`;
}

function currentEtDay(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function sanitizePoints(points: PricePoint[]): PricePoint[] {
  const byDate = new Map<string, number>();

  for (const point of points) {
    const date = typeof point.date === "string" ? point.date.slice(0, 10) : "";
    const close = Number(point.close);
    if (date.length !== 10 || !Number.isFinite(close) || close <= 0) continue;
    byDate.set(date, close);
  }

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-MAX_POINTS_PER_SYMBOL)
    .map(([date, close]) => ({ date, close }));
}

function loadFromStorage(symbol: string): HistoricalPriceCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(symbol));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HistoricalPriceCacheEntry | null;
    if (!parsed || !Array.isArray(parsed.points)) return null;
    const entry: HistoricalPriceCacheEntry = {
      points: sanitizePoints(parsed.points),
      fetchedAt: Number.isFinite(parsed.fetchedAt) ? parsed.fetchedAt : 0,
      etDay: typeof parsed.etDay === "string" ? parsed.etDay : "",
    };
    historyBySymbol.set(symbol, entry);
    return entry;
  } catch {
    return null;
  }
}

function readEntry(symbol: string): HistoricalPriceCacheEntry | null {
  return historyBySymbol.get(symbol) ?? loadFromStorage(symbol);
}

function sliceForDays(points: PricePoint[], days: number): PricePoint[] {
  if (days <= 0 || points.length <= days) return points;
  return points.slice(-days);
}

export function getCachedHistoricalPricePoints(
  symbol: string,
  days: number
): { points: PricePoint[]; isFresh: boolean } | null {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;

  const entry = readEntry(normalized);
  if (!entry || entry.points.length < days) return null;

  return {
    points: sliceForDays(entry.points, days),
    isFresh: entry.etDay === currentEtDay(),
  };
}

export function setCachedHistoricalPricePoints(symbol: string, points: PricePoint[]): void {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return;

  const previous = readEntry(normalized);
  const merged = sanitizePoints([...(previous?.points ?? []), ...points]);
  if (merged.length === 0) return;

  const entry: HistoricalPriceCacheEntry = {
    points: merged,
    fetchedAt: Date.now(),
    etDay: currentEtDay(),
  };

  historyBySymbol.set(normalized, entry);

  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(normalized), JSON.stringify(entry));
  } catch {
    // Ignore quota/storage errors and keep the in-memory cache.
  }
}
