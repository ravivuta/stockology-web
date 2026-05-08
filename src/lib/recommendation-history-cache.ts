import { getCachedHistoricalPricePoints } from "@/lib/historical-price-cache";

const HISTORY_FRESH_MS = 24 * 60 * 60 * 1000;

type RecommendationHistoryEntry = {
  closes: number[];
  fetchedAt: number;
};

const historyBySymbol = new Map<string, RecommendationHistoryEntry>();

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function loadFromPersistentCache(symbol: string): RecommendationHistoryEntry | null {
  const cached = getCachedHistoricalPricePoints(symbol, 1);
  if (!cached) return null;
  const entry: RecommendationHistoryEntry = {
    closes: cached.points.map((point) => point.close),
    fetchedAt: Date.now(),
  };
  historyBySymbol.set(normalizeSymbol(symbol), entry);
  return entry;
}

export function setRecommendationHistory(symbol: string, closes: number[]): void {
  const normalized = normalizeSymbol(symbol);
  if (!normalized || closes.length === 0) return;
  historyBySymbol.set(normalized, {
    closes: closes.filter((value) => Number.isFinite(value)),
    fetchedAt: Date.now(),
  });
}

export function getRecommendationHistoryCloses(symbol: string): number[] | undefined {
  const normalized = normalizeSymbol(symbol);
  const entry = historyBySymbol.get(normalized) ?? loadFromPersistentCache(normalized);
  return entry?.closes;
}

export function hasFreshRecommendationHistory(symbol: string, minDays = 25): boolean {
  const normalized = normalizeSymbol(symbol);
  const entry = historyBySymbol.get(normalized) ?? loadFromPersistentCache(normalized);
  if (!entry || entry.closes.length < minDays) return false;
  return Date.now() - entry.fetchedAt < HISTORY_FRESH_MS;
}
