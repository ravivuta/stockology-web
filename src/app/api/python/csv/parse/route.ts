import { NextRequest, NextResponse } from "next/server";

const MAX_ROWS = 50_000;

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json();
  } catch {
    // fall through with empty payload
  }

  let rows: unknown[] = [];
  if (Array.isArray(payload.rows)) {
    rows = payload.rows.slice(0, MAX_ROWS);
  }

  return NextResponse.json({ ok: true, row_count: rows.length, normalized: rows });
}
