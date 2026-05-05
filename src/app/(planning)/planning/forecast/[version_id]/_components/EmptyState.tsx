"use client";

// ---------------------------------------------------------------------------
// Forecast version detail — empty state.
//
// "Operational Clarity" v3 — GRID PASS (2026-05-05). Refined per Tom mandate:
// lean on typography + 1 Lucide icon, drop stock-illustration imagery, use
// the `cta-arrow-host` micro-motion for the primary CTA so it feels alive on
// hover. Centered card, soft accent ring around the icon, two-line copy.
//
// Sources consulted: Refactoring UI on empty states ("teach what to do, then
// give one clear next step"); LogRocket data-table empty-state pattern
// ("show the action, not a generic illustration").
//
// English LTR per Tom-locked global standard 2026-05-01.
// ---------------------------------------------------------------------------

import { ArrowRight, BarChart3 } from "lucide-react";

interface ForecastEmptyStateProps {
  onAddFirstItem: () => void;
}

export function ForecastEmptyState({ onAddFirstItem }: ForecastEmptyStateProps) {
  return (
    <div
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-border/60 bg-gradient-to-b from-bg-raised to-bg/40 px-6 py-14 text-center"
      data-testid="forecast-empty-state"
    >
      {/* Subtle grid texture behind the card — same treatment as elsewhere. */}
      <div
        className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade opacity-30"
        aria-hidden
      />

      {/* Soft gradient ring around the icon — anchors the eye without
          dominating the card. */}
      <div className="relative mb-5">
        <div
          className="absolute -inset-3 rounded-full bg-gradient-to-br from-accent-soft/55 via-info-softer/35 to-success-softer/25 blur-lg"
          aria-hidden
        />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-bg-raised shadow-raised">
          <BarChart3
            className="h-6 w-6 text-accent"
            strokeWidth={1.75}
            aria-hidden
          />
        </div>
      </div>

      <h3 className="relative mb-1 text-base font-semibold tracking-tight text-fg-strong">
        No items in this forecast
      </h3>

      <p className="relative mx-auto mb-5 max-w-sm text-[13px] leading-relaxed text-fg-muted">
        Add an item to start entering quantities. Only items you add will be
        forecast for; the rest rely on open orders only.
      </p>

      <button
        type="button"
        onClick={onAddFirstItem}
        className="cta-arrow-host btn btn-primary btn-sm relative gap-1.5"
        data-testid="forecast-empty-add-first"
      >
        Add first item
        <ArrowRight
          className="cta-arrow h-3 w-3"
          strokeWidth={2.5}
          aria-hidden
        />
      </button>
    </div>
  );
}
