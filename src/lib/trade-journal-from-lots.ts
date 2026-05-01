import type { SoldLot, TradeJournalEntry, TradeLot } from "@/store/portfolioStore";

type LotsBundle = { open: TradeLot[]; sold: SoldLot[] };

type LotEvent =
  | { kind: "BUY"; symbol: string; ts: number; qty: number; price: number; dateRaw: string; lotId: string }
  | { kind: "SELL"; symbol: string; ts: number; qty: number; price: number; dateRaw: string };

function eventTimeMs(raw: string): number {
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function tradeDateCell(raw: string): string {
  const s = raw.trim();
  if (s.length >= 10 && s[4] === "-" && s[7] === "-") return s.slice(0, 10);
  return s;
}

function createdAtIso(ts: number, fallbackYmd: string): string {
  if (Number.isFinite(ts) && ts > 0) return new Date(ts).toISOString();
  const ymd = tradeDateCell(fallbackYmd);
  const p = ymd.split("-").map((x) => parseInt(x, 10));
  if (p.length === 3 && p.every((n) => Number.isFinite(n)))
    return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12, 0, 0)).toISOString();
  return new Date().toISOString();
}

/**
 * Rebuilds a chronological trade journal from tax lots (e.g. iOS snapshot `lotHistory`).
 * Rows are marked `undoable: false` because they are not the same as live-recorded journal entries.
 */
export function buildTradeJournalFromLots(lotsBySymbol: Record<string, LotsBundle>): TradeJournalEntry[] {
  const events: LotEvent[] = [];

  for (const [symbol, bundle] of Object.entries(lotsBySymbol)) {
    const sym = symbol.toUpperCase();
    for (const lot of bundle.open) {
      events.push({
        kind: "BUY",
        symbol: sym,
        ts: eventTimeMs(lot.purchaseDate),
        qty: lot.quantity,
        price: lot.costBasis,
        dateRaw: lot.purchaseDate,
        lotId: lot.id,
      });
    }
    const soldChrono = [...bundle.sold].reverse();
    for (const sl of soldChrono) {
      events.push({
        kind: "SELL",
        symbol: sym,
        ts: eventTimeMs(sl.saleDate),
        qty: sl.quantity,
        price: sl.salePrice,
        dateRaw: sl.saleDate,
      });
    }
  }

  events.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    const c = a.symbol.localeCompare(b.symbol);
    if (c !== 0) return c;
    if (a.kind !== b.kind) return a.kind === "BUY" ? -1 : 1;
    return 0;
  });

  let cash = 0;
  const pos: Record<string, { qty: number; avg: number; last: number }> = {};
  const journal: TradeJournalEntry[] = [];
  let seq = 0;

  for (const ev of events) {
    const sym = ev.symbol;
    const p = pos[sym] ?? { qty: 0, avg: 0, last: ev.kind === "BUY" ? ev.price : 0 };

    if (ev.kind === "BUY") {
      const q0 = p.qty;
      const avg0 = p.avg;
      const last0 = q0 > 0 ? p.last : ev.price;
      const costTotal = q0 * avg0 + ev.qty * ev.price;
      const q1 = q0 + ev.qty;
      const avg1 = q1 > 0 ? costTotal / q1 : 0;

      journal.push({
        id: `inferred-${seq++}`,
        createdAt: createdAtIso(ev.ts, ev.dateRaw),
        symbol: sym,
        side: "BUY",
        quantity: ev.qty,
        price: ev.price,
        tradeDate: tradeDateCell(ev.dateRaw),
        cashBefore: cash,
        quantityBefore: q0,
        averageCostBefore: avg0,
        lastPriceBefore: last0,
        lotId: ev.lotId,
        undoable: false,
      });
      cash -= ev.qty * ev.price;
      pos[sym] = { qty: q1, avg: avg1, last: ev.price };
      continue;
    }

    const q0 = p.qty;
    if (q0 <= 0) continue;
    const sellQty = Math.min(ev.qty, q0);
    if (sellQty <= 0) continue;

    journal.push({
      id: `inferred-${seq++}`,
      createdAt: createdAtIso(ev.ts, ev.dateRaw),
      symbol: sym,
      side: "SELL",
      quantity: sellQty,
      price: ev.price,
      tradeDate: tradeDateCell(ev.dateRaw),
      cashBefore: cash,
      quantityBefore: q0,
      averageCostBefore: p.avg,
      lastPriceBefore: ev.price,
      undoable: false,
    });
    cash += sellQty * ev.price;
    const q1 = q0 - sellQty;
    if (q1 <= 0) delete pos[sym];
    else pos[sym] = { qty: q1, avg: p.avg, last: ev.price };
  }

  return journal.length > 200 ? journal.slice(-200) : journal;
}
