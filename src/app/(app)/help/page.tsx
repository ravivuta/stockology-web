"use client";

import { useMemo, useState, useCallback } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  LayoutGrid,
  Wallet,
  Filter,
  LineChart,
  SlidersHorizontal,
  User,
  Search,
  HelpCircle,
} from "lucide-react";

type HelpCategory = "overview" | "stock-detail" | "portfolio" | "filters" | "signals" | "advanced" | "account";

type Section = { category: HelpCategory; title: string; body: string };

const CATEGORY_META: {
  id: HelpCategory;
  label: string;
  blurb: string;
  icon: typeof BookOpen;
}[] = [
  { id: "overview", label: "Overview", blurb: "What Stocks PM is and how to start", icon: BookOpen },
  { id: "stock-detail", label: "Stock detail", blurb: "Tabs, trades, and strategy", icon: LayoutGrid },
  { id: "portfolio", label: "Portfolio & limits", blurb: "Sizing, caps, and watchlist rules", icon: Wallet },
  { id: "filters", label: "Filters & lists", blurb: "Shortlisting and list views", icon: Filter },
  { id: "signals", label: "Recommendations", blurb: "Actions and how they’re chosen", icon: LineChart },
  { id: "advanced", label: "Optimization", blurb: "Parameter sweeps and tuning", icon: SlidersHorizontal },
  { id: "account", label: "Account", blurb: "Alerts and profile", icon: User },
];

