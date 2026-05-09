import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";
import { upsertPortfolioSnapshotForCloudUser, type PortfolioSlice } from "@/lib/portfolio-cloud-sync";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeSlice(value: unknown): PortfolioSlice | null {
  if (!isRecord(value)) return null;

  const rawStocks = Array.isArray(value.stocks) ? value.stocks : [];
  const stocks = rawStocks
    .filter(isRecord)
    .map((stock) => ({
      ...stock,
      symbol: typeof stock.symbol === "string" ? stock.symbol.trim().toUpperCase() : "",
      quantity: finiteNumber(stock.quantity),
      averageCost: finiteNumber(stock.averageCost),
      shortSMA: finiteNumber(stock.shortSMA, 50),
      dynamicFactor: finiteNumber(stock.dynamicFactor, 20),
      stockLimit: finiteNumber(stock.stockLimit, 10000),
      transactionLimit: finiteNumber(stock.transactionLimit, 2500),
      pendingOptimization: stock.pendingOptimization !== false,
      lastPrice: stock.lastPrice == null ? undefined : finiteNumber(stock.lastPrice),
    }))
    .filter((stock) => stock.symbol.length > 0);

  const lotsBySymbol = isRecord(value.lotsBySymbol) ? value.lotsBySymbol : {};

  return {
    cashBalance: finiteNumber(value.cashBalance),
    stocks: stocks as PortfolioSlice["stocks"],
    lotsBySymbol: lotsBySymbol as PortfolioSlice["lotsBySymbol"],
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { slice?: unknown } | null;
  const slice = sanitizeSlice(body?.slice);
  if (!slice) {
    return NextResponse.json({ error: "Invalid portfolio snapshot payload." }, { status: 400 });
  }

  const dataUserId = await syncStocksPmAuthUser(supabase, user.id);
  const admin = createAdminClient();
  const { error } = await upsertPortfolioSnapshotForCloudUser(admin, dataUserId, slice);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, dataUserId });
}
