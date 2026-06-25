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
  FlaskConical,
  Pencil,
  Trash2,
  Boxes,
  ChevronDown,
  ChevronUp,
  Package,
} from "lucide-react";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import { usePlanRecipeFlag } from "../_lib/useRecipe";
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

function useBomImpact(itemId: string | null, planId: string | null) {
  return useQuery<BomImpactSnapshot | null>({
    // Tranche 052 — plan id is part of the key: with from_plan_id the open
    // response's base-source lines reflect that plan's improvised recipe,
    // so snapshots must not be shared across plans of the same item.
    queryKey: ["bom-impact", itemId, planId],
    queryFn: async () => {
      if (!itemId) return null;
      const q = new URLSearchParams({ item_id: itemId });
      if (planId) q.set("from_plan_id", planId);
      const res = await fetch(`/api/production-actuals/open?${q.toString()}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      return ((await res.json()) as BomImpactSnapshot | null) ?? null;
    },
    // Lazy via `enabled` (Tranche 052): both args are null while the panel
    // is closed; opening it flips the key + enables the fetch. The previous
    // `enabled:false` + manual refetch() raced the key change.
    enabled: itemId !== null,
    staleTime: 5 * 60 * 1000,
  });
}

export function ProductionJobCard({
  plan,
  canAct,
  isToday,
  onEdit,
  onCancel,
  onDelete,
  onAdjustRecipe,
}: {
  plan: ProductionPlanRow;
  canAct: boolean;
  isToday: boolean;
  onEdit: (p: ProductionPlanRow) => void;
  onCancel: (p: ProductionPlanRow) => void;
  onDelete: (p: ProductionPlanRow) => void;
  onAdjustRecipe: (p: ProductionPlanRow) => void;
}) {
  const isLive = plan.rendered_state === "planned";
  const isDone = plan.rendered_state === "done";
  const isCancelled = plan.rendered_state === "cancelled";
  const isRec = !!plan.source_recommendation_id;

  // B4 (Tranche 050) — raw DB status passthrough. Drafts are muted,
  // not-yet-firmed rows with NO Report CTA; in-production rows get their own
  // chip. rendered_state keeps driving the existing live/done/cancelled
  // surfaces untouched.
  const isDraft = plan.status === "draft";
  const isInProduction = plan.status === "in_production";

  // Delete is only for not-yet-produced rows. A done row (item-linked actual),
  // an in-flight run, or a closed base batch (status 'completed' with no
  // submission link) all represent real production — even though
  // in_production / completed base-batch rows derive to rendered_state
  // 'planned' — so they must NOT offer delete. The backend enforces the same
  // rule (409 PLAN_NOT_DELETABLE); this just keeps the button off those cards.
  const canDelete = !isDone && !isInProduction && plan.status !== "completed";

  // B4 (Tranche 050) — base-batch rows plan a BASE liquid batch across N
  // pack SKUs; item_id/item_name are null, so render the batch label
  // instead of an empty title.
  const cardTitle = plan.is_base_batch
    ? `Base batch · ${plan.pack_manifest_count} SKU${plan.pack_manifest_count === 1 ? "" : "s"}`
    : (plan.item_name ?? plan.item_id);

  const [impactOpen, setImpactOpen] = useState(false);
  const bomQuery = useBomImpact(
    impactOpen ? plan.item_id : null,
    impactOpen ? plan.plan_id : null,
  );

  // Tranche 052 — recipe-override eligibility: MANUFACTURED single-item
  // plans only (base-batch rows and REPACK items have no per-plan liquid
  // override surface).
  const recipeEligible =
    !plan.is_base_batch &&
    plan.item_id !== null &&
    plan.item_supply_method === "MANUFACTURED";

  // Override-flag path (Tranche 052): the plan-list DTO does NOT carry an
  // override flag and a per-card recipe GET would be too heavy. The flag
  // query is therefore (a) written into the cache by the save mutation and
  // (b) lazily fetched only while the BOM-impact panel is open. Until either
  // happens it stays undefined and no badge renders.
  const hasCustomRecipe = usePlanRecipeFlag(plan.plan_id, {
    enabled: impactOpen && recipeEligible,
  });

  function toggleImpact() {
    // Opening flips the useBomImpact key to (item_id, plan_id) and enables
    // the query — no manual refetch needed (Tranche 052).
    setImpactOpen((v) => !v);
  }

  const qty = parseFloat(plan.planned_qty ?? "0");

  const completedActual = plan.completed_actual;
  const varianceSign = completedActual
    ? computeVarianceSign(completedActual.variance_qty, plan.planned_qty ?? "0")
    : null;

  // Hero number = what the operator most needs to see. Before reporting that
  // is the planned target; AFTER a production report it is the quantity that
  // was actually produced. The plan then survives as a small "vs planned"
  // context line in the footer, and the variance badge quantifies the gap.
  const reportedQty =
    isDone && completedActual ? parseFloat(completedActual.output_qty) : NaN;
  const showActual = Number.isFinite(reportedQty);
  const heroQty = showActual ? reportedQty : qty;
  const heroQtyStr = Number.isInteger(heroQty)
    ? heroQty.toFixed(0)
    : heroQty.toFixed(1);
  const heroUom = showActual ? completedActual!.output_uom : plan.uom;

  // Inventory impact scales off the same hero quantity: a done run consumed
  // raw materials against its ACTUAL output, an open plan against its target.
  const rmLines = useMemo(() => {
    const snap = bomQuery.data;
    if (!snap) return [];
    const outputQty = parseFloat(snap.bom_final_output_qty);
    if (!Number.isFinite(outputQty) || outputQty <= 0) return [];
    if (!Number.isFinite(heroQty) || heroQty <= 0) return [];
    const multiplier = heroQty / outputQty;
    return snap.bom_lines.map((line) => ({
      name: line.component_name,
      required: parseFloat(line.final_component_qty) * multiplier,
      uom: line.component_uom ?? "",
    }));
  }, [bomQuery.data, heroQty]);

  return (
    <div
      className={cn(
        "group relative rounded-lg border-l-[3px] border border-border/40",
        "transition-all duration-150 cursor-default",
        "hover:ring-1 hover:ring-accent/20 hover:shadow-sm",
        isLive && !isCancelled && !isDraft && "border-l-warning bg-bg-raised border-warning/20",
        isDone && "border-l-success bg-bg-raised border-success/20",
        isCancelled && "border-l-border/40 bg-bg-subtle/60 opacity-70",
        // B4 — drafts are muted: not firmed, no urgency color.
        isDraft && !isCancelled && !isDone && "border-l-border/60 bg-bg-subtle/50 opacity-80",
      )}
      data-testid="production-job-card"
      data-plan-id={plan.plan_id}
      data-rendered-state={plan.rendered_state}
      data-plan-status={plan.status}
    >
      <div className="px-3 pt-3 pb-2.5">
        {/* Produced eyebrow — after a report, signals the hero number is the
            actual output that was produced, not the original plan. */}
        {showActual && (
          <div
            className="text-[9px] font-semibold uppercase tracking-sops text-success-fg/70 leading-none mb-1"
            data-testid="plan-card-produced-label"
          >
            Produced
          </div>
        )}
        {/* Quantity (dominant signal) */}
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <div
            className={cn(
              "text-[26px] font-bold tabular-nums leading-none tracking-tightish",
              isLive && !isDraft && "text-warning-fg",
              isDraft && !isDone && !isCancelled && "text-fg-muted",
              isDone && "text-success-fg",
              isCancelled && "text-fg-muted line-through",
            )}
            data-testid="plan-card-hero-qty"
          >
            {heroQtyStr}
            <span
              className={cn(
                "ml-1.5 text-sm font-semibold align-baseline",
                isLive && !isDraft && "text-warning-fg/80",
                isDraft && !isDone && !isCancelled && "text-fg-muted",
                isDone && "text-success-fg/80",
                isCancelled && "text-fg-muted",
              )}
            >
              {heroUom}
            </span>
          </div>

          {/* Status icon (top-right corner) */}
          <div className="pt-1 shrink-0">
            {isLive && !isDraft && (
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
            isCancelled || isDraft ? "text-fg-muted" : "text-fg-strong",
          )}
          title={cardTitle ?? undefined}
        >
          {cardTitle}
        </div>

        {/* Metadata foot row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Sparkles chip only for rec-sourced plans; manual is baseline. */}
          {isRec && (
            <span className="chip chip-accent gap-1 text-[10px]">
              <Sparkles className="h-2.5 w-2.5" strokeWidth={2.5} />
              Recommended
            </span>
          )}

          {/* B4 — draft chip: not yet firmed, never reportable. */}
          {isDraft && !isDone && !isCancelled && (
            <span
              className="chip gap-1 text-[10px] text-fg-muted"
              data-testid="plan-card-draft-chip"
            >
              Draft — not yet confirmed
            </span>
          )}

          {/* Tranche 052 — custom-recipe badge. Known lazily: after a save
              in this session or once the impact panel fetched the recipe. */}
          {hasCustomRecipe === true && !isCancelled && (
            <span
              className="chip chip-accent gap-1 text-[10px]"
              title="This run uses an adjusted liquid recipe"
              data-testid="plan-card-custom-recipe-chip"
            >
              <FlaskConical className="h-2.5 w-2.5" strokeWidth={2.5} />
              Custom recipe
            </span>
          )}

          {/* B4 — in-production chip: firmed and currently running. */}
          {isInProduction && !isDone && !isCancelled && (
            <span
              className="chip chip-info gap-1 text-[10px]"
              data-testid="plan-card-in-production-chip"
            >
              <Factory className="h-2.5 w-2.5" strokeWidth={2.5} />
              In production
            </span>
          )}

          {/* Overdue clock — only on live (firmed) overdue plans */}
          {isLive && !isDraft && !isToday && (
            <span className="chip chip-warning gap-1 text-[10px]">
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

      {/* Action strip — always-on for live plans. B4: drafts keep edit /
          cancel but get NO Report CTA — a draft is not firmed and must not
          be reported against. */}
      {canAct && isLive && (
        <div className="flex items-center justify-between gap-1.5 px-3 pb-2.5 border-t border-border/20 pt-2">
          {/* Report button — primary for today; hidden on drafts */}
          {!isDraft ? (
            <Link
              href={`/stock/production-actual?from_plan_id=${encodeURIComponent(plan.plan_id)}${plan.item_id ? `&item_id=${encodeURIComponent(plan.item_id)}` : ""}&suggested_qty=${encodeURIComponent(plan.planned_qty ?? "")}`}
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
          ) : (
            <span className="text-[10px] text-fg-faint" title="Firm this plan before reporting production">
              Not reportable yet
            </span>
          )}

          {/* Edit + cancel. INTER-010 (Tranche 048): min 32×32px touch
              targets via padding only — the icon size is unchanged. */}
          <div className="flex items-center gap-1">
            {/* Tranche 052 — adjust the liquid recipe for this run. Only on
                live (unreported) MANUFACTURED plans; the strip itself already
                hides once the plan is done or cancelled. */}
            {recipeEligible && (
              <button
                type="button"
                className="btn btn-ghost btn-xs min-h-[32px] min-w-[32px] text-accent"
                onClick={() => onAdjustRecipe(plan)}
                title="Adjust recipe for this run"
                aria-label="Adjust recipe for this run"
                data-testid="plan-row-adjust-recipe"
              >
                <FlaskConical className="h-2.5 w-2.5" strokeWidth={2.5} />
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-xs min-h-[32px] min-w-[32px]"
              onClick={() => onEdit(plan)}
              title="Edit plan"
              aria-label="Edit plan"
              data-testid="plan-row-edit"
            >
              <Pencil className="h-2.5 w-2.5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs min-h-[32px] min-w-[32px] text-danger"
              onClick={() => onCancel(plan)}
              title="Cancel plan"
              aria-label="Cancel plan"
              data-testid="plan-row-cancel"
            >
              <Ban className="h-2.5 w-2.5" strokeWidth={2.5} />
            </button>
            {/* Delete — permanently removes a not-yet-produced row. Distinct
                from cancel (which keeps a reasoned record). Hidden once a run
                is in production / completed (backend would 409). */}
            {canDelete && (
              <button
                type="button"
                className="btn btn-ghost btn-xs min-h-[32px] min-w-[32px] text-danger"
                onClick={() => onDelete(plan)}
                title="Delete record"
                aria-label="Delete record"
                data-testid="plan-row-delete"
              >
                <Trash2 className="h-2.5 w-2.5" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Cancelled action strip — cancelled cards otherwise expose no actions.
          A cancelled row never touched inventory, so it can be deleted to
          clear the board. */}
      {canAct && isCancelled && canDelete && (
        <div className="flex items-center justify-end gap-1.5 px-3 pb-2.5 border-t border-border/20 pt-2">
          <button
            type="button"
            className="btn btn-ghost btn-xs min-h-[32px] min-w-[32px] text-danger"
            onClick={() => onDelete(plan)}
            title="Delete record"
            aria-label="Delete record"
            data-testid="plan-row-delete"
          >
            <Trash2 className="h-2.5 w-2.5" strokeWidth={2.5} />
          </button>
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
              {VARIANCE_SIGN_LABEL[varianceSign]}
            </span>
            {" vs planned "}
            <span className="tabular-nums font-mono">
              {fmtQty(plan.planned_qty ?? "0", plan.uom ?? "")}
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
                +{fmtQty(heroQtyStr, heroUom ?? "")}
              </span>
              {" of "}
              <span className="font-medium">{cardTitle}</span>
              {plan.is_base_batch ? " to base liquid" : " to finished goods"}
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
                    <th scope="col" className="text-left text-[9px] uppercase tracking-sops text-fg-faint font-semibold pb-1">
                      Material
                    </th>
                    <th scope="col" className="text-right text-[9px] uppercase tracking-sops text-fg-faint font-semibold pb-1">
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
