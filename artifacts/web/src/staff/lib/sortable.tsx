import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";

export type SortOrder = "asc" | "desc";

export interface SortState<TKey extends string = string> {
  by: TKey | null;
  order: SortOrder;
}

export function toggleSort<TKey extends string>(
  current: SortState<TKey>,
  key: TKey,
): SortState<TKey> {
  if (current.by !== key) return { by: key, order: "desc" };
  return { by: key, order: current.order === "desc" ? "asc" : "desc" };
}

export function compareValues(a: unknown, b: unknown): number {
  const aNull = a === null || a === undefined || a === "";
  const bNull = b === null || b === undefined || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const aN = typeof a === "string" ? Number(a) : NaN;
  const bN = typeof b === "string" ? Number(b) : NaN;
  if (!Number.isNaN(aN) && !Number.isNaN(bN)) return aN - bN;
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortRows<T, TKey extends string>(
  rows: T[],
  state: SortState<TKey>,
  getValue: (row: T, key: TKey) => unknown,
): T[] {
  if (!state.by) return rows;
  const key = state.by;
  const dir = state.order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => compareValues(getValue(a, key), getValue(b, key)) * dir);
}

interface SortableHeaderProps<TKey extends string> {
  sortKey: TKey;
  state: SortState<TKey>;
  onSort: (key: TKey) => void;
  align?: "left" | "right" | "center";
  className?: string;
  children: ReactNode;
}

export function SortableHeader<TKey extends string>({
  sortKey,
  state,
  onSort,
  align = "left",
  className = "",
  children,
}: SortableHeaderProps<TKey>) {
  const active = state.by === sortKey;
  const Icon = !active ? ArrowUpDown : state.order === "desc" ? ArrowDown : ArrowUp;
  const justify =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  const ariaSort: "ascending" | "descending" | "none" = active
    ? state.order === "asc"
      ? "ascending"
      : "descending"
    : "none";
  return (
    <th className={className} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex items-center gap-1 ${justify} w-full font-inherit text-inherit hover:text-slate-900 ${
          align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
        }`}
        data-testid={`sort-${sortKey}`}
      >
        <span>{children}</span>
        <span className="sr-only">
          {active
            ? `, sorted ${state.order === "asc" ? "ascending" : "descending"}`
            : ", not sorted"}
        </span>
        <Icon
          aria-hidden="true"
          className={`size-3 ${active ? "text-[#1A3C5E]" : "text-slate-400 opacity-0 group-hover:opacity-100"}`}
        />
      </button>
    </th>
  );
}
