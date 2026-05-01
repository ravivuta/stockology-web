import type { SupabaseClient } from "@supabase/supabase-js";

export type TickerSearchRow = { symbol: string; company_name: string | null };

/** Strip characters that break PostgREST `ilike` filter values. */
function sanitizeSearchFragment(raw: string): string {
  return raw.trim().replace(/[%_,\\]/g, "").slice(0, 32);
}

/**
 * Typeahead against `ticker_data` (symbol + company name). Dedupes by symbol.
 */
export async function searchTickers(
  supabase: SupabaseClient,
  raw: string,
  limit = 18
): Promise<TickerSearchRow[]> {
  const safe = sanitizeSearchFragment(raw);
  if (safe.length < 1) return [];
  const p = `%${safe}%`;
  const cap = Math.min(limit * 2, 40);

  const [symRes, nameRes] = await Promise.all([
    supabase.from("ticker_data").select("symbol, company_name").ilike("symbol", p).limit(cap),
    supabase.from("ticker_data").select("symbol, company_name").ilike("company_name", p).limit(cap),
  ]);

  const bySym = new Map<string, TickerSearchRow>();
  const merge = (rows: { symbol: unknown; company_name: unknown }[] | null) => {
    for (const row of rows ?? []) {
      const sym = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
      if (!sym) continue;
      if (!bySym.has(sym)) {
        bySym.set(sym, {
          symbol: sym,
          company_name: typeof row.company_name === "string" ? row.company_name : null,
        });
      }
    }
  };
  merge(symRes.data);
  merge(nameRes.data);

  const q = safe.toUpperCase();
  const list = [...bySym.values()];
  list.sort((a, b) => {
    const ap = a.symbol.startsWith(q) ? 0 : 1;
    const bp = b.symbol.startsWith(q) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.symbol.localeCompare(b.symbol);
  });
  return list.slice(0, limit);
}
