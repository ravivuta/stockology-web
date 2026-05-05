const HISTORY_FRESH_MS = 12 * 60 * 60 * 1000;

type RecommendationHistoryEntry = {
  closes: number[];
  fetchedAt: number;
};

const historyBySymbol = new Map<string, RecommendationHistoryEntry>();

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
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
  const entry = historyBySymbol.get(normalizeSymbol(symbol));
  return entry?.closes;
}

export function hasFreshRecommendationHistory(symbol: string, minDays = 25): boolean {
  const entry = historyBySymbol.get(normalizeSymbol(symbol));
  if (!entry || entry.closes.length < minDays) return false;
  return Date.now() - entry.fetchedAt < HISTORY_FRESH_MS;
}
