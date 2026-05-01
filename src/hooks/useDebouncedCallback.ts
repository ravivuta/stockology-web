"use client";
import { useCallback, useRef } from "react";

export function useDebouncedCallback<T extends (...a: unknown[]) => void>(fn: T, ms: number): T {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    ((...args: unknown[]) => {
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => fn(...args), ms);
    }) as T,
    [fn, ms]
  );
}
