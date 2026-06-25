"use client";

// ---------------------------------------------------------------------------
// Forecast version detail — Item autocomplete adder (edit-chrome polish
// 2026-05-05).
//
// Owner: W2 Mode B-ForecastMonthly-Redesign (Wave 2 chunks 4 + 5, plan
// §Task 4.1.2).
//
// Purpose:
//   Type-ahead input that lets the planner add an eligible FG item to the
//   sparse forecast grid. Filters BOUGHT_FINISHED / MANUFACTURED / REPACK
//   ACTIVE items, excluding items already added.
//
// Sources consulted (2026-05-05 polish):
//   - Linear command-bar pattern: empty-state surfaces recent / suggested
//     items so the box is useful before the user types.
//   - Refactoring UI: every dropdown row deserves visual hierarchy — name
//     primary, supply method as a small chip, ID as the smallest line.
//
// Behavior:
//   - Empty input + open  → "Recent" (localStorage, last 5 added) +
//                            "Suggested" (alpha-first slice of remaining)
//   - Type to filter (case-insensitive on item_name + item_id substring)
//   - ↓/↑ arrow keys move highlight; Enter adds; Esc closes panel
//   - Click outside closes the dropdown
//   - On select → onAdd(item_id), input clears, focus stays on input
//   - "Add by family" link below the input opens a popover listing all
//     known families (with counts of remaining items); single click adds
//     every item in that family to the forecast at once
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ChevronDown,
  Clock,
  Layers,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";

export interface ItemForAutocomplete {
  item_id: string;
  item_name: string;
  status: string;
  supply_method: string;
  sales_uom?: string | null;
  /** Optional family field — surfaced as a chip when present. */
  family?: string | null;
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

const RECENT_KEY = "fc-recent-items-v1";
const RECENT_LIMIT = 5;
const SUGGESTED_LIMIT = 4;
const MAX_VISIBLE_ROWS = 8;

function readRecentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function pushRecentId(itemId: string) {
  if (typeof window === "undefined") return;
  try {
    const cur = readRecentIds();
    const next = [itemId, ...cur.filter((id) => id !== itemId)].slice(0, 12);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function methodChip(method: string): "BUY" | "MAKE" | "" {
  if (method === "BOUGHT_FINISHED") return "BUY";
  if (method === "MANUFACTURED" || method === "REPACK") return "MAKE";
  return "";
}

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
  const [familyOpen, setFamilyOpen] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const familyContainerRef = useRef<HTMLDivElement | null>(null);

  // Hydrate localStorage recents on mount.
  useEffect(() => {
    setRecentIds(readRecentIds());
  }, []);

  const setInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      inputRef.current = el;
      inputRefCallback?.(el);
    },
    [inputRefCallback],
  );

  const itemsById = useMemo(() => {
    const m = new Map<string, ItemForAutocomplete>();
    for (const it of eligibleItems) m.set(it.item_id, it);
    return m;
  }, [eligibleItems]);

