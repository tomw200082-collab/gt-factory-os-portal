"use client";

import type { ReactNode } from "react";
import { ChevronDown, Truck } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MaterialComponentLine } from "./types";
import {
  CoverageBadge,
  DateChip,
  coverageStrip,
  fmtQtyStr,
  isShortStatus,
} from "./shared";

// ---------------------------------------------------------------------------
// ComponentCard — the mobile (sub-`lg`) presentation of one component line.
//
// The desktop layout is a dense table; below the 1024px breakpoint a table
// would scroll horizontally, which the portal UX standard forbids on data
// surfaces. This card carries the same facts, stacked, with a coverage-tinted
// left strip so a shortage still reads at a glance.
//
// `expandable` turns the card into a disclosure button (used by the by-product
// view, where the card opens to the per-product breakdown).
// ---------------------------------------------------------------------------

function MiniStat({
  label,
  value,
  uom,
  tone,
}: {
  label: string;
  value: string;
  uom: string | null;
  tone: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-3xs font-bold uppercase tracking-sops text-fg-subtle">
        {label}
      </span>
      <span className={cn("truncate text-sm font-bold tabular-nums", tone)}>
        {value}
        {value !== "—" && uom ? (
          <span className="text-2xs font-medium text-fg-faint"> {uom}</span>
        ) : null}
      </span>
    </div>
  );
}

function CardFace({
  component,
  showSupplier,
}: {
  component: MaterialComponentLine;
  showSupplier: boolean;
}) {
  const c = component;
  const netShortage = parseFloat(c.net_shortage_qty);
  const noData = c.coverage_status === "no_stock_data";
  return (
    <div className="min-w-0 flex-1 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-fg-strong">
            <bdi>{c.component_name}</bdi>
          </div>
          <div className="truncate font-mono text-3xs text-fg-faint">
            {c.component_class ? `${c.component_class} · ` : ""}
            {c.component_id}
          </div>
        </div>
        <CoverageBadge status={c.coverage_status} />
      </div>

      {showSupplier && c.supplier_short ? (
        <div className="mt-1 flex items-center gap-1 text-2xs text-fg-faint">
          <Truck className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
          <bdi className="truncate">{c.supplier_short}</bdi>
        </div>
      ) : null}

      {/* Render the net-requirement as the literal equation the operator
          needs — Required − On hand = To order — so the suggested order
          quantity reads as an auditable subtraction, not three loose numbers. */}
      <div className="mt-2.5 flex items-stretch gap-1 rounded-md border border-border/50 bg-bg-subtle/40 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <MiniStat
            label="Required"
            value={fmtQtyStr(c.total_required_qty, c.component_uom)}
            uom={c.component_uom}
            tone="text-fg-strong"
          />
        </div>
        <span
          className="self-center px-0.5 text-sm font-bold text-fg-faint"
          aria-hidden
        >
          −
        </span>
        <div className="min-w-0 flex-1">
          <MiniStat
            label="On hand"
            value={noData ? "—" : fmtQtyStr(c.on_hand_qty, c.component_uom)}
            uom={c.component_uom}
            tone="text-fg-muted"
          />
        </div>
        <span
          className="self-center px-0.5 text-sm font-bold text-fg-faint"
          aria-hidden
        >
          =
        </span>
        <div className="min-w-0 flex-1">
          <MiniStat
            label="To order"
            value={
              netShortage > 0
                ? fmtQtyStr(c.net_shortage_qty, c.component_uom)
                : "—"
            }
            uom={c.component_uom}
            tone={netShortage > 0 ? "text-danger-fg" : "text-success-fg"}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <DateChip iso={c.first_needed_date} />
      </div>
    </div>
  );
}

export function ComponentCard({
  component,
  showSupplier = false,
  expandable = false,
  expanded = false,
  onToggle,
  detail,
}: {
  component: MaterialComponentLine;
  showSupplier?: boolean;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  detail?: ReactNode;
}) {
  const c = component;
  const short = isShortStatus(c.coverage_status);

  if (!expandable) {
    return (
      <div
        data-testid="component-card"
        className="flex overflow-hidden rounded-md border border-border/60 bg-bg-raised shadow-raised"
      >
        <span
          className={cn("w-1 shrink-0", coverageStrip(c.coverage_status))}
          aria-hidden
        />
        <CardFace component={c} showSupplier={showSupplier} />
      </div>
    );
  }

  return (
    <div
      data-testid="component-card"
      className={cn(
        "overflow-hidden rounded-md border bg-bg-raised shadow-raised",
        short ? "border-danger/30" : "border-border/60",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full text-left"
      >
        <span
          className={cn("w-1 shrink-0", coverageStrip(c.coverage_status))}
          aria-hidden
        />
        <CardFace component={c} showSupplier={showSupplier} />
        <span className="flex shrink-0 items-start p-3">
          <ChevronDown
            className={cn(
              "h-4 w-4 text-fg-muted transition-transform",
              expanded && "rotate-180",
            )}
            strokeWidth={2.5}
            aria-hidden
          />
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-border/50 bg-bg-subtle/30 p-3">
          {detail}
        </div>
      ) : null}
    </div>
  );
}