const SECTIONS: Section[] = [
  {
    category: "overview",
    title: "How Stocks PM Works",
    body: "Stocks PM is designed for investors who have already identified promising stocks. You pick the symbols you believe in; the app applies technical rules and tuned parameters to suggest position sizing, timing, and risk-aware actions. It doesn’t pick stocks for you—it helps you get more from the names you already follow.",
  },
  {
    category: "overview",
    title: "Getting Started",
    body: "Add stocks to your watchlist, set your portfolio size, and let the app analyze market data to provide personalized recommendations. The app automatically refreshes once daily at market open (9:30 AM ET) and sends notifications when recommendations become actionable.",
  },
  {
    category: "stock-detail",
    title: "Stock Detail Tabs",
    body: "Tap any stock card to view detailed information in 4 organized tabs: Recommendation (current action and analysis), Snapshot (price and market data), Holdings (position details and trade recording), Strategy (read-only parameters that can only be updated via optimization).",
  },
  {
    category: "portfolio",
    title: "Portfolio Size",
    body: "Total capital used to size positions and run backtests. Position sizing and limits scale off this value. The app recommends an optimal watchlist size (10-100 stocks) based on your portfolio size for proper diversification.",
  },
  {
    category: "portfolio",
    title: "Enforce Ideal Watchlist Size",
    body: "Profile setting that limits recommendations and portfolio views to your ideal portfolio size (based on portfolio amount) ranked by composite score. When enabled, only top-scored stocks are included in recommendation display and sizing views. When disabled, all stocks in watchlist are considered. Helps focus on highest-conviction picks. Note: Holdings are always included in recommendations. ETFs are unlimited and don't count toward the size limit, so you can have as many ETFs as you want while still getting stock recommendations up to your ideal watchlist size.",
  },
  {
    category: "portfolio",
    title: "Stock Limit Calculation",
    body: "Stock Limit = (Portfolio Size ÷ Recommended Watchlist Size) × Risk Multiplier. Risk multipliers: ETFs get 10x base allocation for larger positions, stocks with score ≥50 get 1x base allocation, stocks with score <50 get 0.5x for smaller positions. Example: $100k portfolio with 20 recommended stocks = $5k base per stock. High-score stock gets $5k limit, low-score gets $2.5k, ETF gets $50k.",
  },
  {
    category: "portfolio",
    title: "Transaction Limit",
    body: "Maximum dollars per individual buy/sell. Keeps trades in smaller increments. Calculated as 25% of Stock Limit for stocks, 10% for ETFs. Also adjusted by risk multiplier for lower-scored stocks.",
  },
  {
    category: "portfolio",
    title: "Percent below AVG for rebuying",
    body: "Percent below the average price of your holding to wait for before adding to positions. Higher = more patient (requires deeper pullbacks).",
  },
  {
    category: "filters",
    title: "Current Holding Filter",
    body: "Shows only symbols where quantity is greater than zero.",
  },
  {
    category: "filters",
    title: "Actionable Filter",
    body: "Shows only stocks with BUY, ADD, SELL, or REDUCE recommendations (excludes WAIT states).",
  },
  {
    category: "filters",
    title: "Shortlisted Filter",
    body: "Shows all stocks with any recommendation (BUY/SELL/REDUCE/WAIT*). Excludes stocks without recommendation data.",
  },
  {
    category: "filters",
    title: "No Recommendation Filter",
    body: "Shows stocks without any recommendation data.",
  },
  {
    category: "filters",
    title: "Stock Shortlisting Process",
    body: "Stocks PM intelligently filters your watchlist to focus on high-quality opportunities. When Risk Appetite filtering is enabled in Profile settings, stocks are screened based on market capitalization and analyst ratings. The same filters apply to both watchlist views and live recommendations for consistency. When 'Enforce Ideal Watchlist Size' is enabled, only the top-scoring stocks (up to your recommended watchlist size) receive BUY/SELL/ADD/REDUCE signals - others show as HOLD or no recommendation. When disabled, all qualifying stocks receive recommendations.",
  },
  {
    category: "signals",
    title: "Recommendations",
    body: "High-level actions (BUY/ADD/SELL/REDUCE/WAIT) based on trend, targets, and position size versus limits. WAIT states become actionable BUY/ADD/SELL/REDUCE when conditions are met.",
  },
  {
    category: "stock-detail",
    title: "Trade Recording",
    body: "Record buy/sell transactions from each stock's detail view. Enter quantity, price, and account fields there to update positions, tax lots, and recommendations.",
  },
  {
    category: "stock-detail",
    title: "Strategy Parameters",
    body: "Initiate position at moving avg (days), Percent below AVG for rebuying, Targeted holding size, and Transaction amount for each Buy/Add are displayed read-only. To modify these, run optimization on the stock to find better parameter combinations.",
  },
  {
    category: "advanced",
    title: "Optimization",
    body: "Runs parameter sweeps (moving average days, percent below average for rebuying, limits) on historical data to find better combos for returns and risk. Apply optimized parameters to update strategy settings.",
  },
  {
    category: "account",
    title: "Notifications",
    body: "Receive iOS notifications when recommendations change from WAIT to actionable (BUY/ADD/SELL/REDUCE). Enable notifications in iOS Settings for alerts even when the app is closed.",
  },
  {
    category: "account",
    title: "Profile & Settings",
    body: "Access account information, subscription management, timezone/country settings, and auto-refresh preferences in the 3-tab profile view.",
  },
];

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sectionMatchesQuery(s: Section, q: string) {
  if (!q.trim()) return true;
  const t = `${s.title} ${s.body}`.toLowerCase();
  return t.includes(q.trim().toLowerCase());
}

