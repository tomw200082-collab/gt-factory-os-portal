"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SourceKind } from "../_types";

const SOURCE_OPTIONS: { value: SourceKind; label: string }[] = [
  { value: "form_submission",        label: "Forms" },
  { value: "credit_decision",        label: "Credit decisions" },
  { value: "exception_acknowledge",  label: "Inbox acknowledged" },
  { value: "exception_resolve",      label: "Inbox resolved" },
];

export type RangeKey = "today" | "week" | "30d";

const QUICK_RANGES: { value: RangeKey; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week",  label: "This week" },
  { value: "30d",   label: "Last 30 days" },
];

export interface FilterValue {
  sourceKinds: SourceKind[];
  range: RangeKey | null;
  from: string | null;
  to: string | null;
  searchTerm: string;
}

function rangeFrom(key: RangeKey): string {
  const to = new Date();
  const from = new Date(to);
  if (key === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (key === "week") {
    from.setDate(to.getDate() - 7);
  } else {
    from.setDate(to.getDate() - 30);
  }
  return from.toISOString();
}

export function FilterBar({
  value,
  onChange,
}: {
  value: FilterValue;
  onChange: (next: FilterValue) => void;
}) {
  const searchId = useId();
  const [draftSearch, setDraftSearch] = useState(value.searchTerm);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local input in sync when URL changes externally (back/forward, Clear filters).
  useEffect(() => {
    setDraftSearch(value.searchTerm);
  }, [value.searchTerm]);

  // Debounce URL writes so each keystroke does not push a history entry.
  useEffect(() => {
    if (draftSearch === value.searchTerm) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...value, searchTerm: draftSearch });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draftSearch, value, onChange]);

  const toggleSource = (k: SourceKind) => {
    const set = new Set(value.sourceKinds);
    if (set.has(k)) set.delete(k); else set.add(k);
    onChange({ ...value, sourceKinds: Array.from(set) });
  };

  const applyRange = (key: RangeKey) => {
    if (value.range === key) {
      // Toggle off — clear the range.
      onChange({ ...value, range: null, from: null, to: null });
      return;
    }
    onChange({ ...value, range: key, from: rangeFrom(key), to: null });
  };

  const hasActiveFilters =
    value.sourceKinds.length > 0 || value.range !== null || !!value.from || !!value.to;

  return (
    <div className="space-y-3 border-b border-border/60 px-5 py-3">
      <div className="relative max-w-md">
        <label htmlFor={searchId} className="sr-only">
          Search activity
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
          strokeWidth={2}
        />
        <input
          id={searchId}
          type="search"
          value={draftSearch}
          onChange={(e) => setDraftSearch(e.target.value)}
          placeholder="Search loaded activity"
          className={cn(
            "w-full rounded-md border border-border bg-bg-base py-1.5 pl-8 pr-8 text-sm",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          )}
        />
        {draftSearch ? (
          <button
            type="button"
            onClick={() => setDraftSearch("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1 text-fg-muted hover:bg-bg-subtle hover:text-fg"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {SOURCE_OPTIONS.map((opt) => {
          const active = value.sourceKinds.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => toggleSource(opt.value)}
              className={cn(
                "rounded-full border px-3 py-1 transition-colors",
                active
                  ? "border-accent-border bg-accent-softer text-accent-fg"
                  : "border-border text-fg-muted hover:border-fg-muted hover:text-fg"
              )}
            >
              {opt.label}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {QUICK_RANGES.map((r) => {
          const active = value.range === r.value;
          return (
            <button
              key={r.value}
              type="button"
              aria-pressed={active}
              onClick={() => applyRange(r.value)}
              className={cn(
                "rounded-full border px-3 py-1 transition-colors",
                active
                  ? "border-accent-border bg-accent-softer text-accent-fg"
                  : "border-border text-fg-muted hover:border-fg-muted hover:text-fg"
              )}
            >
              {r.label}
            </button>
          );
        })}
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                sourceKinds: [],
                range: null,
                from: null,
                to: null,
                searchTerm: value.searchTerm,
              })
            }
            className="ml-2 text-fg-muted underline underline-offset-2 hover:text-fg hover:no-underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
