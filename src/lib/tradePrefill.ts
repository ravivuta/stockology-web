export function parseSuggestedQuantity(comments: string): number | null {
  const pattern = /\b(?:Buy|Add|Sell)\s+([0-9]+(?:\.[0-9]+)?)\b/i;
  const m = comments.match(pattern);
  if (!m?.[1]) return null;
  const q = parseFloat(m[1]);
  return q > 0 ? q : null;
}

export function suggestedTradeType(action: string): "BUY" | "SELL" | null {
  if (["BUY", "ADD"].includes(action)) return "BUY";
  if (["SELL", "REDUCE"].includes(action)) return "SELL";
  return null;
}
