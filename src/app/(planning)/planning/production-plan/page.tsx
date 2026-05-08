"use client";

// ---------------------------------------------------------------------------
// /planning/production-plan — Production Plan
//
// Daily production board. Lets a planner:
//   - See the week
//   - Add planned production manually OR from approved production
//     recommendations
//   - Edit qty/date/uom/notes while planned
//   - Cancel with a reason
//   - See planned / completed / cancelled state per row
//
// Locked principle: plans NEVER write stock_ledger. Stock changes only
// when actual production is reported.
//
// Portal UX standard (Gate 4.2 lock):
//   - English / LTR only
//   - Empty / loading / error states are mutually exclusive
//   - No raw IDs as primary content
//   - Names not IDs
//
// Visual redesign (2026-05-09): 4-zone production board.
//   Zone A: KPI hero band (4 micro-cards)
//   Zone B: Week load segment bar (7 segments — daily volume heatmap)
//   Zone C: 7 always-visible day cards with item chips + inventory impact panel
//   Zone D: Week summary footer with progress bar
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  CheckCircle2,
  XCircle,
  Pencil,
  Ban,
  Factory,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Sparkles,
  ArrowRight,
  Calendar,
  Clock,
  Package,
  PlayCircle,
  Boxes,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";
import {
  usePlans,
  useCreatePlan,
  usePatchPlan,
  useRecommendationCandidates,
  FetchError,
} from "./_lib/usePlans";
import type {
  ProductionPlanRow,
  RecommendationCandidate,
  RenderedState,
} from "./_lib/types";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function startOfWeek(d: Date): Date {
  // Sunday-first per the operator week convention.
  const day = d.getDay();
  const out = new Date(d);
  out.setDate(d.getDate() - day);
  out.setHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(d.getDate() + n);
  return out;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtDayHeader(d: Date): { dayName: string; dateLabel: string } {
  return {
    dayName: DAY_NAMES[d.getDay()],
    dateLabel: `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`,
  };
}

function fmtWeekRange(start: Date, end: Date): string {
  const s = `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}`;
  const sameMonth = start.getMonth() === end.getMonth();
  const e = sameMonth
    ? `${end.getDate()}, ${end.getFullYear()}`
    : `${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  return `Week of ${s}–${e}`;
}

function fmtQty(s: string, uom: string | null): string {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return s;
  const formatted = Number.isInteger(n)
    ? n.toFixed(0)
    : n.toFixed(2).replace(/\.?0+$/, "");
  return uom ? `${formatted} ${uom}` : formatted;
}

// ---------------------------------------------------------------------------
// Variance display helpers — implements the W4 variance display contract
// (docs/integrations/production_actual_variance_display_contract.md §3 / §4).
//
// Single canonical formula, applied identically across every surface:
//   variance_qty  = output_qty - planned_qty   (NO scrap — CLAUDE.md prod
//                                               reporting v1 lock)
//   variance_pct  = variance_qty / planned_qty * 100   (NULL if planned=0)
//   variance_sign = on_target  if |variance_qty| <= planned_qty * 2%
//                 | over       if variance_qty >  planned_qty * 2%
//                 | under      if variance_qty < -planned_qty * 2%
// ---------------------------------------------------------------------------
const VARIANCE_ON_TARGET_THRESHOLD_PCT = 2.0;

type VarianceSign = "on_target" | "over" | "under";

function computeVarianceSign(
  varianceQtyStr: string,
  plannedQtyStr: string,
): VarianceSign {
  const variance = parseFloat(varianceQtyStr);
  const planned = parseFloat(plannedQtyStr);
  if (!Number.isFinite(variance) || !Number.isFinite(planned)) {
    return "on_target";
  }
  if (planned <= 0) {
    return variance === 0 ? "on_target" : "over";
  }
  const band = Math.abs(planned) * (VARIANCE_ON_TARGET_THRESHOLD_PCT / 100);
  if (variance > band) return "over";
  if (variance < -band) return "under";
  return "on_target";
}

function fmtVarianceQty(varianceQtyStr: string): string {
  const n = parseFloat(varianceQtyStr);
  if (!Number.isFinite(n)) return varianceQtyStr;
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const formatted = Number.isInteger(abs)
    ? abs.toFixed(0)
    : abs.toFixed(2).replace(/\.?0+$/, "");
  return n > 0 ? `+${formatted}` : `−${formatted}`;
}

function fmtVariancePct(variancePctStr: string | null): string {
  if (variancePctStr === null) return "—";
  const n = parseFloat(variancePctStr);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0.0%";
  const abs = Math.abs(n);
  return `${n > 0 ? "+" : "−"}${abs.toFixed(1)}%`;
}

const VARIANCE_SIGN_LABEL: Record<VarianceSign, string> = {
  on_target: "On target",
  over: "Over",
  under: "Under",
};
const VARIANCE_TOOLTIP =
  "Variance compares output to planned quantity. " +
  "It does not include scrap (per the production reporting v1 model: " +
  "system computes consumption from BOM; scrap is loss, not output). " +
  "Stock has already been updated by the production report.";

// ---------------------------------------------------------------------------
// Items hook (for the manual-add form).
// ---------------------------------------------------------------------------
interface ItemRow {
  item_id: string;
  item_name: string;
  supply_method: string;
  status: string;
  sales_uom: string | null;
}

function useProducibleItems() {
  return useQuery<{ rows: ItemRow[]; count: number }>({
    queryKey: ["master", "items", "PRODUCIBLE", "for-plan"],
    queryFn: async () => {
      const res = await fetch("/api/items?status=ACTIVE&limit=1000");
      if (!res.ok) throw new Error("Could not load items");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// BOM impact hook — lazy fetch for the inventory-impact panel inside the
// production item chip. Reuses the production-actual `open` endpoint, which
// returns the pinned BOM snapshot for an item. Disabled by default — only
// fetches when the user expands the panel.
// ---------------------------------------------------------------------------
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
      const body = (await res.json()) as BomImpactSnapshot | null;
      return body ?? null;
    },
    enabled: false,
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Week load segment — Zone B. One per day; height encodes total planned qty
// relative to week max. Color hints completion status (all done = success
// tint; any planned = warning tint).
// ---------------------------------------------------------------------------
function WeekLoadSegment({
  date,
  total,
  allDone,
  hasPlanned,
  maxVolume,
  isToday,
}: {
  date: Date;
  total: number;
  allDone: boolean;
  hasPlanned: boolean;
  maxVolume: number;
  isToday: boolean;
}) {
  const { dayName } = fmtDayHeader(date);
  const dayAbbrev = dayName.slice(0, 3);
  const fillPct = maxVolume > 0 ? Math.round((total / maxVolume) * 80) : 0;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-end overflow-hidden rounded-sm h-[52px]",
        "bg-bg-subtle border border-border/40 transition-all duration-150",
        isToday ? "ring-1 ring-accent/50 border-accent/40" : "",
      )}
      data-testid="week-load-segment"
    >
      {/* Fill bar */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 transition-all duration-500",
          allDone ? "bg-success/30" : hasPlanned ? "bg-warning/25" : "",
        )}
        style={{ height: `${fillPct}%` }}
        aria-hidden
      />
      <div className="relative z-[1] flex w-full flex-col items-center gap-0.5 px-1 pb-1.5">
        <span
          className={cn(
            "text-[9px] font-semibold uppercase tracking-sops leading-none",
            isToday ? "text-accent" : "text-fg-muted",
          )}
        >
          {dayAbbrev}
        </span>
        {total > 0 && (
          <span className="text-[11px] font-semibold tabular-nums leading-none text-fg-strong">
            {total >= 1000
              ? `${(total / 1000).toFixed(1)}k`
              : total % 1 === 0
                ? total.toFixed(0)
                : total.toFixed(1)}
          </span>
        )}
      </div>
      {isToday && (
        <span
          aria-hidden
          className="absolute top-1.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-accent today-pill-pulse"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Production item chip — replaces PlanRowCard. Compact card optimised for
// 7-column board layout. Includes inline action buttons, source badge,
// optional inventory-impact disclosure panel, and variance summary on done.
// ---------------------------------------------------------------------------
function ProductionItemChip({
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
  const [impactOpen, setImpactOpen] = useState(false);

  const bomQuery = useBomImpact(impactOpen ? plan.item_id : null);

  function toggleImpact() {
    setImpactOpen((v) => !v);
    if (!impactOpen) {
      void bomQuery.refetch();
    }
  }

  // Compute projected RM consumption for the inventory-impact panel.
  const rmLines = useMemo(() => {
    if (!bomQuery.data) return [];
    const snap = bomQuery.data;
    const outputQty = parseFloat(snap.bom_final_output_qty);
    if (!Number.isFinite(outputQty) || outputQty <= 0) return [];
    const plannedQty = parseFloat(plan.planned_qty);
    if (!Number.isFinite(plannedQty) || plannedQty <= 0) return [];
    const multiplier = plannedQty / outputQty;
    return snap.bom_lines.map((line) => ({
      name: line.component_name,
      required: parseFloat(line.final_component_qty) * multiplier,
      uom: line.component_uom ?? "",
    }));
  }, [bomQuery.data, plan.planned_qty]);

  return (
    <div
      className={cn(
        "rounded border pl-3 pr-2 py-2 transition-colors duration-150",
        "border-l-[3px]",
        isLive && "border-l-warning bg-warning-softer/30 border-warning/20",
        isDone && "border-l-success bg-success-softer/40 border-success/20",
        isCancelled && "border-l-border/50 bg-bg-subtle/30 border-border/30 opacity-70",
      )}
      data-testid="production-item-chip"
      data-plan-id={plan.plan_id}
      data-rendered-state={plan.rendered_state}
    >
      <div className="flex items-start gap-2">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Item name */}
          <div
            className={cn(
              "text-sm font-medium leading-tight truncate",
              isCancelled ? "line-through text-fg-muted" : "text-fg-strong",
            )}
            title={plan.item_id}
          >
            {plan.item_name ?? plan.item_id}
          </div>

          {/* Quantity — large, primary data */}
          <div
            className={cn(
              "mt-1 text-xl font-semibold tabular-nums leading-none tracking-tightish",
              isLive && "text-warning-fg",
              isDone && "text-success-fg",
              isCancelled && "text-fg-muted",
            )}
          >
            {fmtQty(plan.planned_qty, plan.uom)}
          </div>

          {/* Source + actions row */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {/* Source badge */}
            {plan.source_recommendation_id ? (
              <span className="chip chip-accent gap-1 text-[10px]">
                <Sparkles className="h-2 w-2" strokeWidth={2.5} />
                Rec
              </span>
            ) : (
              <span className="chip gap-1 text-[10px]">
                <Pencil className="h-2 w-2" strokeWidth={2.5} />
                Manual
              </span>
            )}

            {/* Inventory impact toggle (hidden on cancelled) */}
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
                data-testid="chip-impact-toggle"
              >
                {impactOpen ? (
                  <ChevronUp className="h-2 w-2" strokeWidth={2.5} />
                ) : (
                  <ChevronDown className="h-2 w-2" strokeWidth={2.5} />
                )}
                Impact
              </button>
            )}

            {/* Done variance mini-badge */}
            {isDone && plan.completed_actual && (() => {
              const ca = plan.completed_actual;
              const sign = computeVarianceSign(ca.variance_qty, plan.planned_qty);
              const tone = sign === "on_target" ? "success" : "warning";
              return (
                <Badge tone={tone} variant="soft">
                  {fmtVarianceQty(ca.variance_qty)} ({fmtVariancePct(ca.variance_pct)})
                </Badge>
              );
            })()}

            {/* Cancelled reason mini */}
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

        {/* Right column: status icon + actions */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {/* Status icon */}
          <div className="pt-0.5">
            {isLive && <Clock className="h-3.5 w-3.5 text-warning" strokeWidth={2} />}
            {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-success" strokeWidth={2} />}
            {isCancelled && <Ban className="h-3.5 w-3.5 text-fg-faint" strokeWidth={2} />}
          </div>

          {/* Action buttons — only when live + canAct */}
          {canAct && isLive && (
            <div className="flex flex-col gap-1 items-end">
              {isToday && (
                <Link
                  href={`/ops/stock/production-actual?from_plan_id=${encodeURIComponent(plan.plan_id)}`}
                  className="btn btn-primary btn-xs gap-1"
                  title="Report actual production — this marks the plan complete and writes inventory"
                >
                  <Factory className="h-2.5 w-2.5" strokeWidth={2.5} />
                  Report
                </Link>
              )}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs gap-1"
                  onClick={() => onEdit(plan)}
                  data-testid="plan-row-edit"
                  title="Edit plan"
                  aria-label="Edit plan"
                >
                  <Pencil className="h-2.5 w-2.5" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs gap-1 text-danger"
                  onClick={() => onCancel(plan)}
                  data-testid="plan-row-cancel"
                  title="Cancel plan"
                  aria-label="Cancel plan"
                >
                  <Ban className="h-2.5 w-2.5" strokeWidth={2.5} />
                </button>
                {!isToday && (
                  <Link
                    href={`/ops/stock/production-actual?from_plan_id=${encodeURIComponent(plan.plan_id)}`}
                    className="btn btn-ghost btn-xs gap-1 text-accent"
                    title="Report production"
                    data-testid="plan-row-report"
                    aria-label="Report production"
                  >
                    <Factory className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Done: link to submission */}
          {isDone && plan.completed_actual && (
            <Link
              href={`/ops/stock/production-actual?submission_id=${plan.completed_actual.submission_id}`}
              className="text-[10px] text-accent hover:underline"
              title="View production report"
            >
              View report →
            </Link>
          )}
        </div>
      </div>

      {/* Inventory impact panel — expandable */}
      {impactOpen && (
        <div
          className="mt-2 rounded border border-info/30 bg-info-softer/20 p-2.5 space-y-2"
          data-testid="impact-panel"
        >
          {/* FG output */}
          <div className="flex items-center gap-2 rounded border border-success/30 bg-success-softer/50 px-2.5 py-1.5">
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

          {/* RM requirements */}
          {bomQuery.isLoading ? (
            <div className="space-y-1">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-5 w-full animate-pulse rounded bg-bg-subtle"
                />
              ))}
            </div>
          ) : bomQuery.isError || (!bomQuery.data && !bomQuery.isLoading) ? (
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
                        {" "}
                        {line.uom}
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

      {/* Done full variance block — detailed breakdown */}
      {isDone && plan.completed_actual && (() => {
        const ca = plan.completed_actual;
        const sign = computeVarianceSign(ca.variance_qty, plan.planned_qty);
        const tone = sign === "on_target" ? "success" : "warning";
        return (
          <div
            className="mt-2 rounded border border-success/30 bg-success-softer/40 p-2 text-xs"
            data-testid="plan-row-variance"
            data-variance-sign={sign}
          >
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted"
              title={VARIANCE_TOOLTIP}
            >
              <span>
                Plan:{" "}
                <span className="font-mono tabular-nums text-fg-strong">
                  {fmtQty(plan.planned_qty, plan.uom)}
                </span>
              </span>
              <span>
                Output:{" "}
                <span className="font-mono tabular-nums text-fg-strong">
                  {fmtQty(ca.output_qty, ca.output_uom)}
                </span>
              </span>
              <span className="font-mono tabular-nums">
                <span
                  className={
                    sign === "on_target" ? "text-success-fg" : "text-warning-fg"
                  }
                >
                  {fmtVarianceQty(ca.variance_qty)} {ca.output_uom} (
                  {fmtVariancePct(ca.variance_pct)})
                </span>
              </span>
              <Badge tone={tone} variant="soft">
                {VARIANCE_SIGN_LABEL[sign]}
              </Badge>
            </div>
          </div>
        );
      })()}

      {/* Notes */}
      {plan.notes && (
        <div className="mt-1.5 text-[10px] text-fg-muted">
          <span className="font-medium">Notes: </span>
          {plan.notes}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day card — building block of the week view. Always-visible (no accordion).
// Shows date header + plan chips + add button.
// ---------------------------------------------------------------------------
function DayCard({
  date,
  plans,
  canAct,
  onAdd,
  onEdit,
  onCancel,
}: {
  date: Date;
  plans: ProductionPlanRow[];
  canAct: boolean;
  onAdd: (date: Date) => void;
  onEdit: (p: ProductionPlanRow) => void;
  onCancel: (p: ProductionPlanRow) => void;
}) {
  const { dayName, dateLabel } = fmtDayHeader(date);
  const isToday = toIsoDate(date) === toIsoDate(new Date());
  const isPast = date < new Date() && !isToday;
  const plannedOnPast = isPast && plans.some((p) => p.rendered_state === "planned");

  return (
    <div
      dir="ltr"
      className={cn(
        "relative flex flex-col rounded-lg border bg-bg-raised shadow-raised transition-shadow duration-150 min-h-[160px]",
        isToday
          ? "border-l-[3px] border-l-accent border-accent/50"
          : plannedOnPast
            ? "border-l-[3px] border-l-danger border-danger/30"
            : "border-border/60",
        !isToday && isPast && !plannedOnPast && "opacity-80",
      )}
      data-testid="day-card"
      data-date={toIsoDate(date)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2 border-b border-border/40">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "text-sm font-semibold",
              isToday ? "text-accent" : isPast ? "text-fg-muted" : "text-fg-strong",
            )}
          >
            {dayName}
          </span>
          <span className="text-[11px] text-fg-muted tabular-nums">{dateLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {isToday && (
            <Badge tone="accent" variant="soft">
              Today
            </Badge>
          )}
          {plannedOnPast && (
            <Badge tone="danger" variant="soft">
              Overdue
            </Badge>
          )}
          {plans.length > 0 && (
            <span className="text-[9px] font-semibold uppercase tracking-sops text-fg-faint">
              {plans.length}
            </span>
          )}
        </div>
      </div>

      {/* Body — plan chips */}
      <div className="flex flex-col gap-1.5 p-2 flex-1">
        {plans.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-4 text-center flex-1">
            <div className="h-6 w-6 rounded-full bg-bg-muted flex items-center justify-center">
              <Plus className="h-3 w-3 text-fg-faint" strokeWidth={2} />
            </div>
            <span className="text-[10px] text-fg-faint">No production</span>
            {canAct && (
              <button
                type="button"
                className="btn btn-ghost btn-xs gap-1 text-fg-subtle hover:text-fg"
                onClick={() => onAdd(date)}
                data-testid="day-card-add"
              >
                Add
              </button>
            )}
          </div>
        ) : (
          plans.map((p) => (
            <ProductionItemChip
              key={p.plan_id}
              plan={p}
              canAct={canAct}
              isToday={isToday}
              onEdit={onEdit}
              onCancel={onCancel}
            />
          ))
        )}
      </div>

      {/* Footer — add button when day already has plans */}
      {canAct && plans.length > 0 && (
        <div className="px-2 pb-2">
          <button
            type="button"
            className="btn btn-ghost btn-xs w-full gap-1 text-fg-subtle hover:text-fg"
            onClick={() => onAdd(date)}
            data-testid="day-card-add"
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual add modal
// ---------------------------------------------------------------------------
function ManualAddModal({
  defaultDate,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  defaultDate: string;
  onClose: () => void;
  onSubmit: (req: {
    plan_date: string;
    item_id: string;
    planned_qty: number;
    uom: string;
    notes?: string;
  }) => void;
  isSubmitting: boolean;
}) {
  const itemsQuery = useProducibleItems();
  const [planDate, setPlanDate] = useState(defaultDate);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [uom, setUom] = useState("");
  const [notes, setNotes] = useState("");

  const producibleItems = useMemo(() => {
    const rows = itemsQuery.data?.rows ?? [];
    return rows
      .filter(
        (r) =>
          r.supply_method === "MANUFACTURED" || r.supply_method === "REPACK",
      )
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
  }, [itemsQuery.data]);

  function handleItemChange(id: string) {
    setItemId(id);
    const item = producibleItems.find((r) => r.item_id === id);
    if (item?.sales_uom && !uom) setUom(item.sales_uom);
  }

  const canSubmit =
    planDate && itemId && parseFloat(qty) > 0 && uom && !isSubmitting;

  return (
    <div
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      data-testid="manual-add-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-fg-strong">
          Add production manually
        </h2>
        <p className="mt-1 text-3xs text-fg-muted">
          Planned only — inventory will not change until actual production is
          reported.
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            onSubmit({
              plan_date: planDate,
              item_id: itemId,
              planned_qty: parseFloat(qty),
              uom,
              notes: notes.trim() ? notes.trim() : undefined,
            });
          }}
        >
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Production day *
            </span>
            <input
              type="date"
              className="input"
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Product *
            </span>
            <select
              className="input"
              value={itemId}
              onChange={(e) => handleItemChange(e.target.value)}
              disabled={itemsQuery.isLoading}
              required
            >
              <option value="">— select a product —</option>
              <optgroup label="Manufactured">
                {producibleItems
                  .filter((r) => r.supply_method === "MANUFACTURED")
                  .map((r) => (
                    <option key={r.item_id} value={r.item_id}>
                      {r.item_name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Repack">
                {producibleItems
                  .filter((r) => r.supply_method === "REPACK")
                  .map((r) => (
                    <option key={r.item_id} value={r.item_id}>
                      {r.item_name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Planned quantity *
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="input"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                aria-describedby={
                  qty && !(parseFloat(qty) > 0) ? "manual-add-qty-hint" : undefined
                }
                aria-invalid={qty && !(parseFloat(qty) > 0) ? true : undefined}
                required
              />
              {qty && !(parseFloat(qty) > 0) ? (
                <p
                  id="manual-add-qty-hint"
                  className="mt-1 text-3xs text-warning-fg"
                  data-testid="manual-add-qty-hint"
                >
                  Enter a positive quantity (greater than 0).
                </p>
              ) : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Unit of measure *
              </span>
              <input
                className="input"
                value={uom}
                onChange={(e) => setUom(e.target.value)}
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Notes
            </span>
            <textarea
              rows={2}
              className="input min-h-[3rem]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this plan"
            />
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={!canSubmit}
              data-testid="manual-add-submit"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
              {isSubmitting ? "Saving…" : "Add to plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add from Recommendations modal — picker over W1's recommendation-candidates
// endpoint. Shows approved + production-type recs from completed planning runs
// not yet linked to any production_plan row.
// ---------------------------------------------------------------------------
function fmtRecQty(s: string, uom: string | null): string {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return uom ? `${s} ${uom}` : s;
  const formatted = Number.isInteger(n)
    ? n.toFixed(0)
    : n.toFixed(2).replace(/\.?0+$/, "");
  return uom ? `${formatted} ${uom}` : formatted;
}

function fmtRunExecutedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtFeasibilityLabel(status: string): string {
  switch (status) {
    case "ready_now":
      return "Ready to produce";
    case "blocked_missing_bom":
      return "Blocked — missing BOM";
    case "blocked_missing_components":
      return "Blocked — missing components";
    case "blocked_inactive_item":
      return "Blocked — inactive item";
    case "blocked_inactive_bom":
      return "Blocked — inactive BOM";
    default:
      return status;
  }
}

function AddFromRecommendationsModal({
  defaultDate,
  onClose,
  onConfirm,
  isSubmitting,
}: {
  defaultDate: string;
  onClose: () => void;
  onConfirm: (rec: RecommendationCandidate) => void;
  isSubmitting: boolean;
}) {
  const [filterDate, setFilterDate] = useState<string>("");
  const [selectedRecId, setSelectedRecId] = useState<string | null>(null);

  const candidatesQuery = useRecommendationCandidates({
    date: filterDate || undefined,
    pageSize: 200,
  });

  const rows: RecommendationCandidate[] = candidatesQuery.data?.rows ?? [];
  const total = candidatesQuery.data?.total ?? 0;

  const selectedRec =
    rows.find((r) => r.recommendation_id === selectedRecId) ?? null;

  const canSubmit = !!selectedRec && !isSubmitting;

  return (
    <div
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      data-testid="add-from-recs-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-fg-strong">
              Add from production recommendations
            </h2>
            <p className="mt-1 text-3xs text-fg-muted">
              Approved production recommendations from completed planning runs
              that are not yet on the plan. Selecting one creates a new plan row
              linked back to the recommendation.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={onClose}
            disabled={isSubmitting}
            title="Close"
          >
            <XCircle className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>

        {/* Optional date filter */}
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Filter by target date (optional)
            </span>
            <input
              type="date"
              className="input"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              data-testid="add-from-recs-date-filter"
            />
          </label>
          {filterDate ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setFilterDate("")}
            >
              Clear filter
            </button>
          ) : null}
          <div className="ml-auto text-3xs text-fg-muted">
            Default suggested day:{" "}
            <span className="font-mono tabular-nums">{defaultDate}</span>
          </div>
        </div>

        {/* Body — exactly one of loading | error | empty | list. */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded border border-border/60 bg-bg-subtle/30">
          {candidatesQuery.isLoading ? (
            <div
              className="space-y-2 p-3"
              aria-busy="true"
              aria-live="polite"
              data-testid="add-from-recs-loading"
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 w-full animate-pulse rounded-md bg-bg-subtle"
                />
              ))}
            </div>
          ) : candidatesQuery.isError ? (
            <div
              className="m-3 rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg"
              data-testid="add-from-recs-error"
            >
              <div className="font-semibold">
                We couldn&apos;t load production recommendations.
              </div>
              <div className="mt-1 text-3xs">
                Try again in a moment. If the problem continues, contact the
                system administrator.
              </div>
              <button
                type="button"
                onClick={() => void candidatesQuery.refetch()}
                className="mt-2 text-3xs font-medium underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div
              className="p-6 text-center"
              data-testid="add-from-recs-empty"
            >
              <Sparkles
                className="mx-auto h-8 w-8 text-fg-faint"
                strokeWidth={1.5}
              />
              <div className="mt-2 text-sm font-medium text-fg-strong">
                No production recommendations available to add.
              </div>
              <div className="mt-1 text-3xs text-fg-muted">
                They appear here when planning runs approve them. Open the
                planning run review screen to approve recommendations first.
              </div>
              <Link
                href="/planning/runs"
                className="btn btn-sm mt-3 gap-1.5"
              >
                Open planning runs
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            </div>
          ) : (
            <ul
              className="divide-y divide-border/60"
              role="radiogroup"
              aria-label="Approved production recommendations"
              data-testid="add-from-recs-list"
            >
              {rows.map((rec) => {
                const selected = rec.recommendation_id === selectedRecId;
                const supersededRun = rec.run_status !== "completed";
                return (
                  <li key={rec.recommendation_id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSelectedRecId(rec.recommendation_id)}
                      className={cn(
                        "flex w-full flex-col gap-1.5 px-3 py-3 text-left transition-colors",
                        "hover:bg-bg-subtle/60",
                        selected && "bg-info-softer/60 ring-1 ring-info/40 ring-inset",
                      )}
                      data-testid="add-from-recs-row"
                      data-rec-id={rec.recommendation_id}
                      data-selected={selected ? "true" : "false"}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-fg-strong">
                            {rec.item_display_name ?? rec.item_id}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-3xs text-fg-muted">
                            <span>
                              <span className="text-fg-faint">Suggested qty: </span>
                              <span className="font-mono tabular-nums font-semibold text-fg-strong">
                                {fmtRecQty(rec.suggested_qty, rec.uom)}
                              </span>
                            </span>
                            <span>
                              <span className="text-fg-faint">Target date: </span>
                              <span className="font-mono tabular-nums">
                                {rec.suggested_for_date}
                              </span>
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {rec.feasibility_status === "ready_now" ? (
                            <Badge tone="success" variant="soft" dotted>
                              {fmtFeasibilityLabel(rec.feasibility_status)}
                            </Badge>
                          ) : (
                            <Badge tone="warning" variant="soft" dotted>
                              {fmtFeasibilityLabel(rec.feasibility_status)}
                            </Badge>
                          )}
                          {rec.item_supply_method ? (
                            <span className="text-3xs text-fg-faint">
                              {rec.item_supply_method === "MANUFACTURED"
                                ? "Manufactured"
                                : rec.item_supply_method === "REPACK"
                                  ? "Repack"
                                  : rec.item_supply_method}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-3xs text-fg-muted">
                        <span>
                          <span className="text-fg-faint">From planning run: </span>
                          {fmtRunExecutedAt(rec.run_executed_at)}
                        </span>
                        {supersededRun ? (
                          <Badge tone="warning" variant="soft">
                            Superseded run
                          </Badge>
                        ) : null}
                        {rec.approved_at ? (
                          <span className="text-fg-faint">
                            · Approved {fmtRunExecutedAt(rec.approved_at)}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer — total + actions */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-3xs text-fg-muted">
            {candidatesQuery.isSuccess
              ? `${total} recommendation${total === 1 ? "" : "s"} available`
              : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm gap-1.5"
              onClick={() => {
                if (selectedRec) onConfirm(selectedRec);
              }}
              disabled={!canSubmit}
              data-testid="add-from-recs-confirm"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
              {isSubmitting ? "Adding…" : "Add to plan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------
function EditModal({
  plan,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  plan: ProductionPlanRow;
  onClose: () => void;
  onSubmit: (body: {
    plan_date?: string;
    planned_qty?: number;
    uom?: string;
    notes?: string;
  }) => void;
  isSubmitting: boolean;
}) {
  const [planDate, setPlanDate] = useState(plan.plan_date);
  const [qty, setQty] = useState(plan.planned_qty);
  const [uom, setUom] = useState(plan.uom);
  const [notes, setNotes] = useState(plan.notes ?? "");

  return (
    <div
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      data-testid="edit-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-fg-strong">Edit plan</h2>
        <p className="mt-1 text-3xs text-fg-muted">
          {plan.item_name ?? plan.item_id}
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const body: {
              plan_date?: string;
              planned_qty?: number;
              uom?: string;
              notes?: string;
            } = {};
            if (planDate !== plan.plan_date) body.plan_date = planDate;
            if (qty !== plan.planned_qty) body.planned_qty = parseFloat(qty);
            if (uom !== plan.uom) body.uom = uom;
            if (notes !== (plan.notes ?? "")) body.notes = notes;
            onSubmit(body);
          }}
        >
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Production day
            </span>
            <input
              type="date"
              className="input"
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Planned quantity
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="input"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Unit of measure
              </span>
              <input
                className="input"
                value={uom}
                onChange={(e) => setUom(e.target.value)}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Notes
            </span>
            <textarea
              rows={2}
              className="input min-h-[3rem]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isSubmitting}
              data-testid="edit-submit"
            >
              {isSubmitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cancel confirm modal
// ---------------------------------------------------------------------------
function CancelModal({
  plan,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  plan: ProductionPlanRow;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState("");

  return (
    <div
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      data-testid="cancel-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-fg-strong">Cancel plan</h2>
        <p className="mt-1 text-3xs text-fg-muted">
          {plan.item_name ?? plan.item_id} ·{" "}
          {fmtQty(plan.planned_qty, plan.uom)}
        </p>

        <div className="mt-3 rounded border border-warning/30 bg-warning-softer/30 p-3 text-xs text-warning-fg">
          <span className="font-medium">Heads up: </span>
          Cancelling a plan does not change inventory. It only removes the row
          from the production board.
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length === 0) return;
            onSubmit(reason.trim());
          }}
        >
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Reason for cancellation *
            </span>
            <textarea
              rows={3}
              className="input min-h-[4rem]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. schedule change, raw material shortage, demand updated"
              required
            />
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Back
            </button>
            <button
              type="submit"
              className="btn btn-sm gap-1.5 text-danger"
              disabled={!reason.trim() || isSubmitting}
              data-testid="cancel-submit"
            >
              <Ban className="h-3 w-3" strokeWidth={2.5} />
              {isSubmitting ? "Cancelling…" : "Cancel plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast (success/error feedback)
// ---------------------------------------------------------------------------
function Toast({
  kind,
  message,
  onClose,
}: {
  kind: "success" | "error";
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      dir="ltr"
      className={cn(
        "fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-md rounded-md border px-4 py-3 text-sm shadow-lg",
        kind === "success"
          ? "border-success/40 bg-success-softer text-success-fg"
          : "border-danger/40 bg-danger-softer text-danger-fg",
      )}
      role="status"
      data-testid="production-plan-toast"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {kind === "success" ? (
            <CheckCircle2
              className="h-4 w-4 shrink-0 mt-0.5"
              strokeWidth={2}
            />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} />
          )}
          <span>{message}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-3xs underline hover:no-underline"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ProductionPlanPage() {
  const { session } = useSession();
  const canAct = session.role === "planner" || session.role === "admin";

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 6);

  // Modal state
  const [showManualAdd, setShowManualAdd] = useState<{
    defaultDate: string;
  } | null>(null);
  const [showAddFromRecs, setShowAddFromRecs] = useState<{
    defaultDate: string;
  } | null>(null);
  const [editingPlan, setEditingPlan] = useState<ProductionPlanRow | null>(
    null,
  );
  const [cancellingPlan, setCancellingPlan] = useState<ProductionPlanRow | null>(
    null,
  );

  const [toast, setToast] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const plansQuery = usePlans(toIsoDate(weekStart), toIsoDate(weekEnd));
  const createMut = useCreatePlan();
  const patchMut = usePatchPlan();

  function flashToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 4500);
  }

  // Group plans by day. Computed only when data has loaded so we never
  // render misleading zero counts during loading/error states.
  const plansByDay = useMemo(() => {
    const out = new Map<string, ProductionPlanRow[]>();
    for (let i = 0; i < 7; i++) {
      out.set(toIsoDate(addDays(weekStart, i)), []);
    }
    for (const p of plansQuery.data?.rows ?? []) {
      const list = out.get(p.plan_date);
      if (list) list.push(p);
    }
    return out;
  }, [plansQuery.data, weekStart]);

  const hasData = plansQuery.data !== undefined && !plansQuery.isError;
  const allPlans = hasData ? plansQuery.data!.rows : [];
  const plannedCount = allPlans.filter((p) => p.rendered_state === "planned").length;
  const doneCount = allPlans.filter((p) => p.rendered_state === "done").length;
  const cancelledCount = allPlans.filter((p) => p.rendered_state === "cancelled").length;

  // Zone A computations — total volume, dominant UoM, completion percentage.
  const totalQty = allPlans
    .filter((p) => p.rendered_state !== "cancelled")
    .reduce((s, p) => s + (parseFloat(p.planned_qty) || 0), 0);
  const dominantUom = (() => {
    const uoms = allPlans
      .filter((p) => p.rendered_state !== "cancelled")
      .map((p) => p.uom);
    const first = uoms[0];
    return first && uoms.every((u) => u === first) ? first : "units";
  })();
  const completionPct =
    plannedCount + doneCount > 0
      ? Math.round((doneCount / (plannedCount + doneCount)) * 100)
      : 0;

  // Zone B computations — per-day totals + week max for relative scaling.
  const dayTotals = useMemo(() => {
    const out = new Map<
      string,
      { total: number; allDone: boolean; hasPlanned: boolean }
    >();
    for (let i = 0; i < 7; i++) {
      const iso = toIsoDate(addDays(weekStart, i));
      const plans = plansByDay.get(iso) ?? [];
      const total = plans
        .filter((p) => p.rendered_state !== "cancelled")
        .reduce((s, p) => s + (parseFloat(p.planned_qty) || 0), 0);
      const liveOrDone = plans.filter((p) => p.rendered_state !== "cancelled");
      const allDone =
        liveOrDone.length > 0 &&
        liveOrDone.every((p) => p.rendered_state === "done");
      const hasPlanned = plans.some((p) => p.rendered_state === "planned");
      out.set(iso, { total, allDone, hasPlanned });
    }
    return out;
  }, [plansByDay, weekStart]);

  const weekMaxVolume = useMemo(() => {
    let max = 0;
    dayTotals.forEach((d) => {
      if (d.total > max) max = d.total;
    });
    return max;
  }, [dayTotals]);

  function handleManualAdd(req: {
    plan_date: string;
    item_id: string;
    planned_qty: number;
    uom: string;
    notes?: string;
  }) {
    createMut.mutate(req, {
      onSuccess: () => {
        flashToast(
          "success",
          "Production added to the plan. Inventory has not changed.",
        );
        setShowManualAdd(null);
      },
      onError: (err) => {
        flashToast("error", err.message);
      },
    });
  }

  function handleAddFromRec(rec: RecommendationCandidate) {
    const qty = parseFloat(rec.suggested_qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      flashToast(
        "error",
        "This recommendation has an invalid quantity. Please contact the system administrator.",
      );
      return;
    }
    if (!rec.uom) {
      flashToast(
        "error",
        "This recommendation is missing a unit of measure. Open the planning run to investigate.",
      );
      return;
    }
    createMut.mutate(
      {
        plan_date: rec.suggested_for_date,
        item_id: rec.item_id,
        planned_qty: qty,
        uom: rec.uom,
        source_recommendation_id: rec.recommendation_id,
      },
      {
        onSuccess: () => {
          flashToast("success", "Plan added from recommendation.");
          setShowAddFromRecs(null);
        },
        onError: (err) => {
          flashToast("error", err.message);
        },
      },
    );
  }

  function handleEdit(body: {
    plan_date?: string;
    planned_qty?: number;
    uom?: string;
    notes?: string;
  }) {
    if (!editingPlan) return;
    if (Object.keys(body).length === 0) {
      setEditingPlan(null);
      return;
    }
    patchMut.mutate(
      { plan_id: editingPlan.plan_id, body },
      {
        onSuccess: () => {
          flashToast("success", "Plan updated.");
          setEditingPlan(null);
        },
        onError: (err) => {
          flashToast("error", err.message);
        },
      },
    );
  }

  function handleCancel(reason: string) {
    if (!cancellingPlan) return;
    patchMut.mutate(
      {
        plan_id: cancellingPlan.plan_id,
        body: { action: "cancel", cancel_reason: reason },
      },
      {
        onSuccess: () => {
          flashToast(
            "success",
            "Plan cancelled. Inventory has not changed.",
          );
          setCancellingPlan(null);
        },
        onError: (err) => {
          flashToast("error", err.message);
        },
      },
    );
  }

  return (
    <div dir="ltr">
      <WorkflowHeader
        eyebrow="Planning workspace"
        title="Production plan"
        description="Plan production for the week. Inventory updates only when actuals are reported."
        actions={
          canAct ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-sm gap-1.5"
                onClick={() =>
                  setShowAddFromRecs({ defaultDate: toIsoDate(new Date()) })
                }
                title="Pick from approved production recommendations"
                data-testid="header-add-from-recs"
              >
                <Sparkles className="h-3 w-3" strokeWidth={2.5} />
                Add from recommendations
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                onClick={() =>
                  setShowManualAdd({ defaultDate: toIsoDate(new Date()) })
                }
                data-testid="header-add-manual"
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                Add production
              </button>
            </div>
          ) : null
        }
      />

      {/* Navigation context strip — sibling pages in the planning workspace */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-fg-muted">
        <Link
          href="/planning/runs"
          className="hover:text-fg transition-colors flex items-center gap-1"
        >
          <PlayCircle className="h-3 w-3" strokeWidth={2} />
          Planning runs
        </Link>
        <span className="text-fg-faint" aria-hidden>·</span>
        <Link
          href="/planning/inventory-flow"
          className="hover:text-fg transition-colors flex items-center gap-1"
        >
          <Boxes className="h-3 w-3" strokeWidth={2} />
          Inventory flow
        </Link>
        <span className="text-fg-faint" aria-hidden>·</span>
        <Link
          href="/ops/stock/production-actual"
          className="hover:text-fg transition-colors flex items-center gap-1"
        >
          <Factory className="h-3 w-3" strokeWidth={2} />
          Report production
        </Link>
      </div>

      {/* Locked-principle banner — quiet, non-dismissible info note. */}
      <div
        className="mb-4 rounded-md border border-info/30 bg-info-softer/40 px-3 py-2 text-xs text-info-fg"
        role="note"
        data-testid="planned-only-banner"
      >
        <span className="font-medium">Planned only.</span>{" "}
        Inventory updates only after actuals are reported in the production
        report.
      </div>

      {/* Zone A — KPI hero band. Renders only when data has loaded so the
          page never claims "0 planned" while an error is showing. */}
      {hasData && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {/* Planned */}
          <div
            className="kpi-microcard"
            style={{ ["--kpi-accent" as string]: "var(--warning)" }}
          >
            <span className="text-[22px] font-semibold tabular-nums leading-none tracking-tightish text-fg-strong">
              {plannedCount}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-sops leading-none text-fg-muted mt-0.5">
              Planned
            </span>
          </div>
          {/* Completed */}
          <div
            className="kpi-microcard"
            style={{ ["--kpi-accent" as string]: "var(--success)" }}
          >
            <span className="text-[22px] font-semibold tabular-nums leading-none tracking-tightish text-success-fg">
              {doneCount}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-sops leading-none text-fg-muted mt-0.5">
              Completed
            </span>
          </div>
          {/* Total volume */}
          <div
            className="kpi-microcard"
            style={{ ["--kpi-accent" as string]: "var(--accent)" }}
          >
            <span className="text-[22px] font-semibold tabular-nums leading-none tracking-tightish text-fg-strong">
              {totalQty % 1 === 0 ? totalQty.toFixed(0) : totalQty.toFixed(1)}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-sops leading-none text-fg-muted mt-0.5">
              {dominantUom} total
            </span>
          </div>
          {/* Completion % */}
          <div
            className="kpi-microcard"
            style={{ ["--kpi-accent" as string]: "var(--info)" }}
          >
            <span className="text-[22px] font-semibold tabular-nums leading-none tracking-tightish text-fg-strong">
              {completionPct}%
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-sops leading-none text-fg-muted mt-0.5">
              Done
            </span>
          </div>
        </div>
      )}

      {/* Week navigation — centered week label, prev/next arrows, This Week. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm gap-1"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            title="Previous week"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-3 w-3" strokeWidth={2} />
            Previous
          </button>
          <button
            type="button"
            className="btn btn-sm gap-1"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            title="Next week"
            aria-label="Next week"
          >
            Next
            <ChevronRight className="h-3 w-3" strokeWidth={2} />
          </button>
        </div>
        <div className="text-sm font-semibold text-fg-strong tabular-nums">
          {fmtWeekRange(weekStart, weekEnd)}
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setWeekStart(startOfWeek(new Date()))}
        >
          This week
        </button>
      </div>

      {/* Zone B — week load segment bar. 7-segment heatmap encoding daily
          planned volume relative to the week's max. */}
      {hasData && (
        <div
          className="mb-5 grid gap-1"
          style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
          aria-label="Week production load"
        >
          {Array.from({ length: 7 }).map((_, i) => {
            const date = addDays(weekStart, i);
            const iso = toIsoDate(date);
            const info = dayTotals.get(iso) ?? {
              total: 0,
              allDone: false,
              hasPlanned: false,
            };
            const isToday = iso === toIsoDate(new Date());
            return (
              <WeekLoadSegment
                key={iso}
                date={date}
                total={info.total}
                allDone={info.allDone}
                hasPlanned={info.hasPlanned}
                maxVolume={weekMaxVolume}
                isToday={isToday}
              />
            );
          })}
        </div>
      )}

      {/* State-hygiene rendering: exactly one of                          */}
      {/*   loading | error | empty | week-view                            */}
      {plansQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-[160px] w-full animate-pulse rounded-lg bg-bg-subtle"
              aria-busy="true"
              aria-live="polite"
            />
          ))}
        </div>
      ) : plansQuery.isError ? (
        (() => {
          const err = plansQuery.error;
          const category =
            err instanceof FetchError ? err.category : "other";
          const status = err instanceof FetchError ? err.status : null;
          let title = "We couldn't load the production plan.";
          let body =
            "Check your connection and try again. If the problem continues, contact the system administrator.";
          let primaryAction: { label: string; onClick: () => void } | null = {
            label: "Try again",
            onClick: () => void plansQuery.refetch(),
          };
          let secondary: { label: string; href: string } | null = null;
          if (category === "auth") {
            title = "Your session expired.";
            body = "Sign in again and reopen the production plan.";
            secondary = { label: "Sign in", href: "/login" };
            primaryAction = null;
          } else if (category === "permission") {
            title = "You don't have permission to view this plan.";
            body =
              "Ask an admin to grant you the planner or admin role, or go back to the dashboard.";
            secondary = { label: "Back to dashboard", href: "/dashboard" };
            primaryAction = null;
          } else if (category === "break_glass") {
            title = "The system is in read-only mode (break-glass).";
            body =
              "Reads are paused while admins resolve a critical condition. Try again in a few minutes.";
            secondary = {
              label: "Open integrations",
              href: "/admin/integrations#break-glass",
            };
          } else if (category === "server") {
            title = "The server hit an error while loading the plan.";
            body =
              "If a release was just deployed, wait 30 seconds and try again. Otherwise contact the system administrator.";
          } else if (category === "network") {
            title = "We couldn't reach the server.";
            body = "Check your network connection and try again.";
          }
          return (
            <SectionCard contentClassName="p-5">
              <div
                className="rounded border border-danger/30 bg-danger-softer p-4 text-sm text-danger-fg"
                data-testid="production-plan-error"
                data-error-category={category}
                data-error-status={status ?? "n/a"}
              >
                <div className="font-semibold">{title}</div>
                <div className="mt-1 text-xs">{body}</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {primaryAction ? (
                    <button
                      type="button"
                      onClick={primaryAction.onClick}
                      className="text-xs font-medium underline hover:no-underline"
                      data-testid="production-plan-error-retry"
                    >
                      {primaryAction.label}
                    </button>
                  ) : null}
                  {secondary ? (
                    <Link
                      href={secondary.href}
                      className="text-xs font-medium underline hover:no-underline"
                    >
                      {secondary.label}
                    </Link>
                  ) : null}
                  {status && status >= 500 ? (
                    <span className="ml-auto text-3xs text-fg-faint">
                      Reference: HTTP {status}
                    </span>
                  ) : null}
                </div>
              </div>
            </SectionCard>
          );
        })()
      ) : allPlans.length === 0 ? (
        <EmptyState
          title="No production planned for this week"
          description="Add a plan manually or pull one from approved production recommendations. Inventory will not change until actual production is reported."
          icon={
            <Calendar
              className="h-5 w-5 text-fg-faint"
              strokeWidth={1.5}
            />
          }
          action={
            canAct ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1.5"
                  onClick={() =>
                    setShowManualAdd({ defaultDate: toIsoDate(new Date()) })
                  }
                  data-testid="empty-state-add-manual"
                >
                  <Plus className="h-3 w-3" strokeWidth={2.5} />
                  Add production
                </button>
                <button
                  type="button"
                  className="btn btn-sm gap-1.5"
                  onClick={() =>
                    setShowAddFromRecs({ defaultDate: toIsoDate(new Date()) })
                  }
                  data-testid="empty-state-add-from-recs"
                >
                  <Sparkles className="h-3 w-3" strokeWidth={2.5} />
                  Add from recommendations
                </button>
              </>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Zone C — week view, 7 always-visible day cards */}
          <div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7"
            data-testid="production-plan-week"
          >
            {Array.from({ length: 7 }).map((_, i) => {
              const date = addDays(weekStart, i);
              const iso = toIsoDate(date);
              return (
                <DayCard
                  key={iso}
                  date={date}
                  plans={plansByDay.get(iso) ?? []}
                  canAct={canAct}
                  onAdd={(d) =>
                    setShowManualAdd({ defaultDate: toIsoDate(d) })
                  }
                  onEdit={setEditingPlan}
                  onCancel={setCancellingPlan}
                />
              );
            })}
          </div>

          {/* Zone D — week summary footer */}
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-bg-raised px-4 py-3 shadow-raised">
            {/* Progress bar */}
            <div className="flex flex-1 min-w-[160px] flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-sops text-fg-muted">
                  Week completion
                </span>
                <span className="text-xs font-semibold tabular-nums text-fg-strong">
                  {completionPct}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    completionPct >= 100
                      ? "bg-success"
                      : completionPct >= 50
                        ? "bg-accent"
                        : "bg-warning",
                  )}
                  style={{ width: `${Math.min(completionPct, 100)}%` }}
                  aria-hidden
                />
              </div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-border/50" aria-hidden />
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <span>
                <span className="font-semibold text-fg-strong tabular-nums">
                  {plannedCount}
                </span>{" "}
                planned
              </span>
              <span className="text-fg-faint">·</span>
              <span>
                <span className="font-semibold text-success-fg tabular-nums">
                  {doneCount}
                </span>{" "}
                completed
              </span>
              {cancelledCount > 0 && (
                <>
                  <span className="text-fg-faint">·</span>
                  <span>
                    <span className="font-semibold text-danger-fg tabular-nums">
                      {cancelledCount}
                    </span>{" "}
                    cancelled
                  </span>
                </>
              )}
            </div>
            <div className="hidden lg:flex items-center gap-2 ml-auto">
              <Link
                href="/planning/inventory-flow"
                className="text-xs text-accent hover:underline flex items-center gap-1"
              >
                View inventory impact
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {showManualAdd ? (
        <ManualAddModal
          defaultDate={showManualAdd.defaultDate}
          onClose={() => setShowManualAdd(null)}
          onSubmit={handleManualAdd}
          isSubmitting={createMut.isPending}
        />
      ) : null}

      {showAddFromRecs ? (
        <AddFromRecommendationsModal
          defaultDate={showAddFromRecs.defaultDate}
          onClose={() => setShowAddFromRecs(null)}
          onConfirm={handleAddFromRec}
          isSubmitting={createMut.isPending}
        />
      ) : null}

      {editingPlan ? (
        <EditModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSubmit={handleEdit}
          isSubmitting={patchMut.isPending}
        />
      ) : null}

      {cancellingPlan ? (
        <CancelModal
          plan={cancellingPlan}
          onClose={() => setCancellingPlan(null)}
          onSubmit={handleCancel}
          isSubmitting={patchMut.isPending}
        />
      ) : null}

      {toast ? (
        <Toast
          kind={toast.kind}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}

// Suppress unused-import warning for RenderedState — the type is re-exported
// implicitly through ProductionPlanRow.rendered_state usage above.
export type { RenderedState };
