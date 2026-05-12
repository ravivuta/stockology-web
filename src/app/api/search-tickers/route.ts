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

function isUSListing(ticker: MSTicker): boolean {
  const ex = ticker.stock_exchange;
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

  const url = new URL(MARKETSTACK_BASE);
  url.searchParams.set("access_key", apiKey);
  url.searchParams.set("search", query);
  url.searchParams.set("limit", "20");

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return NextResponse.json([], { status: 200 });
    const json = await res.json();
    if (json?.error) return NextResponse.json([], { status: 200 });

    const tickers: MSTicker[] = json?.data ?? [];
    const usResults = tickers
      .filter(isUSListing)
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
