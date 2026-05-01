#!/usr/bin/env node
/**
 * Reset Supabase portfolio snapshots for a target email and seed ~1 year of daily
 * net-worth points plus a final holdings snapshot (10 diversified US equities).
 *
 * Requires service role (bypasses RLS):
 *   export SUPABASE_URL="https://xxx.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="..."
 *
 * Run from repo:
 *   cd website/next && node scripts/seed-demo-account.mjs
 *
 * Optional: SEED_TARGET_EMAIL (default appaitechmanager@gmail.com)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_CANDIDATES = [
  join(__dirname, "..", ".env.local"),
  join(__dirname, "..", ".env"),
  join(__dirname, "..", "..", "..", ".env.local"),
];

function loadDotEnv() {
  for (const p of ENV_CANDIDATES) {
    if (!existsSync(p)) continue;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const k = m[1];
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
    }
    break;
  }
}

loadDotEnv();

const TARGET_EMAIL = (process.env.SEED_TARGET_EMAIL || "appaitechmanager@gmail.com").trim().toLowerCase();

function etCalendarDateString(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

function addDaysToYmd(ymd, delta) {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const next = new Date(base + delta * 86400000);
  return etCalendarDateString(next);
}

function enumerateEtDaysInclusive(startYmd, endYmd) {
  const out = [];
  let cur = startYmd;
  while (cur <= endYmd) {
    out.push(cur);
    cur = addDaysToYmd(cur, 1);
  }
  return out;
}

function unixFromIso(iso) {
  return Math.floor(new Date(iso).getTime() / 1000);
}

/** Mirrors post-wipe branch of resolve_stocks_pm_data_user_id v2 (subscription on auth uid wins, else legacy). */
async function resolveDataUserId(supabase, authUid, legacyId) {
  const { data: sub } = await supabase.from("user_subscriptions").select("user_id").eq("user_id", authUid).limit(1).maybeSingle();
  if (sub?.user_id) return authUid;
  if (legacyId && legacyId !== authUid) return legacyId;
  return authUid;
}

async function findAuthUserIdByEmail(supabase, email) {
  let page = 1;
  const perPage = 200;
  for (; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || "").toLowerCase() === email);
    if (u) return u.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

/**
 * PostgREST DELETE via fetch + AbortController. Some Node / network setups hang on
 * supabase-js `.delete().eq()`; direct REST does not.
 */
async function deleteSnapshotsRest(supabaseUrl, serviceKey, userId) {
  const base = supabaseUrl.replace(/\/$/, "").trim();
  const key = serviceKey.trim();
  const endpoint = `${base}/rest/v1/user_portfolio_snapshots?user_id=eq.${encodeURIComponent(userId)}`;
  const ms = 25_000;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(endpoint, {
      method: "DELETE",
      signal: controller.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(
        `DELETE timed out after ${ms / 1000}s. Retry, toggle VPN, or run in SQL Editor: DELETE FROM user_portfolio_snapshots WHERE user_id = '${userId}';`
      );
    }
    throw e;
  } finally {
    clearTimeout(to);
  }
}

/**
 * End-state holdings: “followed app” narrative — staggered buys, trims on strength,
 * averages below last for unrealized gains.
 */
