export type TickerSearchRow = { symbol: string; company_name: string | null };

/**
 * Typeahead via MarketStack /v1/tickers search, proxied through the
 * /api/search-tickers route to keep the API key server-side.
 * Results are pre-filtered to US exchanges.
 */
export async function searchTickers(
  _supabase: unknown,
  raw: string,
  limit = 18
): Promise<TickerSearchRow[]> {
  const safe = raw.trim().slice(0, 32);
  if (safe.length < 1) return [];

  const url = `/api/search-tickers?q=${encodeURIComponent(safe)}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data: { symbol: string; company_name: string | null }[] = await res.json();
  const q = safe.toUpperCase();
  const list = data.slice(0, limit);
  list.sort((a, b) => {
    const ap = a.symbol.startsWith(q) ? 0 : 1;
    const bp = b.symbol.startsWith(q) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.symbol.localeCompare(b.symbol);
  });
  return list;
}
