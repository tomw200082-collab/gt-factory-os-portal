"use client";

// ---------------------------------------------------------------------------
// ComponentGapBar — horizontal stacked bar showing available / needed / shortfall
// per component, rendered entirely in CSS (no charting library).
// ---------------------------------------------------------------------------

import { useState } from "react";
import { ArrowDownNarrowWide, ArrowUpAZ } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatQty } from "@/lib/utils/format-quantity";
import type { SimulationLine } from "./SimulationTable";

interface ComponentGapBarProps {
  lines: SimulationLine[];
  /** Show delta vs a previous simulation run. */
  previousLines?: SimulationLine[];
}

type CoverageStatus = "covered" | "partial" | "not_covered" | "no_stock_data";

function rowTone(status: CoverageStatus): { row: string; bar: string; badge: string } {
  switch (status) {
    case "covered":
      return {
        row: "hover:bg-success-softer/10",
        bar: "bg-success",
        badge: "bg-success-softer text-success-fg border-success/30",
      };
    case "partial":
      return {
        row: "hover:bg-warning-softer/20 bg-warning-softer/10",
        bar: "bg-warning",
        badge: "bg-warning-softer text-warning-fg border-warning/30",
      };
    case "not_covered":
      return {
        row: "bg-danger-softer/10 hover:bg-danger-softer/20",
        bar: "bg-danger",
        badge: "bg-danger-softer text-danger-fg border-danger/30",
      };
    default:
      return {
        row: "hover:bg-bg-subtle/60",
        bar: "bg-fg-faint",
        badge: "bg-bg-muted text-fg-muted border-border/70",
      };
  }
}

type SortMode = "shortage" | "alpha";

const STATUS_ORDER: Record<string, number> = {
  not_covered: 0,
  partial: 1,
  covered: 2,
  no_stock_data: 3,
};

