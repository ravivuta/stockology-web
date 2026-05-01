/**
 * PEG from DB/API (yfinance, PostgREST). Only positive finite values are shown in UI.
 */
export function parseStockPeg(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "string") {
    const t = raw.trim().replace(/,/g, "");
    if (t === "" || /^nan$/i.test(t)) return undefined;
  }
  const x = typeof raw === "number" ? raw : parseFloat(String(raw).trim().replace(/,/g, ""));
  if (!Number.isFinite(x) || x <= 0) return undefined;
  return x;
}