export default function HelpPage() {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [highlightCategory, setHighlightCategory] = useState<HelpCategory | null>(null);

  const filtered = useMemo(() => SECTIONS.filter((s) => sectionMatchesQuery(s, query)), [query]);

  const sectionsByCategory = useMemo(() => {
    const map = new Map<HelpCategory, Section[]>();
    for (const c of CATEGORY_META) map.set(c.id, []);
    for (const s of filtered) {
      map.get(s.category)?.push(s);
    }
    return map;
  }, [filtered]);

  const scrollToCategory = useCallback((id: HelpCategory) => {
    setHighlightCategory(id);
    document.getElementById(`help-category-${id}`)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => setHighlightCategory(null), 1400);
  }, [reduceMotion]);

  const listContainerVariants = reduceMotion
    ? undefined
    : {
        hidden: {},
        show: {
          transition: { staggerChildren: 0.055, delayChildren: 0.03 },
        },
      };

  const listItemVariants = reduceMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 14 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
        },
      };

  const heroMotion = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } };

  return (
    <div className="w-full pb-16">
      <motion.header
        className="relative overflow-hidden rounded-3xl border border-border bg-elevated px-6 py-10 shadow-[var(--theme-shadow-card)] sm:px-10 sm:py-12"
        {...heroMotion}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-40"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 12% -10%, color-mix(in srgb, var(--theme-primary) 28%, transparent), transparent 55%), radial-gradient(ellipse 70% 50% at 92% 0%, color-mix(in srgb, var(--theme-primary-light) 18%, transparent), transparent 50%)",
          }}
        />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary dark:bg-primary/15">
              <HelpCircle className="h-3.5 w-3.5" aria-hidden />
              Guide
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Help &amp; glossary</h1>
            <p className="text-base leading-relaxed text-subtle sm:text-lg">
              Same topics as the Stocks PM mobile app—organized so you can scan or search.
            </p>
          </div>
          <div className="relative w-full shrink-0 lg:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics…"
              className="no-ui-hover w-full rounded-2xl border border-border bg-background py-3 pl-10 pr-4 text-sm text-foreground shadow-sm placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/35"
              aria-label="Search help topics"
            />
          </div>
        </div>
      </motion.header>

      <div className="mt-8 sm:mt-10 xl:grid xl:grid-cols-12 xl:gap-10">
        <aside className="mb-10 hidden xl:col-span-3 xl:block">
          <nav
            className="sticky top-6 space-y-1 rounded-2xl border border-border bg-elevated p-3 shadow-[var(--theme-shadow-card)]"
            aria-label="On this page"
          >
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-subtle">On this page</p>
            {CATEGORY_META.map((cat) => {
              const count = sectionsByCategory.get(cat.id)?.length ?? 0;
              if (count === 0) return null;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => scrollToCategory(cat.id)}
                  className="no-ui-hover flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/80"
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="font-medium">{cat.label}</span>
                  <span className="ml-auto text-xs tabular-nums text-subtle">{count}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-14 xl:col-span-9">
          <AnimatePresence mode="popLayout">
            {filtered.length === 0 ? (
              <motion.p
                key="empty"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center text-sm text-subtle"
              >
                No topics match “{query.trim()}”. Try another word or clear the search.
              </motion.p>
            ) : null}
          </AnimatePresence>

          {CATEGORY_META.map((cat) => {
            const items = sectionsByCategory.get(cat.id) ?? [];
            if (items.length === 0) return null;
            const Icon = cat.icon;
            const pulse = highlightCategory === cat.id;

            return (
              <motion.section
                key={cat.id}
                id={`help-category-${cat.id}`}
                className="scroll-mt-6"
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <div
                  className={`mb-5 flex flex-wrap items-center gap-3 border-b border-border pb-4 transition-[box-shadow] duration-500 ${
                    pulse ? "rounded-t-xl ring-2 ring-primary/35 ring-offset-2 ring-offset-background" : ""
                  }`}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary dark:bg-primary/20">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{cat.label}</h2>
                    <p className="text-sm text-subtle">{cat.blurb}</p>
                  </div>
                </div>

                <motion.ul
                  className="grid gap-4 sm:grid-cols-2"
                  variants={listContainerVariants}
                  initial={reduceMotion ? false : "hidden"}
                  animate={reduceMotion ? undefined : "show"}
                >
                  {items.map((s) => (
                    <motion.li key={s.title} variants={listItemVariants} layout={!reduceMotion} className="list-none">
                      <article
                        id={`help-${slugify(s.title)}`}
                        className="group ui-hover-lift flex h-full flex-col rounded-2xl border border-border bg-elevated p-5 dark:border-foreground/10"
                      >
                        <div className="mb-3 h-0.5 w-10 rounded-full bg-gradient-to-r from-primary to-primary/40 transition-[width] duration-300 group-hover:w-14" />
                        <h3 className="text-base font-semibold leading-snug text-foreground">{s.title}</h3>
                        <p className="mt-2 flex-1 text-sm leading-relaxed text-subtle">{s.body}</p>
                      </article>
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
