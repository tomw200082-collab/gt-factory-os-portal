"use client";

// ---------------------------------------------------------------------------
// PlannedTooltipSection — the "Planned production · not yet posted" block
// that lives inside a DayPopover when the (item, day) has planned activity.
//
// Visual contract (inventory_flow_planned_inflow_overlay_contract.md §5.1
// + §7.3): renders below the truth metrics, separated by a divider, with
// the literal phrase "not yet posted" in the section header per §7.3.
//
// Tooltip body (§5.1):
//   Header  : "Planned production · not yet posted"
//   Counts  : "{plan_count_remaining} plans · {planned_remaining} units total
//             · {completed_qty_total} units already reported · ..."
//   Footer  : freshness ("latest plan added Xh ago")
// ---------------------------------------------------------------------------

import { memo } from "react";
import { cn } from "@/lib/cn";
import { fmtAgo, fmtQty } from "../_lib/format";
import type { PlannedInflowRow } from "../_lib/plannedInflow";

interface PlannedTooltipSectionProps {
  row: PlannedInflowRow;
  className?: string;
}

function PlannedTooltipSectionInner({ row, className }: PlannedTooltipSectionProps) {
  // Empty guard mirrors the chip — contract §6.1.
  if (row.planned_remaining_qty <= 0) return null;

  return (
    <div
      className={cn(
        "mt-3 rounded-sm border border-dashed border-info/40 bg-info-softer/40 p-2",
        className,
      )}
    >
      <div className="text-3xs font-semibold uppercase tracking-sops text-info-fg">
        Planned production · not yet posted
      </div>
      <dl className="mt-1.5 space-y-1">
        <Row
          label="Planned remaining"
          value={fmtQty(row.planned_remaining_qty)}
          emphasize
        />
        <Row label="Plans (open)" value={String(row.plan_count_remaining)} />
        {row.completed_qty_total > 0 ? (
          <Row
            label="Already reported"
            value={fmtQty(row.completed_qty_total)}
          />
        ) : null}
      </dl>
      <p className="mt-2 text-[10px] leading-snug text-fg-muted">
        Planned production is not inventory. Inventory changes only after actual
        production is reported.
      </p>
      <p className="mt-1 text-[10px] text-fg-faint">
        Latest plan added {fmtAgo(row.latest_created_at)}.
      </p>
    </div>
  );
}

export const PlannedTooltipSection = memo(PlannedTooltipSectionInner);

interface RowProps {
  label: string;
  value: string;
  emphasize?: boolean;
}

function Row({ label, value, emphasize }: RowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-3xs text-fg-muted">{label}</dt>
      <dd
        className={cn(
          "text-xs tabular-nums",
          emphasize ? "font-semibold text-info-fg" : "text-fg-strong",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
