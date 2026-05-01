import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json();
  } catch {
    // fall through with empty payload
  }

  let years = Number(payload.years ?? 1);
  if (!Number.isFinite(years)) years = 1;
  years = Math.max(1, Math.min(80, Math.trunc(years)));

  return NextResponse.json({ ok: true, years, portfolio: null });
}
