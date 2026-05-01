export default function CsvHelpPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">CSV import / export</h1>
      <p className="text-sm text-subtle">
        Import and export match the Stocks PM mobile app. Use <strong className="font-medium text-foreground">Import CSV</strong> on Portfolio or Watchlist to load a file;{" "}
        <strong className="font-medium text-foreground">Export CSV</strong> downloads every tracked symbol (holdings and watch-only) in the same column layout as the app.
      </p>

      <div className="ui-hover-lift rounded-xl border border-border bg-elevated p-4 text-sm text-subtle">
        <p className="font-medium text-foreground">1. Lot export (from mobile portfolio share)</p>
        <p className="mt-2">
          Header: <code className="rounded bg-border/60 px-1 py-0.5 text-xs">purchaseDate,transaction,symbol,qty,price,account,retirementAccount</code>.{" "}
          <code className="rounded bg-border/60 px-1 py-0.5 text-xs">account</code> is the account/profile name and{" "}
          <code className="rounded bg-border/60 px-1 py-0.5 text-xs">retirementAccount</code> accepts values like <code className="rounded bg-border/60 px-1 py-0.5 text-xs">yes</code>,{" "}
          <code className="rounded bg-border/60 px-1 py-0.5 text-xs">no</code>, <code className="rounded bg-border/60 px-1 py-0.5 text-xs">retirement</code>, or{" "}
          <code className="rounded bg-border/60 px-1 py-0.5 text-xs">taxable</code>. Rows with SELL / SOLD in the transaction column are skipped on import. BUY rows are preserved as
          separate lots so account metadata and purchase dates remain visible in stock details.
        </p>
      </div>

      <div className="ui-hover-lift rounded-xl border border-border bg-elevated p-4 text-sm text-subtle">
        <p className="font-medium text-foreground">2. Simple / broker-style</p>
        <p className="mt-2">
          A column for ticker (Symbol, ticker, code, …) is required. Quantity and price columns are optional; omitted quantity defaults to 0 (watchlist). Recognized price headers
          include average cost, cost basis, last price, and similar. Flexible spacing and casing.
        </p>
      </div>

      <div className="ui-hover-lift rounded-xl border border-border bg-elevated p-4 text-sm text-subtle">
        <p className="font-medium text-foreground">3. Full strategy export (mobile round-trip)</p>
        <p className="mt-2">
          If the header includes <code className="rounded bg-border/60 px-1 py-0.5 text-xs">Symbol</code>, <code className="rounded bg-border/60 px-1 py-0.5 text-xs">Quantity</code>,{" "}
          <code className="rounded bg-border/60 px-1 py-0.5 text-xs">AverageCost</code>, <code className="rounded bg-border/60 px-1 py-0.5 text-xs">ShortSMA</code>, and{" "}
          <code className="rounded bg-border/60 px-1 py-0.5 text-xs">DynamicFactor</code>, optional columns such as StockLimit, TransactionLimit, TargetPrice, Name, Account, and
          retirement/account type are applied on import.
        </p>
      </div>
    </div>
  );
}
