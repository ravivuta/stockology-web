import { NextRequest, NextResponse } from "next/server";

const MARKETSTACK_BASE = "https://api.marketstack.com/v1/tickers";

const ALLOWED_US_MICS = new Set(["XNYS", "XNAS", "XASE", "ARCX", "BATS", "IEXG"]);
const ALLOWED_US_ACRONYMS = new Set(["NYSE", "NASDAQ", "AMEX", "ARCA", "BATS", "IEX"]);

interface MSExchange {
  name?: string;
  acronym?: string;
  mic?: string;
  country?: string;
  country_code?: string;
}

interface MSTicker {
  symbol: string;
  name: string;
  stock_exchange?: MSExchange;
  exchange_mic?: string;
}

function isUSListing(ticker: MSTicker, query?: string): boolean {
  const ex = ticker.stock_exchange;
  // Exact bare-symbol match: if the user typed this exact ticker and Marketstack
  // returns it (no dot), always include it regardless of exchange metadata.
  if (query && ticker.symbol.toUpperCase() === query.toUpperCase().trim() && !ticker.symbol.includes(".")) return true;
  // No exchange metadata — let it through rather than silently dropping valid tickers.
  // Guard: only bare symbols (no dot suffix). Dotted symbols like RKLB.NZ are
  // foreign-exchange listings; bare symbols are always USD on Marketstack.
  if (!ex && !ticker.exchange_mic && !ticker.symbol.includes(".")) return true;
  const countryCode = ex?.country_code?.toUpperCase();
  if (countryCode === "US") return true;
  const country = ex?.country?.toUpperCase();
  if (country === "UNITED STATES" || country === "USA" || country === "US") return true;
  const mic = (ticker.exchange_mic ?? ex?.mic ?? "").toUpperCase();
  if (ALLOWED_US_MICS.has(mic) || ALLOWED_US_MICS.has(mic.slice(0, 4))) return true;
  const acronym = ex?.acronym?.toUpperCase() ?? "";
  if (ALLOWED_US_ACRONYMS.has(acronym)) return true;
  const name = ex?.name?.toUpperCase() ?? "";
  if (name.includes("NASDAQ") || name.includes("NEW YORK STOCK EXCHANGE") ||
      name.includes("NYSE") || name.includes("AMERICAN STOCK EXCHANGE")) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 1) return NextResponse.json([]);

  const apiKey = process.env.MARKETSTACK_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Search unavailable" }, { status: 503 });

  // For short ticker-like queries (1-5 chars, no spaces, all uppercase),
  // run a direct ticker lookup in parallel with the name search so exact
  // symbol matches (e.g. RDY, DXYZ) always appear at the top.
  const looksLikeTicker = query.length <= 5 && !query.includes(" ") && query === query.toUpperCase();

  const nameUrl = new URL(MARKETSTACK_BASE);
  nameUrl.searchParams.set("access_key", apiKey);
  nameUrl.searchParams.set("search", query);
  nameUrl.searchParams.set("limit", "20");

  try {
    const fetches: Promise<MSTicker | null | MSTicker[]>[] = [
      fetch(nameUrl.toString(), { headers: { Accept: "application/json" }, next: { revalidate: 60 } })
        .then(r => r.ok ? r.json() : null)
        .then(json => (json?.data ?? []) as MSTicker[])
        .catch(() => [] as MSTicker[]),
    ];

    if (looksLikeTicker) {
      const directUrl = new URL(`${MARKETSTACK_BASE}/${encodeURIComponent(query.toUpperCase())}`);
      directUrl.searchParams.set("access_key", apiKey);
      fetches.push(
        fetch(directUrl.toString(), { headers: { Accept: "application/json" }, next: { revalidate: 60 } })
          .then(r => r.ok ? r.json() : null)
          .then((json): MSTicker | null => json?.symbol ? (json as MSTicker) : null)
          .catch(() => null)
      );
    }

    const [nameResults, directResult] = await Promise.all(fetches) as [MSTicker[], MSTicker | null | undefined];

    const allTickers: MSTicker[] = [];
    if (directResult && typeof directResult === "object" && "symbol" in directResult) {
      allTickers.push(directResult as MSTicker);
    }
    for (const t of (nameResults as MSTicker[])) {
      if (!allTickers.some(x => x.symbol.toUpperCase() === t.symbol.toUpperCase())) {
        allTickers.push(t);
      }
    }

    console.log(`[search-tickers] raw results for "${query}":`, allTickers.map(t => `${t.symbol} mic=${t.exchange_mic ?? t.stock_exchange?.mic ?? "nil"} country=${t.stock_exchange?.country_code ?? t.stock_exchange?.country ?? "nil"}`));

    const usResults = allTickers
      .filter(t => isUSListing(t, query))
      .slice(0, 20)
      .map((t) => ({
        symbol: t.symbol,
        company_name: t.name ?? null,
        exchange: t.stock_exchange?.acronym ?? t.stock_exchange?.name ?? null,
      }));

    return NextResponse.json(usResults);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
