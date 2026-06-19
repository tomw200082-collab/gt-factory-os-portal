// Pure, deterministic visibility helpers for the Inventory Flow grid.
// No React, no backend. Unit-tested in visibility.test.ts.

export function selectVisible<T extends { item_id: string }>(
  items: T[],
  hiddenIds: Set<string>,
): T[] {
  if (hiddenIds.size === 0) return items;
  return items.filter((it) => !hiddenIds.has(it.item_id));
}

export type EmptyStateKind = "all-hidden" | "no-match" | null;

/**
 * Distinguish "no rows because the operator hid them all" (recoverable via
 * Show all) from "no rows because the filter matched nothing".
 *   visibleCount  — rows after hidden-set removal
 *   filteredCount — rows after risk/family/search filters, before hiding
 */
export function emptyStateKind(
  visibleCount: number,
  filteredCount: number,
): EmptyStateKind {
  if (visibleCount > 0) return null;
  if (filteredCount > 0) return "all-hidden";
  return "no-match";
}
