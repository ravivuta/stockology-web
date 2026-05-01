"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { StockDetailExpandPanel } from "@/components/stock/StockDetailExpandPanel";

export default function StockDetailPage() {
  const params = useParams();
  const raw = typeof params.symbol === "string" ? params.symbol : "";
  const symbol = decodeURIComponent(raw).toUpperCase();
  const valid = useMemo(() => /^[A-Z0-9][A-Z0-9.-]*$/.test(symbol), [symbol]);

  if (!valid) {
    return <p className="text-sm text-subtle">Invalid symbol.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <StockDetailExpandPanel symbol={symbol} showBackLink />
    </div>
  );
}
