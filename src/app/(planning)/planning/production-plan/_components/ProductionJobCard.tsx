"use client";

// ProductionJobCard — redesigned production plan card.
// Spec: PDP-UX-01 § 8 + § 4a "Card elegance".
//
// BOM impact panel is per-item material disclosure. Weekly aggregate
// materials surface via the "Materials this week" drawer.

import Link from "next/link";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  Clock,
  CheckCircle2,
  Ban,
  Factory,
  Pencil,
  Boxes,
  ChevronDown,
  ChevronUp,
  Package,
} from "lucide-react";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import {
  fmtQty,
  computeVarianceSign,
  fmtVarianceQty,
  fmtVariancePct,
  VARIANCE_SIGN_LABEL,
  VARIANCE_TOOLTIP,
} from "../_lib/helpers";
import type { ProductionPlanRow } from "../_lib/types";

// BOM impact hook — lazy, only fetches when panel is expanded.
interface BomImpactSnapshot {
  bom_final_output_qty: string;
  bom_final_output_uom: string;
  bom_lines: Array<{
    component_id: string;
    component_name: string;
    final_component_qty: string;
    component_uom: string | null;
  }>;
}

function useBomImpact(itemId: string | null) {
  return useQuery<BomImpactSnapshot | null>({
    queryKey: ["bom-impact", itemId],
    queryFn: async () => {
      if (!itemId) return null;
      const res = await fetch(
        `/api/production-actuals/open?item_id=${encodeURIComponent(itemId)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return null;
      return ((await res.json()) as BomImpactSnapshot | null) ?? null;
    },
    enabled: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function ProductionJobCard({
  plan,
  canAct,
  isToday,
  onEdit,
  onCancel,
}: {
  plan: ProductionPlanRow;
  canAct: boolean;
  isToday: boolean;
  onEdit: (p: ProductionPlanRow) => void;
  onCancel: (p: ProductionPlanRow) => void;
}) {
  const isLive = plan.rendered_state === "planned";
  const isDone = plan.rendered_state === "done";
  const isCancelled = plan.rendered_state === "cancelled";
  const isRec = !!plan.source_recommendation_id;

  const [impactOpen, setImpactOpen] = useState(false);
  const bomQuery = useBomImpact(impactOpen ? plan.item_id : null);

  function toggleImpact() {
    setImpactOpen((v) => !v);
    if (!impactOpen) void bomQuery.refetch();
  }

  const rmLines = useMemo(() => {
    const snap = bomQuery.data;
    if (!snap) return [];
    const outputQty = parseFloat(snap.bom_final_output_qty);
    const plannedQty = parseFloat(plan.planned_qty ?? "0");
    if (!Number.isFinite(outputQty) || outputQty <= 0) return [];
    if (!Number.isFinite(plannedQty) || plannedQty <= 0) return [];
    const multiplier = plannedQty / outputQty;
    return snap.bom_lines.map((line) => ({
      name: line.component_name,
      required: parseFloat(line.final_component_qty) * multiplier,
      uom: line.component_uom ?? "",
    }));
  }, [bomQuery.data, plan.planned_qty]);

  const qty = parseFloat(plan.planned_qty ?? "0");
  const qtyStr = Number.isInteger(qty) ? qty.toFixed(0) : qty.toFixed(1);

  const completedActual = plan.completed_actual;
  const varianceSign = completedActual
    ? computeVarianceSign(completedActual.variance_qty, plan.planned_qty)
    : null;

  return (
    <div
      className={cn(
        "group relative rounded-lg border-l-[3px] border border-border/40",
        "transition-all duration-150 cursor-default",
        "hover:ring-1 hover:ring-accent/20 hover:shadow-sm",
        isLive && !isCancelled && "border-l-warning bg-bg-raised border-warning/20",
        isDone && "border-l-success bg-bg-raised border-success/20",
        isCancelled && "border-l-border/40 bg-bg-subtle/60 opacity-70",
      )}
      data-testid="production-job-card"
      data-plan-id={plan.plan_id}
      data-rendered-state={plan.rendered_state}
    >
      <div className="px-3 pt-3 pb-2.5">
        {/* Quantity (dominant signal) */}
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <div
            className={cn(
              "text-[26px] font-bold tabular-nums leading-none tracking-tightish",
              isLive && "text-warning-fg",
              isDone && "text-success-fg",
              isCancelled && "text-fg-muted line-through",
            )}
          >
            {qtyStr}
            <span
              className={cn(
                "ml-1.5 text-sm font-semibold align-baseline",
                isLive && "text-warning-fg/80",
                isDone && "text-success-fg/80",
                isCancelled && "text-fg-muted",
              )}
            >
              {plan.uom}
            </span>
          </div>

          {/* Status icon (top-right corner) */}
          <div className="pt-1 shrink-0">
            {isLive && (
              <Clock className="h-3.5 w-3.5 text-warning/70" strokeWidth={2} />
            )}
            {isDone && (
              <CheckCircle2
                className="h-3.5 w-3.5 text-success"
                strokeWidth={2}
              />
            )}
            {isCancelled && (
              <Ban className="h-3.5 w-3.5 text-fg-faint" strokeWidth={2} />
            )}
          </div>
        </div>

        {/* Item name (secondary) */}
        <div
          className={cn(
            "text-sm font-semibold leading-tight truncate mb-2",
            isCancelled ? "text-fg-muted" : "text-fg-strong",
          )}
          title={plan.item_name ?? plan.item_id}
        >
          {plan.item_name ?? plan.item_id}
        </div>

        {/* Metadata foot row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Sparkles chip only for rec-sourced plans; manual is baseline. */}
          {isRec && (
            <span className="chip chip-accent gap-1 text-[10px]">
              <Sparkles className="h-2.5 w-2.5" strokeWidth={2.5} />
              Rec
            </span>
          )}

          {/* Overdue clock — only on live overdue plans */}
          {isLive && !isToday && (
            <span className="chip gap-1 text-[10px] border-warning/30 bg-warning-softer/60 text-warning-fg">
              <Clock className="h-2.5 w-2.5" strokeWidth={2.5} />
              Overdue
            </span>
          )}

          {/* Inventory impact toggle */}
          {!isCancelled && (
            <button
              type="button"
              className={cn(
                "chip gap-1 text-[10px] transition-colors",
                impactOpen
                  ? "bg-info-softer/60 border-info/40 text-info-fg"
                  : "hover:bg-info-softer/40 hover:border-info/30 hover:text-info-fg",
              )}
              onClick={toggleImpact}
              aria-expanded={impactOpen}
              aria-label="Toggle inventory impact"
              data-testid="chip-impact-toggle"
            >
              <Boxes className="h-2.5 w-2.5" strokeWidth={2.5} />
              {impactOpen ? (
                <ChevronUp className="h-2 w-2" strokeWidth={2.5} />
              ) : (
                <ChevronDown className="h-2 w-2" strokeWidth={2.5} />
              )}
            </button>
          )}

          {/* Done variance badge */}
          {isDone && completedActual && varianceSign && (
            <Badge
              tone={varianceSign === "on_target" ? "success" : "warning"}
              variant="soft"
            >
              {fmtVarianceQty(completedActual.variance_qty)} ({fmtVariancePct(completedActual.variance_pct)})
            </Badge>
          )}

          {/* Cancelled reason */}
          {isCancelled && plan.cancel_reason && (
            <span
              className="text-[10px] text-fg-faint truncate max-w-[14ch]"
              title={plan.cancel_reason}
            >
              {plan.cancel_reason}
            </span>
          )}
        </div>
      </div>

      {/* Action strip — always-on for live plans */}
      {canAct && isLive && (
        <div className="flex items-center justify-between gap-1.5 px-3 pb-2.5 border-t border-border/20 pt-2">
          {/* Report button — primary for today */}
          <Link
            href={`/stock/production-actual?from_plan_id=${encodeURIComponent(plan.plan_id)}${plan.item_id ? `&item_id=${encodeURIComponent(plan.item_id)}` : ""}&suggested_qty=${encodeURIComponent(plan.planned_qty)}`}
            className={cn(
              "btn btn-xs gap-1",
              isToday ? "btn-primary" : "btn-ghost text-accent",
            )}
            title="Report actual production"
            data-testid="plan-row-report"
          >
            <Factory className="h-2.5 w-2.5" strokeWidth={2.5} />
            Report
          </Link>

          {/* Edit + cancel */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => onEdit(plan)}
              title="Edit plan"
              aria-label="Edit plan"
              data-testid="plan-row-edit"
            >
              <Pencil className="h-2.5 w-2.5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs text-danger"
              onClick={() => onCancel(plan)}
              title="Cancel plan"
              aria-label="Cancel plan"
              data-testid="plan-row-cancel"
            >
              <Ban className="h-2.5 w-2.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}

      {/* Done: link to submission */}
      {isDone && completedActual && varianceSign && (
        <div className="px-3 pb-2.5 border-t border-border/20 pt-2 flex items-center justify-between gap-2">
          <div className="text-[10px] text-fg-muted" title={VARIANCE_TOOLTIP}>
            <span
              className={
                varianceSign === "on_target" ? "text-success-fg" : "text-warning-fg"
              }
            >
              {VARIANCE_SIGN_LABEL[varianceSign]} ·{" "}
              <span className="tabular-nums font-mono">
                {fmtQty(completedActual.output_qty, completedActual.output_uom)}
              </span>
            </span>
          </div>
          <Link
            href={`/stock/production-actual?submission_id=${completedActual.submission_id}`}
            className="text-[10px] text-accent hover:underline shrink-0"
          >
            View report →
          </Link>
        </div>
      )}

      {/* BOM impact panel */}
      {impactOpen && (
        <div
          className="mx-3 mb-3 rounded border border-info/30 bg-info-softer/20 p-2.5 space-y-2"
          data-testid="impact-panel"
        >
          <div className="flex items-center gap-2 rounded border border-success/30 bg-success-softer/50 px-2 py-1.5">
            <Package className="h-3 w-3 text-success shrink-0" strokeWidth={2} />
            <span className="text-xs text-success-fg">
              <span className="font-semibold tabular-nums">
                +{fmtQty(plan.planned_qty, plan.uom)}
              </span>
              {" of "}
              <span className="font-medium">{plan.item_name ?? plan.item_id}</span>
              {" to finished goods"}
            </span>
          </div>

          {bomQuery.isLoading ? (
            <div className="space-y-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-5 w-full animate-pulse rounded bg-bg-subtle" />
              ))}
            </div>
          ) : bomQuery.isError || !bomQuery.data ? (
            <div className="text-xs text-fg-muted">
              BOM data not available.{" "}
              <Link href="/planning/inventory-flow" className="text-accent hover:underline">
                Check inventory flow →
              </Link>
            </div>
          ) : rmLines.length === 0 ? (
            <div className="text-xs text-fg-muted">No components in BOM.</div>
          ) : (
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-sops text-fg-faint mb-1">
                Raw materials required
              </div>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left text-[9px] uppercase tracking-sops text-fg-faint font-semibold pb-1">
                      Material
                    </th>
                    <th className="text-right text-[9px] uppercase tracking-sops text-fg-faint font-semibold pb-1">
                      Required
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {rmLines.map((line, idx) => (
                    <tr key={idx}>
                      <td className="text-xs text-fg py-1 pr-2">{line.name}</td>
                      <td className="text-right text-xs tabular-nums text-fg-muted py-1">
                        {line.required % 1 === 0
                          ? line.required.toFixed(0)
                          : line.required.toFixed(2).replace(/\.?0+$/, "")}
                        {" "}{line.uom}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-1.5">
                <Link
                  href="/planning/inventory-flow"
                  className="text-[10px] text-accent hover:underline"
                >
                  Check stock levels in inventory flow →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {plan.notes && (
        <div className="px-3 pb-3 text-[10px] text-fg-muted">
          <span className="font-medium">Notes: </span>
          {plan.notes}
        </div>
      )}
    </div>
  );
}
