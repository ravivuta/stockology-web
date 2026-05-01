import { NextRequest, NextResponse } from "next/server";

const MAX_SYMBOLS = 300;

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json();
  } catch {
    // fall through with empty payload
  }

  let symbols: string[] = [];
  if (Array.isArray(payload.symbols)) {
    symbols = (payload.symbols as unknown[])
      .filter((s): s is string => typeof s === "string")
      .slice(0, MAX_SYMBOLS);
  }

  return NextResponse.json({
    ok: true,
    refreshed_at: new Date().toISOString(),
    symbols,
  });
}
