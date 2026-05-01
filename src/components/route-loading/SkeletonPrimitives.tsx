"use client";

import { cn } from "@/lib/utils";

export function UiSkeleton({ className }: { className?: string }) {
  return <div className={cn("ui-skeleton", className)} aria-hidden />;
}

export function AuthUiSkeleton({ className }: { className?: string }) {
  return <div className={cn("auth-route-skeleton", className)} aria-hidden />;
}
