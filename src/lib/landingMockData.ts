/** Illustrative landing-page data only — not live quotes or user data. */

export const signalMetrics = [
  {
    k: "Next",
    v: "$142",
    hint: "Suggested add zone from your rules and last quote—not a market order.",
  },
  {
    k: "MA 50",
    v: "$138",
    hint: "Synced or computed from recent closes, same window as your chart.",
  },
  {
    k: "Score",
    v: "77",
    hint: "Composite risk–return style score from your parameters.",
  },
] as const;

export const allocMeta = [
  {
    w: 38,
    label: "Tech",
    pct: "38%",
    drift: "+1.2%",
    c: "bg-emerald-400",
    detail: "Growth sleeves often drive day-to-day volatility in a diversified book.",
  },
  {
    w: 24,
    label: "ETFs",
    pct: "24%",
    drift: "−0.4%",
    c: "bg-cyan-400",
    detail: "Core beta and sector ETFs can anchor allocation while you tilt with singles.",
  },
  {
    w: 18,
    label: "Finance",
    pct: "18%",
    drift: "+0.2%",
    c: "bg-violet-400",
    detail: "Rate-sensitive names—size consciously next to your macro view.",
  },
  {
    w: 20,
    label: "Other",
    pct: "20%",
    drift: "−0.8%",
    c: "bg-zinc-500",
    detail: "Everything else: trim or add when drift exceeds the band you set.",
  },
] as const;

export const newsPreviewItems = [
  {
    id: "lp-n1",
    symbol: "AAPL",
    companyName: "Apple Inc.",
    title: "Supply chain update shifts margin outlook for holiday quarter",
    sentiment: "neutral" as string | null,
    source: "Reuters",
    rel: "2h ago",
  },
  {
    id: "lp-n2",
    symbol: "MACRO",
    companyName: null as string | null,
    title: "Fed path and yields in focus ahead of heavy data week",
    sentiment: "bearish",
    source: "Bloomberg",
    rel: "4h ago",
  },
  {
    id: "lp-n3",
    symbol: "NVDA",
    companyName: "NVIDIA Corp.",
    title: "Data-center demand narrative holds analyst attention after earnings",
    sentiment: "bullish",
    source: "CNBC",
    rel: "5h ago",
  },
  {
    id: "lp-n4",
    symbol: "MSFT",
    companyName: "Microsoft Corp.",
    title: "Cloud growth steady; AI copilot adoption tracked in enterprise segment",
    sentiment: "positive",
    source: "WSJ",
    rel: "Yesterday",
  },
] as const;

export const csvImportLogLines = [
  { t: "ok", line: "> stocks_pm import positions.csv --dry-run=false" },
  { t: "ok", line: "[12:04:02] Detected header: symbol,qty,cost_basis" },
  { t: "ok", line: "[12:04:02] Parsed 24 rows · 0 errors" },
  { t: "warn", line: "[12:04:03] WARN duplicate lot merged: AAPL (2 → 1)" },
  { t: "ok", line: "[12:04:03] Book snapshot v184 written" },
] as const;

export const csvBeforeAfter = {
  before: [
    { symbol: "AAPL", qty: "—", basis: "—" },
    { symbol: "MSFT", qty: "—", basis: "—" },
  ],
  after: [
    { symbol: "AAPL", qty: "40", basis: "$178.20" },
    { symbol: "MSFT", qty: "12", basis: "$410.05" },
  ],
} as const;

export function sentimentToneLabel(sentiment: string | null): string {
  if (!sentiment?.trim()) return "Neutral";
  const s = sentiment.toLowerCase();
  if (s === "positive" || s === "bullish") return "Bullish";
  if (s === "negative" || s === "bearish") return "Bearish";
  return "Neutral";
}