export function ComponentGapBar({ lines, previousLines }: ComponentGapBarProps) {
  const [sortMode, setSortMode] = useState<SortMode>("shortage");

  const prevMap = new Map<string, SimulationLine>();
  if (previousLines) {
    for (const l of previousLines) prevMap.set(l.componentId, l);
  }

  // Only show lines that have coverage data OR have a required qty.
  const visible = lines.filter(
    (l) => l.coverage !== null || l.requiredQty > 0,
  );

  const sorted = [...visible].sort((a, b) => {
    if (sortMode === "alpha") {
      return a.componentName.localeCompare(b.componentName);
    }
    // shortage-first: sort by status order, then by shortage qty descending, then alpha
    const aStatus = a.coverage?.status ?? "no_stock_data";
    const bStatus = b.coverage?.status ?? "no_stock_data";
    const statusDiff = (STATUS_ORDER[aStatus] ?? 3) - (STATUS_ORDER[bStatus] ?? 3);
    if (statusDiff !== 0) return statusDiff;
    const aShortage = a.coverage?.netShortageQty ?? 0;
    const bShortage = b.coverage?.netShortageQty ?? 0;
    if (bShortage !== aShortage) return bShortage - aShortage;
    return a.componentName.localeCompare(b.componentName);
  });

  if (visible.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-fg-muted">
        No component data to display.
      </div>
    );
  }

  return (
    <div>
      {/* Sort toggle */}
      <div className="flex items-center justify-end gap-2 border-b border-border/40 px-4 py-2">
        <button
          type="button"
          onClick={() => setSortMode((m) => (m === "shortage" ? "alpha" : "shortage"))}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-3xs font-semibold transition-colors",
            "border-border/60 bg-bg-raised text-fg-muted hover:border-accent/40 hover:text-fg",
          )}
          title={sortMode === "shortage" ? "Switch to alphabetical sort" : "Switch to shortage-first sort"}
        >
          {sortMode === "shortage" ? (
            <>
              <ArrowDownNarrowWide className="h-3 w-3" strokeWidth={2} />
              Sort: Shortage ↓
            </>
          ) : (
            <>
              <ArrowUpAZ className="h-3 w-3" strokeWidth={2} />
              Sort: A → Z
            </>
          )}
        </button>
      </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-bg-subtle/60 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            <th className="px-4 py-2 text-left">Component</th>
            <th className="px-4 py-2 text-right w-24">Required</th>
            <th className="px-4 py-2 text-right w-24">On hand</th>
            <th className="px-4 py-2 min-w-[160px]">Coverage bar</th>
            <th className="px-4 py-2 text-right w-24">Gap</th>
            {prevMap.size > 0 && (
              <th className="px-4 py-2 text-right w-28">Delta vs prev</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {sorted.map((l) => {
            const cov = l.coverage;
            const status: CoverageStatus = cov?.status ?? "no_stock_data";
            const tone = rowTone(status);
            const available = cov?.availableQty ?? 0;
            const required = l.requiredQty;
            const shortage = cov?.netShortageQty ?? 0;

            // Bar proportions: clamp available fill to 100% of the bar
            const fillPct =
              required > 0 ? Math.min((available / required) * 100, 100) : 0;
            const shortPct =
              required > 0 && shortage > 0
                ? Math.min((shortage / required) * 100, 100 - fillPct)
                : 0;

            // Delta vs previous run
            const prev = prevMap.get(l.componentId);
            let delta: number | null = null;
            if (prev) {
              delta = l.requiredQty - prev.requiredQty;
            }

            return (
              <tr key={l.id} className={cn("transition-colors", tone.row)}>
                {/* Component */}
                <td className="px-4 py-2.5">
                  <div className="font-medium text-fg-strong text-xs">
                    {l.componentName}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {l.componentClass && (
                      <span className="inline-flex items-center rounded-sm border px-1 py-0 text-3xs font-semibold uppercase tracking-sops bg-bg-muted text-fg-muted border-border/70">
                        {l.componentClass}
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center rounded-sm border px-1 py-0 text-3xs font-semibold uppercase tracking-sops",
                        tone.badge,
                      )}
                    >
                      {status === "covered"
                        ? "Covered"
                        : status === "partial"
                          ? "Partial"
                          : status === "not_covered"
                            ? "Shortage"
                            : "No data"}
                    </span>
                  </div>
                </td>

                {/* Required */}
                <td className="px-4 py-2.5 text-right tabular-nums text-xs text-fg">
                  {formatQty(required, l.uom)}
                  <span className="ml-1 text-3xs text-fg-muted">{l.uom}</span>
                </td>

                {/* On hand */}
                <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                  {cov?.status === "no_stock_data" ? (
                    <span className="text-fg-muted">—</span>
                  ) : (
                    <>
                      {formatQty(available, l.uom)}
                      <span className="ml-1 text-3xs text-fg-muted">{l.uom}</span>
                    </>
                  )}
                </td>

                {/* Coverage bar */}
                <td className="px-4 py-2.5">
                  <div className="relative h-5 w-full overflow-hidden rounded-sm bg-bg-muted">
                    {/* Available fill */}
                    <div
                      className={cn("absolute left-0 top-0 h-full transition-all duration-500", tone.bar)}
                      style={{ width: `${fillPct}%`, opacity: 0.85 }}
                    />
                    {/* Shortage indicator */}
                    {shortPct > 0 && (
                      <div
                        className="absolute top-0 h-full bg-danger/20 border-l-2 border-danger/60"
                        style={{
                          left: `${fillPct}%`,
                          width: `${shortPct}%`,
                        }}
                      />
                    )}
                    {/* Percent label inside bar */}
                    <div className="absolute inset-0 flex items-center px-1.5">
                      <span className="text-3xs font-semibold text-fg-strong drop-shadow-sm tabular-nums">
                        {cov?.status === "no_stock_data"
                          ? "—"
                          : `${Math.round(fillPct)}%`}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Gap */}
                <td className="px-4 py-2.5 text-right tabular-nums text-xs font-semibold">
                  {shortage > 0 ? (
                    <span className="text-danger-fg">
                      -{formatQty(shortage, l.uom)}
                    </span>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>

                {/* Delta vs prev */}
                {prevMap.size > 0 && (
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                    {delta === null ? (
                      <span className="text-fg-muted text-3xs">new</span>
                    ) : delta === 0 ? (
                      <span className="text-fg-muted">—</span>
                    ) : delta > 0 ? (
                      <span className="text-danger-fg">
                        +{formatQty(delta, l.uom)}
                      </span>
                    ) : (
                      <span className="text-success-fg">
                        {formatQty(delta, l.uom)}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}