  // Filtered + sorted candidates (typed query).
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return [] as ItemForAutocomplete[];
    const pool = eligibleItems
      .filter((r) => !alreadyAddedItemIds.has(r.item_id))
      .filter(
        (r) =>
          r.item_name.toLowerCase().includes(q) ||
          r.item_id.toLowerCase().includes(q),
      );
    pool.sort((a, b) => a.item_name.localeCompare(b.item_name));
    return pool;
  }, [eligibleItems, alreadyAddedItemIds, query]);

  // Recent items list (filtered to what's still addable).
  const recentItems = useMemo(() => {
    return recentIds
      .map((id) => itemsById.get(id))
      .filter(
        (x): x is ItemForAutocomplete =>
          !!x && !alreadyAddedItemIds.has(x.item_id),
      )
      .slice(0, RECENT_LIMIT);
  }, [recentIds, itemsById, alreadyAddedItemIds]);

  // Suggested items: alpha-first slice of remaining items (excluding recents).
  const suggestedItems = useMemo(() => {
    const recentSet = new Set(recentItems.map((x) => x.item_id));
    return eligibleItems
      .filter(
        (r) => !alreadyAddedItemIds.has(r.item_id) && !recentSet.has(r.item_id),
      )
      .slice()
      .sort((a, b) => a.item_name.localeCompare(b.item_name))
      .slice(0, SUGGESTED_LIMIT);
  }, [eligibleItems, alreadyAddedItemIds, recentItems]);

  // Empty-input combined list (recents first, then suggested) — used so the
  // keyboard navigation works against a unified array.
  const emptyStateItems = useMemo(() => {
    return [...recentItems, ...suggestedItems];
  }, [recentItems, suggestedItems]);

  // The active list keyboard nav targets.
  const activeList = query.trim() === "" ? emptyStateItems : candidates;

  // Reset highlight whenever the active list changes.
  useEffect(() => {
    setHighlight(0);
  }, [query, activeList.length]);

  // Outside-click closes the panel.
  useEffect(() => {
    if (!open && !familyOpen) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
      }
      if (
        familyContainerRef.current &&
        !familyContainerRef.current.contains(target)
      ) {
        setFamilyOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, familyOpen]);

  function commitAdd(itemId: string) {
    onAdd(itemId);
    pushRecentId(itemId);
    setRecentIds(readRecentIds());
    setQuery("");
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function commitAddMany(ids: string[]) {
    for (const id of ids) {
      onAdd(id);
      pushRecentId(id);
    }
    setRecentIds(readRecentIds());
    setFamilyOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, activeList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && activeList.length > 0) {
        commitAdd(activeList[highlight]!.item_id);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const remainingCount = useMemo(
    () =>
      eligibleItems.filter((r) => !alreadyAddedItemIds.has(r.item_id)).length,
    [eligibleItems, alreadyAddedItemIds],
  );

  // Family aggregation for the bulk-add popover.
  const families = useMemo(() => {
    const map = new Map<string, ItemForAutocomplete[]>();
    for (const it of eligibleItems) {
      if (alreadyAddedItemIds.has(it.item_id)) continue;
      const fam = (it.family ?? "").trim().toUpperCase() || "—";
      if (!map.has(fam)) map.set(fam, []);
      map.get(fam)!.push(it);
    }
    return Array.from(map.entries())
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [eligibleItems, alreadyAddedItemIds]);

  const showFamilyAdd = families.length > 1; // hide if there's no useful split

  const isQueryEmpty = query.trim() === "";

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full max-w-md", className)}
      data-testid="forecast-item-autocomplete"
    >
      <label
        htmlFor="forecast-item-autocomplete-input"
        className="mb-1.5 block text-3xs font-semibold uppercase tracking-ops text-fg-subtle"
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

      {/* Bulk-add by family affordance */}
      {showFamilyAdd ? (
        <div
          ref={familyContainerRef}
          className="relative mt-1.5"
          data-testid="forecast-bulk-add-host"
        >
          <button
            type="button"
            className="inline-flex items-center gap-1 text-3xs font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            onClick={() => setFamilyOpen((v) => !v)}
            data-testid="forecast-bulk-add-toggle"
          >
            <Layers className="h-2.5 w-2.5" strokeWidth={2} />
            Add by family
            <ChevronDown
              className={cn(
                "h-2.5 w-2.5 transition-transform duration-150",
                familyOpen && "rotate-180",
              )}
              strokeWidth={2}
            />
          </button>

          {familyOpen ? (
            <div
              className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-md border border-border/70 bg-bg-raised shadow-pop"
              role="dialog"
              data-testid="forecast-bulk-add-panel"
            >
              <div className="fc-autocomplete-section-label">
                Add all items from a family
              </div>
              <ul className="max-h-64 overflow-y-auto py-1">
                {families.map((fam) => (
                  <li key={fam.name}>
                    <button
                      type="button"
                      className="fc-autocomplete-row w-full text-left"
                      onClick={() =>
                        commitAddMany(fam.items.map((x) => x.item_id))
                      }
                      data-testid="forecast-bulk-add-family"
                      data-family={fam.name}
                    >
                      <Plus
                        className="h-3 w-3 shrink-0 text-fg-faint"
                        strokeWidth={2.5}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-fg">
                          {fam.name}
                        </div>
                      </div>
                      <span className="text-3xs tabular-nums text-fg-muted">
                        {fam.items.length} item
                        {fam.items.length === 1 ? "" : "s"}
                      </span>
                    </button>
                  </li>
                ))}
                {families.length === 0 ? (
                  <li className="px-3 py-2 text-3xs text-fg-faint">
                    No families to add.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {open && !isLoading && remainingCount > 0 ? (
        <div
          className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-border/70 bg-bg-raised shadow-pop"
          role="listbox"
        >
          {isQueryEmpty ? (
            <>
              {recentItems.length === 0 && suggestedItems.length === 0 ? (
                <div className="px-3 py-3 text-xs text-fg-muted">
                  Start typing to search the {remainingCount}{" "}
                  remaining item{remainingCount === 1 ? "" : "s"}.
                </div>
              ) : (
                <ul
                  className="max-h-72 overflow-y-auto py-0"
                  data-testid="forecast-item-autocomplete-list"
                >
                  {recentItems.length > 0 ? (
                    <>
                      <li
                        className="fc-autocomplete-section-label flex items-center gap-1"
                        aria-hidden
                      >
                        <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                        Recent
                      </li>
                      {recentItems.map((r, i) => {
                        const idx = i;
                        const active = idx === highlight;
                        return (
                          <AutocompleteRow
                            key={`recent-${r.item_id}`}
                            item={r}
                            active={active}
                            onHover={() => setHighlight(idx)}
                            onPick={() => commitAdd(r.item_id)}
                          />
                        );
                      })}
                    </>
                  ) : null}
                  {suggestedItems.length > 0 ? (
                    <>
                      <li
                        className="fc-autocomplete-section-label flex items-center gap-1"
                        aria-hidden
                      >
                        <Sparkles className="h-2.5 w-2.5" strokeWidth={2} />
                        Suggested
                      </li>
                      {suggestedItems.map((r, i) => {
                        const idx = recentItems.length + i;
                        const active = idx === highlight;
                        return (
                          <AutocompleteRow
                            key={`sugg-${r.item_id}`}
                            item={r}
                            active={active}
                            onHover={() => setHighlight(idx)}
                            onPick={() => commitAdd(r.item_id)}
                          />
                        );
                      })}
                    </>
                  ) : null}
                </ul>
              )}
            </>
          ) : candidates.length === 0 ? (
            <div className="px-3 py-3 text-xs text-fg-muted">
              No matching items.{" "}
              <span className="text-fg-faint">
                Try a different search term.
              </span>
            </div>
          ) : (
            <ul
              className="max-h-72 overflow-y-auto py-1"
              data-testid="forecast-item-autocomplete-list"
            >
              {candidates.slice(0, 200).map((r, i) => (
                <AutocompleteRow
                  key={r.item_id}
                  item={r}
                  active={i === highlight}
                  onHover={() => setHighlight(i)}
                  onPick={() => commitAdd(r.item_id)}
                />
              ))}
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

// ---------------------------------------------------------------------------
// Single autocomplete row.
// ---------------------------------------------------------------------------

interface AutocompleteRowProps {
  item: ItemForAutocomplete;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
}

function AutocompleteRow({ item, active, onHover, onPick }: AutocompleteRowProps) {
  const chip = methodChip(item.supply_method);
  return (
    <li
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
      className="fc-autocomplete-row"
      data-active={active ? "true" : "false"}
      data-testid="forecast-item-autocomplete-row"
      data-item-id={item.item_id}
    >
      <Plus
        className={cn(
          "h-3 w-3 shrink-0",
          active ? "text-accent" : "text-fg-faint",
        )}
        strokeWidth={2.5}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium leading-tight text-fg">
            {item.item_name}
          </span>
          {item.family ? (
            <span className="shrink-0 rounded border border-border/60 bg-bg-subtle/60 px-1 py-px text-[9px] font-semibold uppercase tracking-[0.05em] text-fg-muted">
              {item.family}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-fg-faint">
          {item.item_id}
        </div>
      </div>
      {chip ? (
        <span
          className="fc-autocomplete-supply-chip"
          data-method={chip}
          aria-label={chip === "BUY" ? "Bought finished" : "Manufactured"}
        >
          {chip}
        </span>
      ) : null}
    </li>
  );
}
