"use client";

// ProductionJobCard — redesigned production plan card.
// Spec: PDP-UX-01 § 8 + § 4a "Card elegance".
//
// BOM impact panel is per-item material disclosure. Weekly aggregate
// materials surface via the "Materials this week" drawer.

import Link from "next/link";
import { useState } from "react";
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
} from "lucide-react";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";
import { usePlanRecipeFlag } from "../_lib/useRecipe";
import {
  fmtQty,
  describeVariance,
  VARIANCE_TOOLTIP,
} from "../_lib/helpers";
import type { ProductionPlanRow } from "../_lib/types";
import { InventoryImpactPanel } from "./InventoryImpactPanel";

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
  // §1 (COPY-002) — never fall through to the raw item_id (an opaque code)
  // in the operator-facing title. A name is expected for every item-linked
  // plan; the placeholder only guards the defensive null case.
  const cardTitle = plan.is_base_batch
    ? `Base batch · ${plan.pack_manifest_count} SKU${plan.pack_manifest_count === 1 ? "" : "s"}`
    : (plan.item_name ?? "Unnamed item");

  const [impactOpen, setImpactOpen] = useState(false);

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
  const variance = completedActual
    ? describeVariance(
        completedActual.variance_qty,
        completedActual.variance_pct,
        plan.planned_qty ?? "0",
      )
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
            className="text-3xs font-semibold uppercase tracking-sops text-success-fg/70 leading-none mb-1"
            data-testid="plan-card-produced-label"
          >
            Produced
          </div>
        )}
        {/* Quantity (dominant signal) */}
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <div
            className={cn(
              "font-mono text-[26px] font-bold tabular-nums leading-none tracking-tightish",
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
                "ml-1.5 font-sans text-sm font-semibold align-baseline",
                isLive && !isDraft && "text-warning-fg/80",
                isDraft && !isDone && !isCancelled && "text-fg-muted",
                isDone && "text-success-fg/80",
                isCancelled && "text-fg-muted",
              )}
            >
              {heroUom}
            </span>
          </div>

          {/* Status icon (top-right corner) — decorative; the state is carried
              in text by the status chips and the hero color. aria-hidden so a
              screen reader doesn't announce a bare unlabelled icon. */}
          <div className="pt-1 shrink-0">
            {isLive && !isDraft && (
              <Clock className="h-3.5 w-3.5 text-warning/70" strokeWidth={2} aria-hidden />
            )}
            {isDone && (
              <CheckCircle2
                className="h-3.5 w-3.5 text-success"
                strokeWidth={2}
                aria-hidden
              />
            )}
            {isCancelled && (
              <Ban className="h-3.5 w-3.5 text-fg-faint" strokeWidth={2} aria-hidden />
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
          {isDone && completedActual && variance && (
            <Badge
              tone={variance.isOnTarget ? "success" : "warning"}
              variant="soft"
              className="font-mono"
            >
              {variance.qtyText} ({variance.pctText})
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
              Report Production
            </Link>
          ) : (
            <span className="text-[10px] text-fg-faint" title="Confirm this plan before reporting production">
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

      {/* Done: link to submission. FLOW-007 — the audit link must survive even
          when the variance can't be computed (variance null). It only needs the
          submission_id; the variance line degrades to a plain "Reported" context
          line rather than dropping the whole footer (and the link). */}
      {isDone && completedActual && (
        <div className="px-3 pb-2.5 border-t border-border/20 pt-2 flex items-center justify-between gap-2">
          {variance ? (
            <div className="text-[10px] text-fg-muted" title={VARIANCE_TOOLTIP}>
              <span
                className={
                  variance.isOnTarget ? "text-success-fg" : "text-warning-fg"
                }
              >
                {variance.signLabel}
              </span>
              {" vs planned "}
              <span className="tabular-nums font-mono">
                {fmtQty(plan.planned_qty ?? "0", plan.uom ?? "")}
              </span>
            </div>
          ) : (
            <div className="text-[10px] text-fg-muted">
              {"Reported · planned "}
              <span className="tabular-nums font-mono">
                {fmtQty(plan.planned_qty ?? "0", plan.uom ?? "")}
              </span>
            </div>
          )}
          <Link
            href={`/stock/production-actual?submission_id=${completedActual.submission_id}`}
            className="text-[10px] text-accent hover:underline shrink-0"
          >
            View report →
          </Link>
        </div>
      )}

      {/* Inventory-impact disclosure — the card no longer owns the BOM fetch
          or consumption math; it just hands the panel what to show. */}
      <InventoryImpactPanel
        open={impactOpen}
        plan={plan}
        cardTitle={cardTitle}
        heroQty={heroQty}
        heroQtyStr={heroQtyStr}
        heroUom={heroUom}
      />

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
