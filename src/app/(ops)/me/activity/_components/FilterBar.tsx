"use client";
import { cn } from "@/lib/cn";
import type { SourceKind } from "../_types";

const SOURCE_OPTIONS: { value: SourceKind; label: string }[] = [
  { value: "form_submission",        label: "Forms" },
  { value: "credit_decision",        label: "Credit decisions" },
  { value: "exception_acknowledge",  label: "Inbox acknowledged" },
  { value: "exception_resolve",      label: "Inbox resolved" },
];

const QUICK_RANGES = [
  { value: "today",  label: "Today",     hours: 24 * 0 },
  { value: "week",   label: "This week", days: 7 },
  { value: "30d",    label: "Last 30 d", days: 30 },
];

export interface FilterValue {
  sourceKinds: SourceKind[];
  from: string | null;
  to: string | null;
  searchTerm: string;
}

export function FilterBar({
  value,
  onChange,
}: {
  value: FilterValue;
  onChange: (next: FilterValue) => void;
}) {
  const toggleSource = (k: SourceKind) => {
    const set = new Set(value.sourceKinds);
    if (set.has(k)) set.delete(k); else set.add(k);
    onChange({ ...value, sourceKinds: Array.from(set) });
  };

  const hasActiveFilters = value.sourceKinds.length > 0 || !!value.from || !!value.to;

  return (
    <div className="border-b border-border/60 px-5 py-3 space-y-3">
      <input
        type="search"
        value={value.searchTerm}
        onChange={(e) => onChange({ ...value, searchTerm: e.target.value })}
        placeholder="Search activity (current page)"
        className="w-full max-w-md rounded-md border border-border bg-bg-base px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      />
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
                "rounded-full border px-3 py-1",
                active
                  ? "border-accent bg-accent-softer text-accent-fg"
                  : "border-border text-fg-muted hover:border-fg-muted"
              )}
            >
              {opt.label}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-border" />
        {QUICK_RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => {
              const to = new Date();
              const from = new Date(to);
              if (r.value === "today") {
                from.setHours(0, 0, 0, 0);
              } else {
                from.setDate(to.getDate() - (r as { days: number }).days);
              }
              onChange({ ...value, from: from.toISOString(), to: null });
            }}
            className="rounded-full border border-border px-3 py-1 text-fg-muted hover:border-fg-muted"
          >
            {r.label}
          </button>
        ))}
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() => onChange({ sourceKinds: [], from: null, to: null, searchTerm: value.searchTerm })}
            className="ml-2 text-fg-muted underline hover:no-underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
