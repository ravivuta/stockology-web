"use client";

import type { PricePoint } from "@/lib/stock-chart";
import { getCachedHistoricalPricePoints } from "@/lib/historical-price-cache";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { fetchHistoricalPricePoints } from "@/lib/supabase-stock-history";

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export async function loadHistoricalPayloadForSymbol(symbol: string, days: number): Promise<PricePoint[]> {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return [];

  const cached = getCachedHistoricalPricePoints(normalized, days);
  if (cached?.points.length) {
    return cached.points;
  }

  if (!hasSupabaseConfig()) return [];

  const supabase = createClient();
  const { points } = await fetchHistoricalPricePoints(supabase, normalized, days);
  return points;
}

export async function loadHistoricalPayloadBySymbol(
  symbols: string[],
  days: number
): Promise<Record<string, PricePoint[]>> {
  const unique = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  if (unique.length === 0) return {};

  const entries = await Promise.all(
    unique.map(async (symbol) => [symbol, await loadHistoricalPayloadForSymbol(symbol, days)] as const)
  );

  return Object.fromEntries(entries.filter(([, points]) => points.length > 0));
}
