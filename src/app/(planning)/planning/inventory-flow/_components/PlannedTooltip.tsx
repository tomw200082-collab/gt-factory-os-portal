"use client";

// ---------------------------------------------------------------------------
// PlannedTooltip — content section for the day-cell popover that breaks
// down planned vs completed vs cancelled vs remaining + a freshness badge
// for the latest plan creation timestamp.
//
// Contract authority:
//   docs/integrations/inventory_flow_planned_inflow_overlay_contract.md
//   §5.1 (tooltip "Planned production" section), §7.3 (header MUST contain
//   the negative phrasing "not yet posted").
//
// Tom-locked dispatch invariants (see active_mode.json):
//   - Localization register = English/LTR (no Hebrew on this surface).
//   - Negative-phrasing header text:
//     "Planned production · not yet posted to stock"
//
// Renders inside the existing DayPopover; no Radix surface is created here.
// ---------------------------------------------------------------------------

import { fmtAgo, fmtQty } from "../_lib/format";
import type { PlannedInflowRow } from "../_lib/plannedInflow";

interface PlannedTooltipProps {
  /** Aggregated row for this (item_id, plan_date). */
  row: PlannedInflowRow;
}

export function PlannedTooltip({ row }: PlannedTooltipProps) {
  const uom = row.sales_uom ? ` ${row.sales_uom}` : "";
  return (
    <div
      className="mt-3 border-t border-border/40 pt-2"
      data-testid="planned-tooltip-section"
    >
      {/* §7.3 — header MUST contain the negative phrasing "not yet posted". */}
      <div className="text-3xs font-semibold uppercase tracking-sops text-info-fg">
        Planned production · not yet posted to stock
      </div>

      <dl className="mt-1.5 space-y-1">
        <Row
          label="Planned (remaining)"
          value={`+${fmtQty(row.planned_remaining_qty)}${uom}`}
          tone="info"
        />
        {row.completed_qty_total > 0 ? (
          <Row
            label="Already reported"
            value={`${fmtQty(row.completed_qty_total)}${uom}`}
            tone="muted"
          />
        ) : null}
        {row.cancelled_qty_total > 0 ? (
          <Row
            label="Cancelled"
            value={`${fmtQty(row.cancelled_qty_total)}${uom}`}
            tone="muted"
          />
        ) : null}
      </dl>

      {/* Plan-count footer aggregates per contract §5.1. */}
      <p className="mt-1.5 text-3xs text-fg-muted">
        {row.plan_count_remaining} pending plan
        {row.plan_count_remaining === 1 ? "" : "s"}
        {row.plan_count_completed > 0 ? (
          <> · {row.plan_count_completed} done</>
        ) : null}
        {row.plan_count_cancelled > 0 ? (
          <> · {row.plan_count_cancelled} cancelled</>
        ) : null}
      </p>

      {/* Freshness badge — last plan added at. */}
      {row.latest_created_at ? (
        <p className="mt-1 text-3xs text-fg-faint">
          Latest plan added {fmtAgo(row.latest_created_at)}
        </p>
      ) : null}
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
  tone: "info" | "muted";
}

function Row({ label, value, tone }: RowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-3xs text-fg-muted">{label}</dt>
      <dd
        className={
          tone === "info"
            ? "text-xs font-semibold tabular-nums text-info-fg"
            : "text-xs tabular-nums text-fg-muted"
        }
      >
        {value}
      </dd>
    </div>
  );
}
