"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";

const SIZE_CLASS = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

export const modalStaggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.052, delayChildren: 0.06 },
  },
  exit: {
    opacity: 0,
    transition: { staggerChildren: 0.026, staggerDirection: -1, when: "afterChildren" },
  },
};

export const modalStaggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    y: 5,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  },
};

export function ModalSection({ className, children }: { className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={modalStaggerItem}>
      {children}
    </motion.div>
  );
}

export type AppModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  shellClassName?: string;
  panelClassName?: string;
  titleId?: string;
  describedById?: string;
  /** When true, wrap children in a stagger root — use `ModalSection` for each block that should step in. */
  stagger?: boolean;
};

export function AppModal({
  open,
  onClose,
  children,
  size = "md",
  className,
  shellClassName,
  panelClassName,
  titleId,
  describedById,
  stagger = true,
}: AppModalProps) {
  const reduce = useReducedMotion();
  const instanceId = useId();
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      panelRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  if (!mounted) return null;

  const backdropEase = [0.22, 1, 0.36, 1] as const;
  const backdropTransition = reduce ? { duration: 0.14 } : { duration: 0.36, ease: backdropEase };

  const panelSpring = reduce
    ? { duration: 0.16, ease: backdropEase }
    : { type: "spring" as const, stiffness: 400, damping: 21, mass: 0.86 };

  const panelExit = reduce
    ? { opacity: 0, transition: { duration: 0.14 } }
    : {
        scale: 0.93,
        opacity: 0,
        y: 6,
        transition: { duration: 0.24, ease: [0.4, 0, 1, 1] as const },
      };

  const panelShellExit = reduce
    ? { opacity: 0, transition: { duration: 0.14 } }
    : { opacity: 0, transition: { duration: 0.2, ease: backdropEase } };

  const content = (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key={`${instanceId}-backdrop`}
            type="button"
            aria-label="Close dialog"
            className={`no-ui-hover fixed inset-0 z-[200] bg-yale/40 dark:bg-black/55 ${className ?? ""}`.trim()}
            initial={
              reduce
                ? { opacity: 0 }
                : { opacity: 0, backdropFilter: "blur(0px)", WebkitBackdropFilter: "blur(0px)" }
            }
            animate={
              reduce
                ? { opacity: 1 }
                : { opacity: 1, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }
            }
            exit={
              reduce
                ? { opacity: 0 }
                : { opacity: 0, backdropFilter: "blur(0px)", WebkitBackdropFilter: "blur(0px)" }
            }
            transition={backdropTransition}
            onClick={onClose}
          />
          <motion.div
            key={`${instanceId}-shell`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={describedById}
            className={`pointer-events-none fixed inset-0 z-[201] flex items-end justify-center p-0 sm:items-center sm:p-4 ${shellClassName ?? ""}`.trim()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={panelShellExit}
            transition={backdropTransition}
          >
            <motion.div
              ref={panelRef}
              tabIndex={-1}
              className={`pointer-events-auto flex w-full ${SIZE_CLASS[size]} max-h-[min(92vh,720px)] flex-col overflow-hidden rounded-t-2xl border border-border bg-elevated shadow-xl dark:border-primary/20 sm:rounded-2xl ${panelClassName ?? ""}`.trim()}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.88, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={panelExit}
              transition={panelSpring}
              onClick={(e) => e.stopPropagation()}
            >
              {stagger && !reduce ? (
                <motion.div
                  className="flex min-h-0 flex-1 flex-col"
                  variants={modalStaggerContainer}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                >
                  {children}
                </motion.div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
              )}
            </motion.div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
