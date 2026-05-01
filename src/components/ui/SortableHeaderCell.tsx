"use client";

import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

type Props<T extends string> = {
  label: string;
  column: T;
  activeColumn: T;
  direction: SortDirection;
  onSort: (column: T) => void;
  align?: "left" | "right";
  className?: string;
};

export function SortableHeaderCell<T extends string>({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  align = "left",
  className,
}: Props<T>) {
  const active = column === activeColumn;
  const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        "px-4 pb-2 pt-3 text-xs font-semibold tracking-wide",
        align === "right" ? "text-right tabular-nums" : "text-left",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" ? "ml-auto justify-end" : "justify-start"
        )}
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={cn("text-[10px]", active ? "text-foreground" : "text-subtle/70")}
        >
          {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