function buildFinalHoldings() {
  const rows = [
    {
      symbol: "AAPL",
      name: "Apple Inc.",
      qty: 65,
      avg: 208.4,
      last: 251.2,
      targetPrice: 268,
      reco: "HOLD",
      lots: {
        open: [
          { q: 30, cost: 198.2, date: "2025-04-08" },
          { q: 35, cost: 217.1, date: "2025-09-16" },
        ],
        sold: [{ qty: 12, price: 242.5, basis: 195, iso: "2026-01-14T16:00:00.000Z" }],
      },
    },
    {
      symbol: "MSFT",
      name: "Microsoft Corporation",
      qty: 48,
      avg: 382.6,
      last: 438.9,
      targetPrice: 460,
      reco: "HOLD",
      lots: {
        open: [
          { q: 22, cost: 368.1, date: "2025-05-01" },
          { q: 26, cost: 394.8, date: "2025-11-05" },
        ],
        sold: [],
      },
    },
    {
      symbol: "GOOGL",
      name: "Alphabet Inc.",
      qty: 110,
      avg: 158.2,
      last: 184.6,
      targetPrice: 198,
      reco: "BUY",
      lots: {
        open: [{ q: 110, cost: 158.2, date: "2025-06-12" }],
        sold: [],
      },
    },
    {
      symbol: "AMZN",
      name: "Amazon.com Inc.",
      qty: 55,
      avg: 182.4,
      last: 201.3,
      targetPrice: 215,
      reco: "HOLD",
      lots: {
        open: [
          { q: 25, cost: 176.2, date: "2025-04-22" },
          { q: 30, cost: 187.5, date: "2025-10-01" },
        ],
        sold: [],
      },
    },
    {
      symbol: "NVDA",
      name: "NVIDIA Corporation",
      qty: 95,
      avg: 112.8,
      last: 158.4,
      targetPrice: 172,
      reco: "HOLD",
      lots: {
        open: [
          { q: 40, cost: 98.5, date: "2025-03-31" },
          { q: 55, cost: 123.2, date: "2025-08-07" },
        ],
        sold: [{ qty: 20, price: 148.2, basis: 102, iso: "2025-12-03T16:00:00.000Z" }],
      },
    },
    {
      symbol: "META",
      name: "Meta Platforms Inc.",
      qty: 28,
      avg: 528.4,
      last: 612.8,
      targetPrice: 640,
      reco: "HOLD",
      lots: {
        open: [
          { q: 15, cost: 485.0, date: "2025-05-20" },
          { q: 13, cost: 578.5, date: "2026-02-10" },
        ],
        sold: [{ qty: 8, price: 595.0, basis: 470, iso: "2025-11-18T16:00:00.000Z" }],
      },
    },
    {
      symbol: "JPM",
      name: "JPMorgan Chase & Co.",
      qty: 42,
      avg: 218.6,
      last: 244.1,
      targetPrice: 258,
      reco: "HOLD",
      lots: {
        open: [{ q: 42, cost: 218.6, date: "2025-07-08" }],
        sold: [],
      },
    },
    {
      symbol: "V",
      name: "Visa Inc.",
      qty: 38,
      avg: 288.2,
      last: 319.5,
      targetPrice: 335,
      reco: "HOLD",
      lots: {
        open: [
          { q: 18, cost: 272.4, date: "2025-04-14" },
          { q: 20, cost: 302.6, date: "2025-12-08" },
        ],
        sold: [],
      },
    },
    {
      symbol: "UNH",
      name: "UnitedHealth Group Inc.",
      qty: 22,
      avg: 512.3,
      last: 498.6,
      targetPrice: 540,
      reco: "BUY",
      lots: {
        open: [{ q: 22, cost: 512.3, date: "2025-08-26" }],
        sold: [],
      },
    },
    {
      symbol: "COST",
      name: "Costco Wholesale Corporation",
      qty: 14,
      avg: 798.5,
      last: 942.2,
      targetPrice: 980,
      reco: "HOLD",
      lots: {
        open: [
          { q: 8, cost: 765.0, date: "2025-06-03" },
          { q: 6, cost: 843.2, date: "2026-01-22" },
        ],
        sold: [],
      },
    },
  ];

  const holdings = rows.map((r) => {
    const openLots = r.lots.open.map((o) => ({
      quantity: o.q,
      costBasis: o.cost,
      purchaseDate: o.date,
      status: "open",
      account: "",
    }));
    const soldLots = r.lots.sold.map((s) => ({
      salePrice: s.price,
      quantity: s.qty,
      originalCostBasis: s.basis,
      saleDateIntervalSince1970: unixFromIso(s.iso),
    }));
    return {
      symbol: r.symbol,
      quantity: r.qty,
      averageCost: r.avg,
      lastPrice: r.last,
      currentPrice: r.last,
      shortSMA: 50,
      dynamicFactor: r.symbol === "NVDA" ? 22 : 18,
      stockLimit: 15000,
      transactionLimit: 4000,
      targetPrice: r.targetPrice,
      isShortlisted: true,
      name: r.name,
      recommendation: r.reco,
      moving_avg: Math.round((r.avg + r.last) / 2),
      isETF: false,
      lotHistory: {
        symbol: r.symbol,
        openLots,
        soldLots,
      },
    };
  });

  let cost = 0;
  let mkt = 0;
  for (const r of rows) {
    cost += r.qty * r.avg;
    mkt += r.qty * r.last;
  }
  const cash = 12480.55;
  const totalUnrealized = mkt - cost;
  const totalPortfolioValue = mkt + cash;
  return { holdings, cash, total_cost_basis: cost, total_portfolio_value: totalPortfolioValue, total_unrealized_gain: totalUnrealized };
}

