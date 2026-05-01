"use client";

import { useId } from "react";
import { AppModal, ModalSection } from "@/components/ui/AppModal";
import { APP_CTA_FILL } from "@/lib/appCtaClasses";
import { cn } from "@/lib/utils";

export type ConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called before `onClose` — close the modal from the parent if you need to keep it open while saving. */
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
};

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
}: ConfirmModalProps) {
  const titleId = useId();
  const descId = useId();

  return (
    <AppModal open={open} onClose={onClose} size="sm" titleId={titleId} describedById={descId}>
      <ModalSection className="flex flex-col gap-3 px-5 pb-2 pt-5">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <div id={descId} className="text-sm leading-relaxed text-subtle">
          {description}
        </div>
      </ModalSection>
      <ModalSection className="mt-2 flex flex-wrap justify-end gap-2 border-t border-border px-4 py-4 dark:border-foreground/10">
        <button type="button" onClick={onClose} className="ui-hover-pop rounded-lg border border-border px-4 py-2 text-sm text-foreground">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-semibold",
            variant === "danger"
              ? "ui-hover-pop border border-error/40 bg-error-bg text-error dark:border-error/35"
              : cn("ui-hover-spotlight", APP_CTA_FILL)
          )}
        >
          {confirmLabel}
        </button>
      </ModalSection>
    </AppModal>
  );
}
