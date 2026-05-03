"use client";

import { StockDetailExpandPanel } from "@/components/stock/StockDetailExpandPanel";
import { AppModal, ModalSection } from "@/components/ui/AppModal";

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
      panelClassName="max-w-[min(96vw,88rem)] border-transparent bg-transparent shadow-none"
    >
      <ModalSection className="sr-only">
        <h2 id="stock-detail-modal-title">Stock details</h2>
      </ModalSection>
      {symbol ? <StockDetailExpandPanel symbol={symbol} onClose={onClose} /> : null}
    </AppModal>
  );
}
