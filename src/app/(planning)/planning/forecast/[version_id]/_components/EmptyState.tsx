"use client";

// ---------------------------------------------------------------------------
// Forecast version detail — empty state.
//
// Owner: W2 Mode B-ForecastMonthly-Redesign (Wave 2 chunks 4 + 5,
// plan §Task 4.1.6).
//
// Visual: stunning soft gradient ring around a 64px lucide TrendingUp icon,
// two-line headline, subtle background, single primary CTA "+ Add first item"
// that focuses the autocomplete input on the parent page.
//
// English LTR per Tom-locked global standard 2026-05-01 (no Hebrew on this
// surface; the forecast page is operator + planner facing and Tom approved
// English LTR for this redesign per Wave 2 dispatch).
// ---------------------------------------------------------------------------

import { Plus, TrendingUp } from "lucide-react";

interface ForecastEmptyStateProps {
  onAddFirstItem: () => void;
}

export function ForecastEmptyState({ onAddFirstItem }: ForecastEmptyStateProps) {
  return (
    <div
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-border/60 bg-gradient-to-b from-bg-raised to-bg/40 px-6 py-16 text-center"
      data-testid="forecast-empty-state"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade opacity-40"
        aria-hidden
      />

      {/* Soft gradient ring around the icon — the "stunning" element. */}
      <div className="relative mb-5">
        <div
          className="absolute -inset-4 rounded-full bg-gradient-to-br from-accent-soft/60 via-info-softer/40 to-success-softer/30 blur-xl"
          aria-hidden
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-border/70 bg-bg-raised shadow-raised">
          <TrendingUp className="h-8 w-8 text-accent" strokeWidth={1.75} />
        </div>
      </div>

      <h3 className="relative mb-1 text-lg font-semibold tracking-tight text-fg-strong">
        No items in forecast yet
      </h3>

      <p className="relative mx-auto mb-6 max-w-sm text-sm leading-relaxed text-fg-muted">
        Add items you want to forecast demand for. Only items you add will be
        planned for. Items not in the forecast will rely solely on open orders.
      </p>

      <button
        type="button"
        onClick={onAddFirstItem}
        className="btn btn-primary btn-sm relative gap-1.5"
        data-testid="forecast-empty-add-first"
      >
        <Plus className="h-3 w-3" strokeWidth={2.5} />
        Add first item
      </button>
    </div>
  );
}
