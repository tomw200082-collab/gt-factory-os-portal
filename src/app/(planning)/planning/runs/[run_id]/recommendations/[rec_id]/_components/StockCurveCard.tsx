"use client";

// ---------------------------------------------------------------------------
// StockCurveCard — weekly projected on-hand coverage curve
//
// One row per period_bucket_key. Rows with shortage_flag=true are highlighted.
// Returns null when coverage_curve is empty (legacy runs / component-path recs).
// DTO v1.2 fields (signal #35 — RUNTIME_READY(Planning-TrustMinimum-W1)).
// ---------------------------------------------------------------------------

import { SectionCard } from "@/components/workflow/SectionCard";
import { cn } from "@/lib/cn";
import type { RecommendationDetailResponse } from "../_lib/types";

function parseQty(s: string): number {
  return parseFloat(s) || 0;
}

function fmtQty(s: string): string {
  const n = parseQty(s);
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, "");
}

function fmtWeek(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  } catch {
    return iso;
  }
}

interface StockCurveCardProps {
  rec: RecommendationDetailResponse;
}

export function StockCurveCard({ rec }: StockCurveCardProps) {
  if (rec.coverage_curve.length === 0) return null;

  return (
    <SectionCard
      eyebrow="Coverage curve"
      title="Projected stock by week"
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/40">
            <th className="pb-1.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Week
            </th>
            <th className="pb-1.5 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Proj. on hand
            </th>
            <th className="pb-1.5 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Safety stock
            </th>
            <th className="pb-1.5 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rec.coverage_curve.map((row) => (
            <tr
              key={row.week}
              className={cn(
                "border-b border-border/30 last:border-0",
                row.shortage_flag && "bg-danger-softer/40",
              )}
            >
              <td className="py-1.5 text-fg-muted">{fmtWeek(row.week)}</td>
              <td
                className={cn(
                  "py-1.5 text-right font-mono tabular-nums",
                  parseQty(row.projected_on_hand) < 0
                    ? "font-semibold text-danger-fg"
                    : "text-fg-strong",
                )}
              >
                {fmtQty(row.projected_on_hand)}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums text-fg-muted">
                {fmtQty(row.safety_stock_qty)}
              </td>
              <td className="py-1.5 text-right">
                {row.shortage_flag ? (
                  <span className="rounded bg-danger/10 px-1 py-0.5 text-3xs font-semibold text-danger-fg">
                    Shortage
                  </span>
                ) : (
                  <span className="text-3xs text-fg-muted">OK</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-3xs text-fg-faint">
        Projected on-hand before safety stock deduction. Shortage = projected OH &lt; 0.
      </p>
    </SectionCard>
  );
}

export function StockCurveCardSkeleton() {
  return (
    <div className="card p-5 space-y-2">
      <div className="h-3 w-32 animate-pulse rounded bg-bg-subtle" />
      <div className="h-5 w-48 animate-pulse rounded bg-bg-subtle" />
      <div className="mt-3 space-y-1.5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex justify-between gap-4">
            <div className="h-3 w-16 animate-pulse rounded bg-bg-subtle" />
            <div className="h-3 w-20 animate-pulse rounded bg-bg-subtle" />
            <div className="h-3 w-20 animate-pulse rounded bg-bg-subtle" />
            <div className="h-3 w-12 animate-pulse rounded bg-bg-subtle" />
          </div>
        ))}
      </div>
    </div>
  );
}
