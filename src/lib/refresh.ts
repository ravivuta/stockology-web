"use client";

const MAX_REFRESH_SYMBOLS = 250;
const MAX_SYMBOL_LEN = 16;

function sanitizeSymbols(symbols: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of symbols) {
    if (typeof s !== "string") continue;
    const u = s.trim().toUpperCase();
    if (!u || u.length > MAX_SYMBOL_LEN) continue;
    if (!/^[A-Z0-9.\-]+$/.test(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= MAX_REFRESH_SYMBOLS) break;
  }
  return out;
}

export async function runRefreshPipeline(symbols: string[]): Promise<{ ok: boolean; message?: string }> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  try {
    const clean = sanitizeSymbols(symbols);
    const res = await fetch(`${basePath}/api/python/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: clean }),
    });
    const data = await res.json();
    return { ok: data.ok === true, message: data.message };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
