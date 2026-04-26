"use client";

// ---------------------------------------------------------------------------
// HeroBar — 4 KPI tiles atop the Inventory Flow page.
//
// (1) At-risk count       — red number when > 0
// (2) Earliest stockout   — relative-day phrase ("in 4 days") + item name
// (3) Open orders 14d     — informational
// (4) Exceptions count    — warning tone when > 0
//
// Generous whitespace + tabular numerics. Inverted hierarchy applies: only
// "at-risk" > 0 number gets danger color; the others stay neutral.
// ---------------------------------------------------------------------------

import { cn } from "@/lib/cn";
import { fmtDaysFromNow } from "../_lib/format";
import type { FlowSummary } from "../_lib/types";

interface HeroBarProps {
  summary: FlowSummary | null;
  isLoading: boolean;
}

export function HeroBar({ summary, isLoading }: HeroBarProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="At risk"
        sub="products at risk"
        value={summary?.at_risk_count ?? null}
        valueTone={summary && summary.at_risk_count > 0 ? "danger" : "neutral"}
        isLoading={isLoading}
      />
      <Tile
        label="Earliest stockout"
        sub={summary?.earliest_stockout?.item_name ?? "no projected stockout"}
        valueText={
          summary?.earliest_stockout
            ? fmtDaysFromNow(summary.earliest_stockout.date)
            : "—"
        }
        valueTone={summary?.earliest_stockout ? "danger" : "neutral"}
        isLoading={isLoading}
      />
      <Tile
        label="Open orders (14d)"
        sub="LionWheel open orders"
        value={summary?.open_orders_count ?? null}
        valueTone="neutral"
        isLoading={isLoading}
      />
      <Tile
        label="Exceptions"
        sub="data quality issues"
        value={summary?.exceptions_count ?? null}
        valueTone={summary && summary.exceptions_count > 0 ? "warning" : "neutral"}
        isLoading={isLoading}
      />
    </div>
  );
}

interface TileProps {
  label: string;
  sub: string;
  value?: number | null;
  valueText?: string;
  valueTone: "neutral" | "warning" | "danger";
  isLoading: boolean;
}

function Tile({ label, sub, value, valueText, valueTone, isLoading }: TileProps) {
  const toneClass =
    valueTone === "danger"
      ? "text-danger-fg"
      : valueTone === "warning"
        ? "text-warning-fg"
        : "text-fg-strong";

  return (
    <div className="rounded-md border border-border/40 bg-bg-raised px-5 py-4">
      <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </div>
      <div className="mt-2">
        {isLoading ? (
          <div className="h-8 w-20 animate-pulse rounded bg-bg-muted/60" />
        ) : (
          <div
            className={cn(
              "text-3xl font-semibold tracking-tight tabular-nums",
              toneClass,
            )}
          >
            {valueText !== undefined ? valueText : value != null ? value : "—"}
          </div>
        )}
      </div>
      <div className="mt-1.5 text-xs text-fg-muted">{sub}</div>
    </div>
  );
}