function portfolioValueCurve(startV, endV, dayIndex, totalDays) {
  const t = totalDays <= 1 ? 1 : dayIndex / (totalDays - 1);
  const smooth = startV + (endV - startV) * Math.pow(t, 0.9);
  const wobble = 1 + 0.014 * Math.sin(dayIndex * 0.37) + 0.009 * Math.sin(dayIndex * 0.11);
  return Math.round(smooth * wobble);
}

async function main() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Looking up auth user:", TARGET_EMAIL);
  const authUid = await findAuthUserIdByEmail(supabase, TARGET_EMAIL);
  if (!authUid) {
    console.error("No auth.users row for that email. User must sign up once first.");
    process.exit(1);
  }

  const { data: legacyRow } = await supabase.from("users").select("id").ilike("email", TARGET_EMAIL).maybeSingle();
  const legacyId = legacyRow?.id ?? null;

  const idsToClear = [...new Set([authUid, legacyId].filter(Boolean))];
  const target = await resolveDataUserId(supabase, authUid, legacyId);

  console.log("Auth uid:", authUid);
  console.log("Legacy public.users id:", legacyId || "(none)");
  console.log("Resolved data user_id (seed target):", target);
  console.log("Deleting existing snapshots for:", idsToClear.join(", "));

  for (const uid of idsToClear) {
    console.log("  DELETE via REST …", uid);
    try {
      await deleteSnapshotsRest(url, key, uid);
      console.log("  OK (or 0 rows).");
    } catch (e) {
      console.error("Delete failed:", e?.message ?? e);
      process.exit(1);
    }
  }

  const final = buildFinalHoldings();
  const endV = final.total_portfolio_value;
  const startV = Math.round(endV * 0.66);

  const etToday = etCalendarDateString();
  const startYmd = addDaysToYmd(etToday, -365);
  const days = enumerateEtDaysInclusive(startYmd, etToday);
  const nowIso = new Date().toISOString();

  const bulk = [];
  const nDays = days.length;
  for (let i = 0; i < nDays; i++) {
    const et_calendar_date = days[i];
    const isLast = et_calendar_date === etToday;
    const v = isLast ? endV : portfolioValueCurve(startV, endV, i, nDays);
    const t = nDays <= 1 ? 1 : i / (nDays - 1);
    const ratio = v / endV;

    const cash_balance = isLast ? final.cash : Math.max(0, Math.round(final.cash * ratio));
    const stockValue = Math.max(0, v - cash_balance);
    const total_cost_basis = isLast
      ? Math.round(final.total_cost_basis)
      : Math.max(1, Math.round(final.total_cost_basis * (0.52 + 0.46 * t)));
    const total_unrealized_gain = isLast
      ? Math.round(final.total_unrealized_gain)
      : Math.max(0, Math.round(stockValue - total_cost_basis));

    bulk.push({
      user_id: target,
      et_calendar_date,
      holdings: isLast ? final.holdings : [],
      cash_balance,
      total_portfolio_value: v,
      total_cost_basis,
      total_unrealized_gain,
      updated_at: isLast ? nowIso : new Date(`${et_calendar_date}T20:00:00.000Z`).toISOString(),
    });
  }

  const chunk = 80;
  const insertTimeoutMs = 120_000;
  for (let i = 0; i < bulk.length; i += chunk) {
    const slice = bulk.slice(i, i + chunk);
    const n = Math.floor(i / chunk) + 1;
    console.log(`Inserting chunk ${n} (${slice.length} rows)…`);
    let timer;
    const timeoutP = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Insert timed out after ${insertTimeoutMs / 1000}s`)),
        insertTimeoutMs
      );
    });
    let result;
    try {
      result = await Promise.race([supabase.from("user_portfolio_snapshots").insert(slice), timeoutP]);
    } catch (e) {
      console.error("Insert chunk failed:", e?.message ?? e);
      process.exit(1);
    } finally {
      clearTimeout(timer);
    }
    const { error } = result;
    if (error) {
      console.error("Insert chunk failed:", error.message);
      process.exit(1);
    }
  }

  console.log(`Inserted ${bulk.length} snapshot rows ending ${etToday}.`);
  console.log(`Final total_portfolio_value ≈ $${endV.toLocaleString()} (cash $${final.cash.toLocaleString()}).`);
  console.log("Note: Web trade history is local-only; the net worth chart uses these daily snapshots.");
  console.log("If the portfolio page still looks old, clear site data for this origin or use a fresh session (sessionStorage hydrate key).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
