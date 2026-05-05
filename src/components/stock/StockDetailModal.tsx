"use client";

import { StockDetailExpandPanel } from "@/components/stock/StockDetailExpandPanel";
import { AppModal, ModalSection } from "@/components/ui/AppModal";
import { X } from "lucide-react";

type Props = {
  symbol: string | null;
  onClose: () => void;
};

export function StockDetailModal({ symbol, onClose }: Props) {
  return (
    <AppModal
      open={symbol != null}
      onClose={onClose}
      size="lg"
      titleId="stock-detail-modal-title"
      shellClassName="items-stretch p-0 sm:items-stretch sm:p-0"
      panelClassName="max-w-[min(100vw,88rem)] h-[100dvh] max-h-[100dvh] overflow-visible border-transparent bg-transparent shadow-none"
    >
      <ModalSection className="sr-only">
        <h2 id="stock-detail-modal-title">Stock details</h2>
      </ModalSection>
      {symbol ? (
        <div className="relative flex h-full min-h-0 flex-1">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 rounded-full border border-border/80 bg-elevated/95 p-2 text-subtle shadow-sm backdrop-blur hover:border-border hover:text-foreground dark:border-white/[0.08] dark:bg-[#11161f]/95 dark:hover:border-white/[0.12] sm:right-4 sm:top-4"
            aria-label="Close stock details"
          >
            <X className="h-5 w-5" />
          </button>
          <StockDetailExpandPanel symbol={symbol} />
        </div>
      ) : null}
    </AppModal>
  );
}
