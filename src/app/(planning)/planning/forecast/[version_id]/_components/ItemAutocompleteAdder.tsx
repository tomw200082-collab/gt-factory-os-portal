"use client";

// ---------------------------------------------------------------------------
// Forecast version detail — Item autocomplete adder.
//
// Owner: W2 Mode B-ForecastMonthly-Redesign (Wave 2 chunks 4 + 5, plan
// §Task 4.1.2).
//
// Purpose:
//   Type-ahead input that lets the planner add an eligible FG item to the
//   sparse forecast grid. Filters BOUGHT_FINISHED / MANUFACTURED / REPACK
//   ACTIVE items, excluding items already added.
//
// Behavior:
//   - Type to filter (case-insensitive on item_name + item_id substring)
//   - ↓/↑ arrow keys move highlight; Enter adds; Esc closes panel
//   - Click anywhere outside closes the dropdown
//   - On select → onAdd(item_id), input clears, focus stays on input so the
//     planner can add another item without clicking again
//
// Visual:
//   - Single-line input with subtle border + focus ring
//   - Dropdown floats below with up to 8 visible rows; scrollable beyond
//   - Each row: bold item_name; small mono item_id underneath
//   - Empty state in the panel: "No matching items" / "All items added"
//
// English LTR per Tom-locked global standard 2026-05-01.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ItemForAutocomplete {
  item_id: string;
  item_name: string;
  status: string;
  supply_method: string;
  sales_uom?: string | null;
}

interface ItemAutocompleteAdderProps {
  /** Full set of eligible items the planner can add (already pre-filtered). */
  eligibleItems: ItemForAutocomplete[];
  /** Items already in the forecast grid; excluded from results. */
  alreadyAddedItemIds: Set<string>;
  /** Called when the planner picks an item. */
  onAdd: (itemId: string) => void;
  /** True when items list is loading. */
  isLoading?: boolean;
  /** Optional ref the parent uses to call inputRef.current?.focus() from EmptyState CTA. */
  inputRefCallback?: (el: HTMLInputElement | null) => void;
  className?: string;
}

const MAX_VISIBLE_ROWS = 8;

export function ItemAutocompleteAdder({
  eligibleItems,
  alreadyAddedItemIds,
  onAdd,
  isLoading = false,
  inputRefCallback,
  className,
}: ItemAutocompleteAdderProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const setInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      inputRefCallback?.(el);
    },
    [inputRefCallback],
  );

  // Filtered + sorted candidates.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = eligibleItems
      .filter((r) => !alreadyAddedItemIds.has(r.item_id))
      .filter((r) => {
        if (q === "") return true;
        return (
          r.item_name.toLowerCase().includes(q) ||
          r.item_id.toLowerCase().includes(q)
        );
      });
    pool.sort((a, b) => a.item_name.localeCompare(b.item_name));
    return pool;
  }, [eligibleItems, alreadyAddedItemIds, query]);

  // Reset highlight whenever candidate list changes.
  useEffect(() => {
    setHighlight(0);
  }, [query, candidates.length]);

  // Outside-click closes the panel.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function commitAdd(itemId: string) {
    onAdd(itemId);
    setQuery("");
    setOpen(true);
    // Re-focus so planner can add another item.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, candidates.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && candidates.length > 0) {
        commitAdd(candidates[highlight]!.item_id);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const remainingCount = eligibleItems.filter(
    (r) => !alreadyAddedItemIds.has(r.item_id),
  ).length;

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full max-w-md", className)}
      data-testid="forecast-item-autocomplete"
    >
      <label
        htmlFor="forecast-item-autocomplete-input"
        className="mb-1.5 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
      >
        Add item to forecast
      </label>

      <div
        className={cn(
          "relative flex items-center gap-2 rounded-md border bg-bg-raised px-2.5 py-1.5 transition-colors duration-150",
          open
            ? "border-accent/60 ring-2 ring-accent-soft/40"
            : "border-border/70 hover:border-border-strong",
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-fg-faint" strokeWidth={2} />
        <input
          ref={setInputRef}
          id="forecast-item-autocomplete-input"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            isLoading
              ? "Loading items…"
              : remainingCount === 0
                ? "All items already added"
                : "Type to search items by name or ID…"
          }
          disabled={isLoading || remainingCount === 0}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint disabled:opacity-50"
          autoComplete="off"
          spellCheck={false}
          data-testid="forecast-item-autocomplete-input"
        />
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-fg-faint transition-transform duration-150",
            open && "rotate-180",
          )}
          strokeWidth={2}
        />
      </div>

      {open && !isLoading && remainingCount > 0 ? (
        <div
          className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-border/70 bg-bg-raised shadow-pop"
          role="listbox"
        >
          {candidates.length === 0 ? (
            <div className="px-3 py-3 text-xs text-fg-muted">
              No matching items.{" "}
              <span className="text-fg-faint">
                Try a different search term.
              </span>
            </div>
          ) : (
            <ul
              ref={listRef}
              className="max-h-72 overflow-y-auto py-1"
              data-testid="forecast-item-autocomplete-list"
            >
              {candidates.slice(0, 200).map((r, i) => {
                const active = i === highlight;
                return (
                  <li
                    key={r.item_id}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      // Use mousedown so blur doesn't close before click fires.
                      e.preventDefault();
                      commitAdd(r.item_id);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors duration-100",
                      active
                        ? "bg-accent-soft/60 text-fg-strong"
                        : "text-fg hover:bg-bg-subtle/60",
                    )}
                    data-testid="forecast-item-autocomplete-row"
                    data-item-id={r.item_id}
                  >
                    <Plus
                      className={cn(
                        "h-3 w-3 shrink-0",
                        active ? "text-accent" : "text-fg-faint",
                      )}
                      strokeWidth={2.5}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium leading-tight">
                        {r.item_name}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-3xs text-fg-faint">
                        {r.item_id}
                        <span className="ml-2 text-fg-faint/70">
                          {r.supply_method === "BOUGHT_FINISHED"
                            ? "Buy"
                            : r.supply_method === "MANUFACTURED" ||
                                r.supply_method === "REPACK"
                              ? "Make"
                              : r.supply_method}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
              {candidates.length > MAX_VISIBLE_ROWS ? (
                <li className="px-3 py-1.5 text-3xs text-fg-faint">
                  Showing {Math.min(candidates.length, 200)} of{" "}
                  {candidates.length} matches.
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
