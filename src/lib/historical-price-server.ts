type HistoryRow = {
  date: string;
  close: number;
};

export function sanitizeProvidedHistory(value: unknown): HistoryRow[] {
  if (!Array.isArray(value)) return [];

  const deduped = new Map<string, number>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const date = typeof (row as { date?: unknown }).date === "string" ? (row as { date: string }).date.slice(0, 10) : "";
    const close = Number((row as { close?: unknown }).close);
    if (date.length !== 10 || !Number.isFinite(close) || close <= 0) continue;
    deduped.set(date, close);
  }

  return [...deduped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, close]) => ({ date, close }));
}

export function sanitizeProvidedHistoryMap(value: unknown): Record<string, HistoryRow[]> {
  if (!value || typeof value !== "object") return {};

  const out: Record<string, HistoryRow[]> = {};
  for (const [rawSymbol, rows] of Object.entries(value as Record<string, unknown>)) {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!/^[A-Z0-9.^-]{1,10}$/.test(symbol)) continue;
    const history = sanitizeProvidedHistory(rows);
    if (history.length > 0) out[symbol] = history;
  }
  return out;
}
