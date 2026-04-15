"use client";

import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FilterChip {
  key: string;
  label: string;
  active: boolean;
  onToggle: () => void;
  tone?: "neutral" | "accent";
}

interface SearchFilterBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  placeholder?: string;
  chips?: FilterChip[];
  trailing?: ReactNode;
}

export function SearchFilterBar({
  query,
  onQueryChange,
  placeholder = "Search",
  chips,
  trailing,
}: SearchFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[240px] flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
          strokeWidth={2}
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="input pl-9 pr-9"
          aria-label="Search"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-fg-faint hover:bg-bg-muted hover:text-fg-muted"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {chips && chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onToggle}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150 ease-out-quart",
                c.active
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg"
              )}
            >
              {c.active ? (
                <span className="dot bg-accent" aria-hidden />
              ) : (
                <span className="dot bg-fg-faint/60" aria-hidden />
              )}
              {c.label}
            </button>
          ))}
        </div>
      ) : null}
      {trailing}
    </div>
  );
}
