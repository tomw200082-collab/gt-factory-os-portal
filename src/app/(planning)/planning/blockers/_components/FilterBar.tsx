"use client";

// ---------------------------------------------------------------------------
// FilterBar — severity multi-select + category multi-select + name search.
//
// Source filter is intentionally hidden in v1: the only active source is
// 'planning_exception'; the field exists in the DTO so future iterations can
// reveal it without a portal redeploy. (See contract pack §6 + Tom 2026-04-27.)
// ---------------------------------------------------------------------------

import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  BLOCKER_CATEGORY_VALUES,
  BLOCKER_SEVERITY_VALUES,
  type BlockerCategory,
  type BlockerSeverity,
} from "../_lib/types";
import {
  BLOCKER_CATEGORY_HE,
  SEVERITY_LABEL_HE,
  SEVERITY_TONE,
} from "../_lib/labelMaps";

interface FilterBarProps {
  severity: BlockerSeverity[];
  category: BlockerCategory[];
  itemSearch: string;
  onSeverityChange: (next: BlockerSeverity[]) => void;
  onCategoryChange: (next: BlockerCategory[]) => void;
  onItemSearchChange: (next: string) => void;
  onClearAll: () => void;
}

const TONE_CLASSES_ACTIVE: Record<"danger" | "warning" | "info", string> = {
  danger: "border-danger/60 bg-danger-soft text-danger-fg",
  warning: "border-warning/60 bg-warning-soft text-warning-fg",
  info: "border-info/60 bg-info-soft text-info-fg",
};

export function FilterBar({
  severity,
  category,
  itemSearch,
  onSeverityChange,
  onCategoryChange,
  onItemSearchChange,
  onClearAll,
}: FilterBarProps) {
  const toggleSeverity = (s: BlockerSeverity) => {
    onSeverityChange(
      severity.includes(s) ? severity.filter((x) => x !== s) : [...severity, s],
    );
  };
  const toggleCategory = (c: BlockerCategory) => {
    onCategoryChange(
      category.includes(c) ? category.filter((x) => x !== c) : [...category, c],
    );
  };

  const hasActiveFilters =
    severity.length > 0 || category.length > 0 || itemSearch.trim() !== "";

  return (
    <div className="card p-4 space-y-4" dir="rtl">
      {/* Severity */}
      <div>
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-2">
          חומרה
        </div>
        <div className="flex flex-wrap gap-2">
          {BLOCKER_SEVERITY_VALUES.map((s) => {
            const active = severity.includes(s);
            const tone = SEVERITY_TONE[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSeverity(s)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? TONE_CLASSES_ACTIVE[tone]
                    : "border-border bg-bg text-fg-muted hover:text-fg hover:border-border-strong",
                )}
                data-testid={`blockers-filter-severity-${s}`}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    tone === "danger" && "bg-danger",
                    tone === "warning" && "bg-warning",
                    tone === "info" && "bg-info",
                  )}
                  aria-hidden
                />
                {SEVERITY_LABEL_HE[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Category */}
      <div>
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-2">
          סוג חסם
        </div>
        <div className="flex flex-wrap gap-2">
          {BLOCKER_CATEGORY_VALUES.map((c) => {
            const active = category.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCategory(c)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-accent/60 bg-accent-soft text-accent-fg"
                    : "border-border bg-bg text-fg-muted hover:text-fg hover:border-border-strong",
                )}
                data-testid={`blockers-filter-category-${c}`}
              >
                {BLOCKER_CATEGORY_HE[c]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Item / product search */}
      <div>
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle mb-2">
          חיפוש פריט / רכיב
        </div>
        <div className="relative">
          <Search
            className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint"
            strokeWidth={1.75}
            aria-hidden
          />
          <input
            type="text"
            value={itemSearch}
            onChange={(e) => onItemSearchChange(e.target.value)}
            placeholder="הקלד שם פריט או חומר גלם…"
            className="w-full rounded border border-border bg-bg-raised py-1.5 pe-8 ps-3 text-sm placeholder:text-fg-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            data-testid="blockers-filter-item-search"
          />
        </div>
      </div>

      {/* Clear all */}
      {hasActiveFilters ? (
        <div className="flex justify-start">
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
            data-testid="blockers-filter-clear"
          >
            <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            נקה סינונים
          </button>
        </div>
      ) : null}
    </div>
  );
}
