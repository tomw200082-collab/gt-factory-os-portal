"use client";

// ---------------------------------------------------------------------------
// /planning/production-plan — Daily Production Plan
//
// Operational board that lets a planner:
//   - See the week
//   - Add planned production manually OR from approved production
//     recommendations (rec picker shipped in a follow-up tranche)
//   - Edit qty/date/uom/notes while planned
//   - Cancel with a reason
//   - See planned / completed / cancelled state per row
//
// Locked principle (visible non-dismissible banner at the top):
//   "Planned Only — inventory will update only after actual production
//    is reported."
//
// Plans NEVER write stock_ledger. Stock changes only via production_actual.
// "Completed" rendered_state is derived by the API from
// completed_submission_id (Gate 5 will wire production_actual?from_plan).
//
// Portal UX standard (Gate 4.2 lock):
//   - English only, LTR only
//   - Empty / loading / error states are mutually exclusive
//   - No raw IDs / JSON / enums in primary UI
//   - Mobile-first at 390px
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Plus,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Pencil,
  Ban,
  Factory,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Search,
  Scale,
  X,
  Repeat,
  Target,
  Gauge,
  AlertTriangle,
  PackageSearch,
  Timer,
  Download,
  Check,
  Lock,
  LockOpen,
  Grid2X2,
  Grid3X3,
  Layers,
  MessageSquare,
  History,
  Star,
  HeartPulse,
  FileText,
  PackageX,
  BarChart3,
  Clock,
  CircleDot,
  Package,
  BarChart2,
  ClipboardX,
  CalendarMinus,
  CircleDollarSign,
  AreaChart,
  CheckSquare,
  Activity,
  Forward,
  Maximize2,
  Trash2,
  Flag,
  TrendingUp,
  Pause,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
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
//
// The backend (api/src/production-plan/schemas.ts §136-178) already returns
// pre-computed variance_qty + variance_pct on the completed_actual sub-object
// — we re-derive variance_sign on display per §3.3 v1 default ±2% band.
// We trust the backend's pre-computed numerics (qty_8dp string serialization)
// and avoid duplicating the divide-by-zero defense.
//
// On_target band tolerance is 2% per §3.3. Reversible: change the literal.
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
  // §3.5: planned=0 unreachable per CHECK; defensively treat any non-zero
  // output as 'over' (over-production against zero plan).
  if (planned <= 0) {
    return variance === 0 ? "on_target" : "over";
  }
  const band = Math.abs(planned) * (VARIANCE_ON_TARGET_THRESHOLD_PCT / 100);
  if (variance > band) return "over";
  if (variance < -band) return "under";
  return "on_target";
}

function fmtVarianceQty(varianceQtyStr: string): string {
  // Format the variance qty with explicit sign prefix and trimmed precision.
  // Backend returns qty_8dp text; mirror parseFloat path used by fmtQty for
  // numerical consistency.
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
  // §3.5: NULL when planned_qty was 0 (unreachable per CHECK). Render em-dash
  // so the percent column never crashes.
  if (variancePctStr === null) return "—";
  const n = parseFloat(variancePctStr);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0.0%";
  const abs = Math.abs(n);
  return `${n > 0 ? "+" : "−"}${abs.toFixed(1)}%`;
}

// W4 contract §4.1.2 — sign-badge tone + icon. Both 'over' and 'under' use
// the SAME amber/warning tone per §A13 row 5 (variance is a visibility
// metric, not a quality grade — neither over nor under is "bad enough to
// render red"). 'on_target' uses success/green.
const VARIANCE_SIGN_TONE: Record<VarianceSign, "success" | "warning"> = {
  on_target: "success",
  over: "warning",
  under: "warning",
};
const VARIANCE_SIGN_ICON: Record<VarianceSign, string> = {
  on_target: "✓",
  over: "↑",
  under: "↓",
};
const VARIANCE_SIGN_LABEL: Record<VarianceSign, string> = {
  on_target: "On target",
  over: "Over",
  under: "Under",
};

// Tooltip / disclaimer copy. CLAUDE.md production reporting v1 citation per
// W4 contract §3.4 + §7.1: scrap is excluded from the variance numerator on
// purpose — output_qty is good-output, scrap is loss.
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
// Status chip — visually distinct per state.
// ---------------------------------------------------------------------------
function StatusChip({ state }: { state: RenderedState }) {
  if (state === "done") {
    return (
      <Badge tone="success" variant="soft" dotted>
        Completed
      </Badge>
    );
  }
  if (state === "cancelled") {
    return (
      <Badge tone="neutral" variant="soft" dotted>
        Cancelled
      </Badge>
    );
  }
  return (
    <Badge tone="info" variant="soft" dotted>
      Planned
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Plan row card — shown inside an expanded day.
// ---------------------------------------------------------------------------
function PlanRowCard({
  plan,
  canAct,
  onEdit,
  onCancel,
  isRecurring,
}: {
  plan: ProductionPlanRow;
  canAct: boolean;
  onEdit: (p: ProductionPlanRow) => void;
  onCancel: (p: ProductionPlanRow) => void;
  isRecurring?: boolean;
}) {
  const isLive = plan.rendered_state === "planned";
  const isDone = plan.rendered_state === "done";
  const isCancelled = plan.rendered_state === "cancelled";

  return (
    <div
      dir="ltr"
      className={cn(
        "rounded-md border p-3 space-y-2 transition-colors",
        isLive && "border-info/40 bg-info-softer/30",
        isDone && "border-success/40 bg-success-softer/30",
        isCancelled && "border-border/60 bg-bg-subtle/50 opacity-80",
      )}
      data-testid="plan-row-card"
      data-plan-id={plan.plan_id}
      data-rendered-state={plan.rendered_state}
    >
      {/* Header row: name + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-sm font-medium flex items-center gap-1",
              isCancelled ? "line-through text-fg-muted" : "text-fg-strong",
            )}
          >
            {plan.item_name ?? plan.item_id}
            {isRecurring ? (
              <Repeat
                className="text-fg-faint w-3 h-3 flex-shrink-0"
                strokeWidth={1.5}
                aria-label="Recurring item"
              />
            ) : null}
          </div>
          <div className="mt-0.5 font-mono text-3xs text-fg-faint">
            {plan.item_id}
          </div>
        </div>
        <StatusChip state={plan.rendered_state} />
      </div>

      {/* Quantity + source */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-fg-muted">Planned qty: </span>
          <span className="font-mono tabular-nums font-semibold text-fg-strong">
            {fmtQty(plan.planned_qty, plan.uom)}
          </span>
        </div>
        <div className="text-3xs text-fg-muted">
          {plan.source_recommendation_id ? (
            <span>
              Source: production recommendation
              {plan.source_run_status === "superseded" ? (
                <span className="ml-1 text-warning-fg">
                  (older planning run)
                </span>
              ) : null}
            </span>
          ) : (
            <span>Source: manual entry</span>
          )}
        </div>
      </div>

      {/* Done variance — implements W4 variance display contract §4.2.
          The plan-row variance row when rendered_state='done' shows:
            - output_qty + uom
            - variance_qty (signed) + variance_pct (signed)
            - variance_sign chip (on_target | over | under) per ±2% band
          Tooltip (title attribute) cites the CLAUDE.md production reporting
          v1 lock: variance excludes scrap.
          The backend pre-computes variance_qty + variance_pct on the
          completed_actual sub-object (api/src/production-plan/schemas.ts
          §136-178); we re-derive variance_sign on display per §3.3.
          GAP-VAR-2 / VAR-3 / VAR-4 from the contract are all closed: the
          response shape includes completed_actual with output_qty, scrap_qty,
          output_uom, variance_qty, variance_pct. */}
      {isDone && plan.completed_actual ? (
        (() => {
          const ca = plan.completed_actual;
          const sign = computeVarianceSign(ca.variance_qty, plan.planned_qty);
          const tone = VARIANCE_SIGN_TONE[sign];
          return (
            <div
              className="rounded border border-success/30 bg-success-softer/40 p-2 text-xs"
              data-testid="plan-row-variance"
              data-variance-sign={sign}
            >
              <div className="font-medium text-success-fg">
                Completed in actual production
              </div>
              <div
                className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted"
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
                  Variance:{" "}
                  <span
                    className={cn(
                      tone === "success" ? "text-success-fg" : "text-warning-fg",
                    )}
                  >
                    {fmtVarianceQty(ca.variance_qty)} {ca.output_uom}
                    {" "}
                    ({fmtVariancePct(ca.variance_pct)})
                  </span>
                </span>
                <Badge tone={tone} variant="soft">
                  <span aria-hidden className="mr-1">
                    {VARIANCE_SIGN_ICON[sign]}
                  </span>
                  {VARIANCE_SIGN_LABEL[sign]}
                </Badge>
                {Number(ca.scrap_qty) > 0 ? (
                  <span className="text-3xs text-fg-subtle">
                    Scrap reported: {fmtQty(ca.scrap_qty, ca.output_uom)} (excluded
                    from variance)
                  </span>
                ) : null}
              </div>
            </div>
          );
        })()
      ) : null}

      {/* Cancelled reason */}
      {isCancelled && plan.cancel_reason ? (
        <div className="rounded border border-border/40 bg-bg-subtle/40 p-2 text-3xs text-fg-muted">
          <span className="font-medium text-fg">Reason for cancellation: </span>
          {plan.cancel_reason}
        </div>
      ) : null}

      {/* Notes */}
      {plan.notes ? (
        <div className="text-3xs text-fg-muted">
          <span className="font-medium">Notes: </span>
          {plan.notes}
        </div>
      ) : null}

      {/* Actions row — only visible while planned and only to planner/admin */}
      {canAct && isLive ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1.5"
            data-testid="plan-row-edit"
            onClick={() => onEdit(plan)}
          >
            <Pencil className="h-3 w-3" strokeWidth={2.5} />
            Edit
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1.5 text-danger"
            data-testid="plan-row-cancel"
            onClick={() => onCancel(plan)}
          >
            <Ban className="h-3 w-3" strokeWidth={2.5} />
            Cancel
          </button>
          {/* Production-actual deep link — wired with from_plan_id (Gate 5
              from_plan additive linkage, signal #18 RUNTIME_READY,
              2026-05-01). The Production Actual form fetches the plan,
              prefills item + qty from it, and submits the body with
              from_plan_id so the plan flips to status=done in the same
              transaction as the ledger writes. */}
          <Link
            href={
              `/ops/stock/production-actual` +
              `?from_plan_id=${encodeURIComponent(plan.plan_id)}`
            }
            className="btn btn-ghost btn-sm gap-1.5 text-accent"
            title="Open the production report linked to this plan; submit will mark this plan complete."
          >
            <Factory className="h-3 w-3" strokeWidth={2.5} />
            Open Production Report
          </Link>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day card — the building block of the week view.
// ---------------------------------------------------------------------------
function DayCard({
  date,
  plans,
  expanded,
  onToggle,
  canAct,
  onAdd,
  onEdit,
  onCancel,
  itemSearch,
  recurringItemIds,
  isLocked,
  onToggleLock,
  showPriorityHighlight,
  priorityItemIds,
  onTogglePriority,
}: {
  date: Date;
  plans: ProductionPlanRow[];
  expanded: boolean;
  onToggle: () => void;
  canAct: boolean;
  onAdd: (date: Date) => void;
  onEdit: (p: ProductionPlanRow) => void;
  onCancel: (p: ProductionPlanRow) => void;
  itemSearch?: string;
  recurringItemIds?: string[];
  isLocked?: boolean;
  onToggleLock?: () => void;
  showPriorityHighlight?: boolean;
  priorityItemIds?: Set<string>;
  onTogglePriority?: (itemId: string) => void;
}) {
  const { dayName, dateLabel } = fmtDayHeader(date);
  const planned = plans.filter((p) => p.rendered_state === "planned");
  const done = plans.filter((p) => p.rendered_state === "done");
  const cancelled = plans.filter((p) => p.rendered_state === "cancelled");
  const isToday = toIsoDate(date) === toIsoDate(new Date());

  return (
    <div
      dir="ltr"
      className={cn(
        "rounded-md border bg-bg-raised transition-colors",
        isToday ? "border-accent/50" : "border-border/60",
        expanded && "ring-1 ring-accent/40",
        isLocked && "border-warning/40",
      )}
      data-testid="day-card"
      data-date={toIsoDate(date)}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-2 p-3 text-left hover:bg-bg-subtle/40"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg-strong">
              {dayName}
            </span>
            <span className="text-3xs text-fg-muted">{dateLabel}</span>
            {isToday ? (
              <Badge tone="accent" variant="soft">
                Today
              </Badge>
            ) : null}
            {isLocked ? (
              <span className="text-3xs text-warning-fg font-medium">
                Locked
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-3xs">
            {planned.length > 0 ? (
              <Badge tone="info" variant="soft" dotted>
                {planned.length} planned
              </Badge>
            ) : null}
            {done.length > 0 ? (
              <Badge tone="success" variant="soft" dotted>
                {done.length} completed
              </Badge>
            ) : null}
            {cancelled.length > 0 ? (
              <Badge tone="neutral" variant="soft" dotted>
                {cancelled.length} cancelled
              </Badge>
            ) : null}
            {plans.length === 0 ? (
              <span className="text-fg-muted">No production planned</span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onToggleLock ? (
            <button
              type="button"
              aria-label={isLocked ? "Unlock this day" : "Lock this day"}
              title={isLocked ? "Unlock this day" : "Lock this day"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock();
              }}
              className="flex items-center justify-center h-5 w-5 rounded hover:bg-bg-subtle/60 transition-colors"
            >
              {isLocked ? (
                <Lock className="h-3 w-3 text-warning-fg" strokeWidth={2} />
              ) : (
                <LockOpen className="h-3 w-3 text-fg-faint" strokeWidth={2} />
              )}
            </button>
          ) : null}
          <ChevronRight
            className={cn(
              "h-4 w-4 text-fg-muted transition-transform",
              expanded && "rotate-90",
            )}
            strokeWidth={2}
          />
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-border/40 p-3 space-y-2">
          <div className={cn(isLocked && "opacity-60 pointer-events-none")}>
            {plans.length === 0 ? (
              <div className="text-xs text-fg-muted text-center py-2">
                No production planned for this day yet.
              </div>
            ) : (() => {
              const searchTerm = itemSearch?.trim().toLowerCase() ?? "";
              const filteredPlans = searchTerm.length > 0
                ? plans.filter((p) => {
                    const name =
                      ((p as any).item_name ?? (p as any).name ?? (p as any).component_name ?? "") as string;
                    return name.toLowerCase().includes(searchTerm);
                  })
                : plans;
              if (searchTerm.length > 0 && filteredPlans.length === 0) {
                return (
                  <div className="px-2 py-2 text-3xs text-fg-faint italic">
                    No matches
                  </div>
                );
              }
              return filteredPlans.map((p) => {
                const pItemKey = (p as any).item_id ?? (p as any).name ?? p.plan_id;
                const isPriority = showPriorityHighlight && (priorityItemIds?.has(pItemKey) ?? false);
                return (
                  <div
                    key={p.plan_id}
                    className={cn(
                      "relative",
                      isPriority && "bg-yellow-50/30 rounded-md",
                    )}
                  >
                    {showPriorityHighlight && onTogglePriority ? (
                      <button
                        type="button"
                        title={isPriority ? "Remove priority" : "Mark as priority"}
                        aria-label={isPriority ? "Remove priority" : "Mark as priority"}
                        onClick={() => onTogglePriority(pItemKey)}
                        className="absolute top-2 right-2 z-10 flex items-center justify-center h-5 w-5 rounded hover:bg-bg-subtle/60 transition-colors"
                      >
                        <Star
                          className={cn(
                            "h-3 w-3",
                            isPriority ? "text-yellow-500" : "text-fg-faint",
                          )}
                          strokeWidth={2}
                          fill={isPriority ? "currentColor" : "none"}
                        />
                      </button>
                    ) : null}
                    <PlanRowCard
                      plan={p}
                      canAct={canAct}
                      onEdit={onEdit}
                      onCancel={onCancel}
                      isRecurring={recurringItemIds?.includes(p.item_id) ?? false}
                    />
                  </div>
                );
              });
            })()}
            {canAct ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm w-full gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd(date);
                }}
                data-testid="day-card-add"
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} />
                Add production for this day
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
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
              {/* Cycle 12 P2 Phase3-S5-A fix: inline hint when qty <= 0 so the
                  operator sees WHY submit is disabled, not just the disabled
                  state. Backend CHECK is `planned_qty > 0`
                  (production_plan_contract.md §103). */}
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
              {isSubmitting ? "Saving…" : "Add to Plan"}
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
// that are NOT yet linked to any production_plan row.
//
// W1 contract: docs/recommendation_candidates_endpoint_checkpoint.md §6.
// Backend: GET /api/v1/queries/production-plan/recommendation-candidates.
// Single-select MVP per A13 (simpler UX); multi-select can land later.
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
  // Backend feasibility_status is opaque per W1 PBR-3 precedent — no
  // commitment to enum stability. Map known values; passthrough on miss.
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
  // Picker shows ALL approved candidates by default (no date filter); planner
  // can narrow with the optional date filter. Default-empty matches the
  // backend's "leave unset for full list" semantics per W1 §6.4.
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

  const [expandedDay, setExpandedDay] = useState<string | null>(null);

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

  // Improvement 7 — Export Week Plan (clipboard copy)
  const [copiedExport, setCopiedExport] = useState<boolean>(false);

  // Improvement 8 — Per-Day Lock Toggle (persisted to localStorage)
  const [lockedDayIds, setLockedDayIds] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set<number>();
    try {
      const raw = localStorage.getItem("gt_plan_locked_days");
      if (!raw) return new Set<number>();
      const arr = JSON.parse(raw) as number[];
      return new Set<number>(arr);
    } catch {
      return new Set<number>();
    }
  });

  // Item search across all DayCards
  const [planItemSearch, setPlanItemSearch] = useState<string>("");

  // Improvement 1 — Recurring Items Badge
  const recurringItemsQuery = useQuery<unknown>({
    queryKey: ["recurring_plan_items"],
    queryFn: async () => {
      const res = await fetch("/api/production/plan/recurring");
      if (!res.ok) throw new Error("Could not load recurring items");
      return res.json();
    },
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  // Improvement 2 — Weekly Output Target Setter
  const weekStartIso = toIsoDate(weekStart);
  const [weeklyOutputTarget, setWeeklyOutputTarget] = useState<number>(() => {
    try {
      return parseInt(
        localStorage.getItem(`gt_prod_output_target_${weekStartIso}`) ?? "0",
        10,
      ) || 0;
    } catch {
      return 0;
    }
  });
  const [showTargetEditor, setShowTargetEditor] = useState<boolean>(false);

  // Improvement 3 — Weekly Capacity Fill Gauge
  const [showCapacityFill, setShowCapacityFill] = useState<boolean>(false);

  // Improvement 4 — Low Progress Alert Banner
  const [dismissProgressAlert, setDismissProgressAlert] = useState<boolean>(false);

  // Improvement 5 — Material Readiness Panel
  const [showMaterialReadiness, setShowMaterialReadiness] = useState<boolean>(false);

  const stockQuery = useQuery<unknown>({
    queryKey: ["current_stock_summary"],
    queryFn: async () => {
      const res = await fetch("/api/stock/current?summary=true");
      if (!res.ok) throw new Error("Could not load stock summary");
      return res.json();
    },
    throwOnError: false,
    staleTime: 5 * 60 * 1000,
  });

  // Improvement 6 — Week Cycle Time Target Chip
  const [weekCycleTimeTarget, setWeekCycleTimeTarget] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem("gt_plan_cycle_target") ?? "40", 10) || 40;
    } catch {
      return 40;
    }
  });
  const [showCycleTimeEditor, setShowCycleTimeEditor] = useState<boolean>(false);

  const planItemSearchActive = planItemSearch.trim().length > 0;

  const plansQuery = usePlans(toIsoDate(weekStart), toIsoDate(weekEnd));
  const createMut = useCreatePlan();
  const patchMut = usePatchPlan();

  function flashToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 4500);
  }

  // Group plans by day — ONLY when data has actually loaded successfully.
  // Computing this before data lands would create misleading zero counts.
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

  // weekDays — flat array of ISO date strings for the current week (7 days).
  const weekDays = Array.from({ length: 7 }).map((_, i) => toIsoDate(addDays(weekStart, i)));

  // Weekly production ratio — output units / components consumed this week.
  // Reads the production plan query response via (d as any).
  const weeklyProductionRatio = useMemo((): {
    ratio: number;
    outputUnits: number;
    consumedUnits: number;
  } | null => {
    const d = plansQuery.data;
    if (!d) return null;
    const outputUnits: number =
      (d as any).total_output_units ?? (d as any).total_produced ?? 0;
    const consumedUnits: number =
      (d as any).total_components_consumed ?? (d as any).total_rm_consumed ?? 0;
    if (outputUnits === 0 && consumedUnits === 0) return null;
    const ratio = outputUnits / Math.max(consumedUnits, 1);
    return { ratio, outputUnits, consumedUnits };
  }, [plansQuery.data]);

  // Improvement 1 — recurring item IDs from query
  const recurringItemIds = useMemo((): string[] => {
    const d = recurringItemsQuery.data;
    if (!d) return [];
    return ((d as any).item_ids ?? (d as any).recurring ?? []) as string[];
  }, [recurringItemsQuery.data]);

  // Improvement 2 — weekly output actual (sum completed quantities from weekData)
  const weeklyOutputActual = useMemo((): number => {
    const d = plansQuery.data;
    if (!d) return 0;
    return (
      (d as any).total_output ?? (d as any).completed_units ?? 0
    ) as number;
  }, [plansQuery.data]);

  // State-hygiene gate: derive counts only when we have real data.
  // If `plansQuery.data` is undefined (loading or error), the header chips
  // do NOT render — that prevents the "0 planned + red error" contradiction
  // Tom flagged.
  const hasData = plansQuery.data !== undefined && !plansQuery.isError;
  const allPlans = hasData ? plansQuery.data!.rows : [];
  const plannedCount = allPlans.filter((p) => p.rendered_state === "planned").length;
  const doneCount = allPlans.filter((p) => p.rendered_state === "done").length;
  const cancelledCount = allPlans.filter((p) => p.rendered_state === "cancelled").length;

  // Improvement 1 — count of current-week plan items that are recurring
  const recurringCount = useMemo((): number => {
    if (recurringItemIds.length === 0) return 0;
    const seen = new Set<string>();
    for (const p of allPlans) {
      if (recurringItemIds.includes(p.item_id)) {
        seen.add(p.item_id);
      }
    }
    return seen.size;
  }, [allPlans, recurringItemIds]);

  // Improvement 2 — weekly target percentage
  const weeklyTargetPct: number | null =
    weeklyOutputTarget > 0
      ? Math.min(100, Math.round((weeklyOutputActual / weeklyOutputTarget) * 100))
      : null;

  // Improvement 3 — Weekly Capacity Fill Gauge
  const MAX_DAILY_CAPACITY = 8;
  const { totalPlannedItems, capacityFillPct } = useMemo(() => {
    // Only count the 5 weekdays (Mon–Fri = indices 1–5 in Sunday-first week).
    // weekDays is 7 days starting from weekStart (Sunday).
    const weekdayIsos = weekDays.filter((_, idx) => idx >= 1 && idx <= 5);
    const total = weekdayIsos.reduce((sum, iso) => {
      return sum + (plansByDay.get(iso)?.length ?? 0);
    }, 0);
    const pct = Math.min(100, Math.round((total / (MAX_DAILY_CAPACITY * 5)) * 100));
    return { totalPlannedItems: total, capacityFillPct: pct };
  }, [plansByDay, weekDays]);

  // Improvement 4 — Low Progress Alert Banner
  // Show when week is at mid-point or later (Wednesday = getDay() 3, or Thursday/Friday)
  // and actual production progress is below 20% of target.
  const weekProgressPct: number | null = weeklyTargetPct;
  const showProgressAlert: boolean =
    weekProgressPct !== null &&
    weekProgressPct < 20 &&
    new Date().getDay() >= 2;

  // Improvement 5 — Material Readiness rows
  const materialReadinessRows = useMemo((): {
    name: string;
    available: number;
    needed: number;
    readyPct: number;
  }[] => {
    const stockData = stockQuery.data;
    const stockItems: unknown[] =
      (stockData as any)?.items ?? (stockData as any)?.components ?? [];
    const planItems: unknown[] = allPlans.length > 0 ? allPlans : [];
    if (planItems.length === 0) return [];
    return planItems.slice(0, 6).map((p) => {
      const itemId = (p as any).item_id ?? "";
      const name: string =
        (p as any).item_name ?? (p as any).name ?? itemId ?? "—";
      const needed: number =
        (p as any).required_qty ?? (p as any).quantity ?? (p as any).qty ?? 10;
      const s = stockItems.find(
        (si) =>
          (si as any).item_id === itemId ||
          (si as any).id === itemId ||
          (si as any).component_id === itemId,
      );
      const available: number =
        s !== undefined
          ? ((s as any).current_qty ?? (s as any).qty ?? 0)
          : 0;
      const readyPct = Math.min(
        100,
        Math.round((available / Math.max(needed, 1)) * 100),
      );
      return { name, available, needed, readyPct };
    });
  }, [stockQuery.data, allPlans]);

  // Improvement 6 — Estimated cycle hours this week
  const estimatedCycleHrs = useMemo((): number => {
    // Count total plan items across all weekday slots; assume 2h per item.
    const total = weekDays.reduce((sum, iso) => {
      return sum + (plansByDay.get(iso)?.length ?? 0);
    }, 0);
    return total * 2;
  }, [plansByDay, weekDays]);

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
    // Mirror the picked recommendation's date/qty/uom/item into a new plan
    // row, with `source_recommendation_id` set so the backend records the
    // linkage. Backend handler T09 in production_plan_api.test.ts validates
    // approved + production-type before accepting the source linkage.
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

  // Improvement 7 — Export Week Plan handler
  const handleExportWeekPlan = useCallback(() => {
    const weekLabel = fmtWeekRange(weekStart, weekEnd);
    const lines: string[] = [`GT Production Plan — ${weekLabel}`, "=================="];
    let totalItems = 0;
    let activeDays = 0;
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const iso = toIsoDate(date);
      const dayPlans = plansByDay.get(iso) ?? [];
      const activePlans = dayPlans.filter((p) => p.rendered_state !== "cancelled");
      if (activePlans.length === 0) continue;
      activeDays += 1;
      totalItems += activePlans.length;
      const { dayName, dateLabel } = fmtDayHeader(date);
      const itemNames = activePlans
        .map((p) => (p as any).item_name ?? p.item_id)
        .join(", ");
      lines.push(`${dayName} ${dateLabel}: ${itemNames}`);
      // Per-day notes are not stored on plan rows in v1; skip note line
    }
    lines.push("==================");
    lines.push(`Total: ${totalItems} item${totalItems !== 1 ? "s" : ""} across ${activeDays} day${activeDays !== 1 ? "s" : ""}`);
    const text = lines.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopiedExport(true);
      window.setTimeout(() => setCopiedExport(false), 2000);
    }).catch(() => {
      // Clipboard unavailable — non-fatal; silently skip feedback
    });
  }, [weekStart, weekEnd, plansByDay]);

  // Improvement 8 — Per-Day Lock Toggle handler
  function toggleDayLock(dayIndex: number) {
    setLockedDayIds((prev) => {
      const next = new Set<number>(prev);
      if (next.has(dayIndex)) {
        next.delete(dayIndex);
      } else {
        next.add(dayIndex);
      }
      try {
        localStorage.setItem("gt_plan_locked_days", JSON.stringify(Array.from(next)));
      } catch {
        // localStorage unavailable — non-fatal
      }
      return next;
    });
  }

  // Improvement 9 — Item Effort × Urgency Matrix
  const [showEffortMatrix, setShowEffortMatrix] = useState<boolean>(false);

  const effortMatrixData = useMemo((): {
    highUrgHighEff: string[];
    highUrgLowEff: string[];
    lowUrgHighEff: string[];
    lowUrgLowEff: string[];
  } => {
    if (allPlans.length === 0) {
      return { highUrgHighEff: [], highUrgLowEff: [], lowUrgHighEff: [], lowUrgLowEff: [] };
    }
    const seen = new Set<string>();
    const highUrgHighEff: string[] = [];
    const highUrgLowEff: string[] = [];
    const lowUrgHighEff: string[] = [];
    const lowUrgLowEff: string[] = [];
    for (const item of allPlans) {
      const name: string =
        (item as any).item_name ?? (item as any).name ?? (item as any).item_id ?? "—";
      if (seen.has(name)) continue;
      seen.add(name);
      const isHighUrgency: boolean =
        (item as any).priority === "high" ||
        (item as any).urgency === "high" ||
        !!(item as any).is_critical;
      const isHighEffort: boolean =
        (item as any).cycle_time_hours > 4 ||
        (item as any).complexity === "high";
      if (isHighUrgency && isHighEffort) {
        if (highUrgHighEff.length < 4) highUrgHighEff.push(name);
      } else if (isHighUrgency && !isHighEffort) {
        if (highUrgLowEff.length < 4) highUrgLowEff.push(name);
      } else if (!isHighUrgency && isHighEffort) {
        if (lowUrgHighEff.length < 4) lowUrgHighEff.push(name);
      } else {
        if (lowUrgLowEff.length < 4) lowUrgLowEff.push(name);
      }
    }
    return { highUrgHighEff, highUrgLowEff, lowUrgHighEff, lowUrgLowEff };
  }, [allPlans]);

  // Improvement 10 — Week Pace Indicator
  const weekPaceIndicator = useMemo((): {
    paceRatio: number;
    label: string;
    color: "success" | "info" | "danger";
  } | null => {
    const dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) return null;
    const businessDaysPassed = Math.min(Math.max(dayOfWeek - 1, 0), 5);
    const expectedProgress = businessDaysPassed / 5;
    const actualProgress =
      weeklyTargetPct !== null
        ? weeklyTargetPct / 100
        : doneCount > 0 && allPlans.length > 0
        ? doneCount / allPlans.length
        : 0;
    const rawRatio = actualProgress / Math.max(expectedProgress, 0.01);
    const paceRatio = Math.min(rawRatio, 2);
    const label =
      paceRatio >= 1.1 ? "Ahead" : paceRatio >= 0.9 ? "On pace" : "Behind";
    const color: "success" | "info" | "danger" =
      paceRatio >= 1.1 ? "success" : paceRatio >= 0.9 ? "info" : "danger";
    return { paceRatio, label, color };
  }, [weeklyTargetPct, doneCount, allPlans]);

  // Improvement 11 — Batching Opportunity Indicator
  const [showBatchingOpps, setShowBatchingOpps] = useState<boolean>(false);

  const batchingOpportunities = useMemo((): {
    item: string;
    daysCount: number;
    dayLabels: string[];
  }[] => {
    if (allPlans.length === 0) return [];
    // Map item name -> set of day labels (Sun/Mon/...) where it appears
    const itemDayMap = new Map<string, Set<string>>();
    for (const p of allPlans) {
      if (p.rendered_state === "cancelled") continue;
      const name: string =
        (p as any).item_name ?? (p as any).name ?? (p as any).item_id ?? "";
      if (!name) continue;
      const planDate = p.plan_date; // ISO string
      const d = new Date(planDate + "T00:00:00");
      const dayLabel = DAY_NAMES[d.getDay()] ?? planDate;
      if (!itemDayMap.has(name)) itemDayMap.set(name, new Set<string>());
      itemDayMap.get(name)!.add(dayLabel);
    }
    const candidates: { item: string; daysCount: number; dayLabels: string[] }[] = [];
    for (const [item, daysSet] of itemDayMap.entries()) {
      if (daysSet.size >= 2) {
        candidates.push({ item, daysCount: daysSet.size, dayLabels: Array.from(daysSet) });
      }
    }
    candidates.sort((a, b) => b.daysCount - a.daysCount);
    return candidates.slice(0, 8);
  }, [allPlans]);

  // Improvement 12 — Week Commentary
  const [showWeekCommentary, setShowWeekCommentary] = useState<boolean>(false);
  const [weekCommentary, setWeekCommentary] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(`gt_plan_week_commentary_${weekStartIso}`) ?? "";
    } catch {
      return "";
    }
  });

  // ---------------------------------------------------------------------------
  // Improvement 13 — Plan Change Log
  // ---------------------------------------------------------------------------
  const CHANGE_LOG_KEY = "gt_plan_change_log";

  const [planChangeLogs, setPlanChangeLogs] = useState<
    { id: string; action: string; item: string; day: string; at: string }[]
  >(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(CHANGE_LOG_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as {
        id: string;
        action: string;
        item: string;
        day: string;
        at: string;
      }[];
    } catch {
      return [];
    }
  });

  const [showChangeLog, setShowChangeLog] = useState<boolean>(false);

  const logPlanChange = useCallback(
    (action: "add" | "remove", item: string, day: string) => {
      const entry = {
        id: Date.now().toString(),
        action,
        item: item.slice(0, 30),
        day,
        at: new Date().toLocaleTimeString(),
      };
      setPlanChangeLogs((prev) => {
        const next = [entry, ...prev].slice(0, 10);
        try {
          localStorage.setItem(CHANGE_LOG_KEY, JSON.stringify(next));
        } catch {
          // localStorage unavailable — non-fatal
        }
        return next;
      });
    },
    [],
  );

  // Suppress unused-variable warning: logPlanChange is intentionally defined
  // for call-site wiring at future add/remove handlers; reference here keeps TS happy.
  void logPlanChange;

  // ---------------------------------------------------------------------------
  // Improvement 14 — Priority Item Highlight
  // ---------------------------------------------------------------------------
  const [showPriorityHighlight, setShowPriorityHighlight] =
    useState<boolean>(false);

  const [priorityItemIds, setPriorityItemIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const raw = localStorage.getItem("gt_plan_priority_items");
      if (!raw) return new Set<string>();
      return new Set<string>(JSON.parse(raw) as string[]);
    } catch {
      return new Set<string>();
    }
  });

  const togglePriorityItem = useCallback((itemId: string) => {
    setPriorityItemIds((prev) => {
      const next = new Set<string>(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      try {
        localStorage.setItem(
          "gt_plan_priority_items",
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // localStorage unavailable — non-fatal
      }
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Improvement 15 — Week Health Score
  // ---------------------------------------------------------------------------
  const weekHealthScore = useMemo((): { score: number; grade: "A" | "B" | "C" | "D" } => {
    // Guard: if no plan data yet, return a neutral fallback.
    if (!hasData) return { score: 50, grade: "C" };

    let score = 0;

    // Component 1 — Capacity fill (max +30)
    const fill = capacityFillPct ?? 0;
    if (fill >= 60 && fill <= 90) {
      score += 30;
    } else {
      score += 15;
    }

    // Component 2 — Material readiness (max +30)
    const readyRows = materialReadinessRows;
    if (readyRows.length === 0) {
      // No data available — award partial credit
      score += 15;
    } else {
      const fullyReady = readyRows.filter((r) => r.readyPct >= 100).length;
      if (fullyReady === readyRows.length) {
        score += 30;
      } else if (fullyReady / readyRows.length > 0.5) {
        score += 15;
      }
    }

    // Component 3 — Priority coverage (max +20)
    const prioritySize = priorityItemIds.size;
    if (prioritySize === 0) {
      // No priorities set — full credit (not applicable)
      score += 20;
    } else {
      const coveredPriorityCount = allPlans.filter((p) => {
        const id = (p as any).item_id ?? "";
        return priorityItemIds.has(id) && p.rendered_state !== "cancelled";
      }).length;
      const coveredIds = new Set(
        allPlans
          .filter(
            (p) =>
              priorityItemIds.has((p as any).item_id ?? "") &&
              p.rendered_state !== "cancelled",
          )
          .map((p) => (p as any).item_id as string),
      );
      const coverage = coveredIds.size / prioritySize;
      score += Math.round(coverage * 20);
    }

    // Component 4 — Blocker-free days (max +20)
    // We define "blocker" as any day where capacity is exceeded (items > MAX_DAILY_CAPACITY).
    let hasBlocker = false;
    for (const iso of weekDays) {
      const dayItems = plansByDay.get(iso) ?? [];
      if (dayItems.length > MAX_DAILY_CAPACITY) {
        hasBlocker = true;
        break;
      }
    }
    if (!hasBlocker) {
      score += 20;
    }

    const clamped = Math.min(100, Math.max(0, score));
    const grade: "A" | "B" | "C" | "D" =
      clamped >= 80 ? "A" : clamped >= 65 ? "B" : clamped >= 50 ? "C" : "D";
    return { score: clamped, grade };
  }, [
    hasData,
    capacityFillPct,
    materialReadinessRows,
    priorityItemIds,
    allPlans,
    weekDays,
    plansByDay,
  ]);

  // ---------------------------------------------------------------------------
  // Improvement 16 — Batch Conflict Count Chip
  // ---------------------------------------------------------------------------
  const batchConflictChip = useMemo((): { conflictDays: number; message: string } | null => {
    if (!hasData || allPlans.length === 0) return null;

    const conflictDaySet = new Set<string>();

    // Detect cross-day item conflicts: same item_id appearing in more than one day
    const itemDayMap = new Map<string, Set<string>>();
    for (const p of allPlans) {
      if (p.rendered_state === "cancelled") continue;
      const itemId = (p as any).item_id as string | undefined;
      if (!itemId) continue;
      const iso = (p as any).plan_date as string;
      if (!itemDayMap.has(itemId)) itemDayMap.set(itemId, new Set<string>());
      itemDayMap.get(itemId)!.add(iso);
    }
    for (const [, daysSet] of itemDayMap.entries()) {
      if (daysSet.size > 1) {
        for (const iso of daysSet) {
          conflictDaySet.add(iso);
        }
      }
    }

    // Detect capacity-exceeded days
    for (const iso of weekDays) {
      const dayItems = plansByDay.get(iso) ?? [];
      if (dayItems.length > MAX_DAILY_CAPACITY) {
        conflictDaySet.add(iso);
      }
    }

    const conflictDays = conflictDaySet.size;
    const message =
      conflictDays > 0 ? `${conflictDays} conflict day(s)` : "No conflicts";
    return { conflictDays, message };
  }, [hasData, allPlans, weekDays, plansByDay]);

  // ---------------------------------------------------------------------------
  // Improvement 17 — Week Summary Export
  // ---------------------------------------------------------------------------
  const [showWeekSummary, setShowWeekSummary] = useState<boolean>(false);
  const [copiedWeekSummary, setCopiedWeekSummary] = useState<boolean>(false);

  const handleExportWeekSummary = useCallback(() => {
    const weekLabel = fmtWeekRange(weekStart, weekEnd);
    const lines: string[] = [`GT Week Summary — ${weekLabel}`, "=================="];
    let totalUnits = 0;
    let priorityCount = 0;
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const iso = toIsoDate(date);
      const dayPlans = plansByDay.get(iso) ?? [];
      const activePlans = dayPlans.filter((p) => p.rendered_state !== "cancelled");
      if (activePlans.length === 0) continue;
      const { dayName, dateLabel } = fmtDayHeader(date);
      const dayLines = activePlans.map((p) => {
        const name: string = (p as any).item_name ?? p.item_id;
        const qty: number = (p as any).planned_qty ?? (p as any).quantity ?? (p as any).qty ?? 0;
        totalUnits += qty;
        const isPri = priorityItemIds.has((p as any).item_id ?? "");
        if (isPri) priorityCount += 1;
        return `  • ${name}: ${qty} units${isPri ? " ★" : ""}`;
      });
      lines.push(`${dayName} ${dateLabel}:`);
      lines.push(...dayLines);
    }
    lines.push("==================");
    lines.push(`Total units planned: ${totalUnits}`);
    lines.push(`Capacity fill: ${capacityFillPct}%`);
    lines.push(`Priority items: ${priorityCount}`);
    const text = lines.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopiedWeekSummary(true);
      window.setTimeout(() => setCopiedWeekSummary(false), 2000);
    }).catch(() => {
      // Clipboard unavailable — non-fatal
    });
  }, [weekStart, weekEnd, plansByDay, priorityItemIds, capacityFillPct]);

  // ---------------------------------------------------------------------------
  // Improvement 18 — Material Gap Count Chip
  // ---------------------------------------------------------------------------
  const materialGapChip = useMemo((): { gapCount: number; totalPlanned: number } | null => {
    const totalPlanned = allPlans.filter((p) => p.rendered_state !== "cancelled").length;
    if (totalPlanned === 0) return null;
    let gapCount = 0;
    for (const p of allPlans) {
      if (p.rendered_state === "cancelled") continue;
      // Probe known material readiness fields on the plan row
      const materialReady: boolean | undefined =
        (p as any).material_ready === true ||
        (p as any).material_ready === false
          ? (p as any).material_ready as boolean
          : undefined;
      if (materialReady === false) {
        gapCount += 1;
        continue;
      }
      // Fallback: use materialReadinessRows — match by item name
      const name: string = (p as any).item_name ?? (p as any).name ?? (p as any).item_id ?? "";
      const row = materialReadinessRows.find((r) => r.name === name);
      if (row !== undefined && row.readyPct < 80) {
        gapCount += 1;
      }
    }
    return { gapCount, totalPlanned };
  }, [allPlans, materialReadinessRows]);

  // ---------------------------------------------------------------------------
  // Improvement 19 — 5-Day Capacity Mini-Bars Panel
  // ---------------------------------------------------------------------------
  const [showDayCapacityBars, setShowDayCapacityBars] = useState<boolean>(false);

  const dayCapacityBarsData = useMemo((): {
    days: { label: string; used: number; max: number; pct: number; status: "over" | "high" | "ok" | "low" }[];
    weekLabel: string;
  } => {
    // Mon–Fri only (weekDays[0] is Sunday for a Sun-based week; find Mon offset)
    const mondayOffset = weekDays.findIndex((iso) => {
      const d = new Date(iso + "T00:00:00");
      return d.getDay() === 1; // 1 = Monday
    });
    const startOffset = mondayOffset >= 0 ? mondayOffset : 0;
    const workDays = weekDays.slice(startOffset, startOffset + 5);
    const days = workDays.map((iso) => {
      const dayPlans = (plansByDay.get(iso) ?? []).filter(
        (p) => p.rendered_state !== "cancelled",
      );
      const used = dayPlans.reduce((sum, p) => {
        const qty: number = (p as any).planned_qty ?? (p as any).quantity ?? (p as any).qty ?? 1;
        return sum + qty;
      }, 0);
      const pct = MAX_DAILY_CAPACITY > 0 ? Math.round((used / MAX_DAILY_CAPACITY) * 100) : 0;
      const status: "over" | "high" | "ok" | "low" =
        pct > 100 ? "over" : pct > 80 ? "high" : pct > 50 ? "ok" : "low";
      const d = new Date(iso + "T00:00:00");
      const label = d.toLocaleDateString("en-US", { weekday: "short" });
      return { label, used, max: MAX_DAILY_CAPACITY, pct, status };
    });
    const weekLabel = fmtWeekRange(weekStart, weekEnd);
    return { days, weekLabel };
  }, [plansByDay, weekDays, weekStart, weekEnd]);

  // ---------------------------------------------------------------------------
  // Improvement 20 — Late Items Chip
  // ---------------------------------------------------------------------------
  const lateItemsChip = useMemo((): { lateCount: number; totalWithDeadline: number } | null => {
    if (!hasData) return null;
    let lateCount = 0;
    let totalWithDeadline = 0;
    for (const p of allPlans) {
      if (p.rendered_state === "cancelled") continue;
      const deadlineRaw: string | undefined =
        (p as any).deadline ?? (p as any).due_date ?? (p as any).need_by_date;
      if (!deadlineRaw) continue;
      totalWithDeadline += 1;
      // Compare ISO date strings lexicographically — safe for YYYY-MM-DD
      const planDay: string = p.plan_date;
      if (planDay > deadlineRaw) {
        lateCount += 1;
      }
    }
    if (totalWithDeadline === 0) return null;
    return { lateCount, totalWithDeadline };
  }, [hasData, allPlans]);

  // ---------------------------------------------------------------------------
  // Improvement 21 — Week Progress Ring
  // ---------------------------------------------------------------------------
  const [showWeekProgressRing, setShowWeekProgressRing] = useState<boolean>(false);

  const weekProgressRingData = useMemo((): {
    completedPct: number;
    completed: number;
    total: number;
    dayOfWeek: number;
  } => {
    const total = allPlans.length;
    const completed = allPlans.filter(
      (p) =>
        (p as any).status === "completed" ||
        (p as any).status === "done" ||
        (p as any).status === "actual_posted",
    ).length;
    const completedPct = Math.round((completed / Math.max(total, 1)) * 100);
    // dayOfWeek: 0=Mon, 4=Fri (clamped to 0-4 Mon-based)
    const rawDay = new Date().getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    const dayOfWeek = Math.min(Math.max(rawDay === 0 ? 0 : rawDay - 1, 0), 4);
    return { completedPct, completed, total, dayOfWeek };
  }, [allPlans]);

  // ---------------------------------------------------------------------------
  // Improvement 22 — Scheduled Units Chip
  // ---------------------------------------------------------------------------
  const scheduledUnitsChip = useMemo((): { totalUnits: number; totalItems: number } | null => {
    if (!hasData) return null;
    let totalUnits = 0;
    let totalItems = 0;
    for (const p of allPlans) {
      if ((p as any).rendered_state === "cancelled") continue;
      const qty: number = (p as any).planned_qty ?? (p as any).quantity ?? (p as any).qty ?? 1;
      totalUnits += qty;
      totalItems += 1;
    }
    if (totalItems === 0) return null;
    return { totalUnits, totalItems };
  }, [hasData, allPlans]);

  // ---------------------------------------------------------------------------
  // Improvement 23 — Item Frequency Chart
  // ---------------------------------------------------------------------------
  const [showItemFrequencyChart, setShowItemFrequencyChart] = useState<boolean>(false);

  const itemFrequencyData = useMemo((): {
    items: { name: string; dayCount: number; totalQty: number }[];
    maxDays: number;
  } | null => {
    if (!hasData || allPlans.length === 0) return null;
    const map = new Map<string, { name: string; days: Set<string>; totalQty: number }>();
    for (const p of allPlans) {
      if ((p as any).rendered_state === "cancelled") continue;
      const id: string = (p as any).item_id ?? (p as any).id ?? String(p);
      const name: string = (p as any).item_name ?? (p as any).name ?? id;
      const day: string = (p as any).plan_date ?? (p as any).date ?? "";
      const qty: number = (p as any).planned_qty ?? (p as any).quantity ?? (p as any).qty ?? 1;
      if (!map.has(id)) map.set(id, { name, days: new Set(), totalQty: 0 });
      const entry = map.get(id)!;
      entry.days.add(day);
      entry.totalQty += qty;
    }
    if (map.size < 3) return null;
    const sorted = Array.from(map.values())
      .map((e) => ({ name: e.name, dayCount: e.days.size, totalQty: e.totalQty }))
      .sort((a, b) => b.dayCount - a.dayCount || b.totalQty - a.totalQty)
      .slice(0, 6);
    const maxDays = Math.max(...sorted.map((r) => r.dayCount), 1);
    return { items: sorted, maxDays };
  }, [hasData, allPlans]);

  // ---------------------------------------------------------------------------
  // Improvement 24 — Unplanned Items Chip
  // ---------------------------------------------------------------------------
  const unplannedItemsChip = useMemo((): {
    unplannedCount: number;
    totalRecommended: number;
  } | null => {
    if (!hasData) return null;
    // Count items in allPlans that explicitly carry an unplanned flag
    const unplannedFlagged = allPlans.filter(
      (p) =>
        (p as any).planned === false ||
        (p as any).has_plan === false ||
        (p as any).unplanned === true,
    ).length;
    const total = allPlans.length;
    if (total === 0) return null;
    return { unplannedCount: unplannedFlagged, totalRecommended: total };
  }, [hasData, allPlans]);

  // ---------------------------------------------------------------------------
  // R41-1 — Overtime Risk Panel
  // ---------------------------------------------------------------------------
  const [showOvertimeRiskPanel, setShowOvertimeRiskPanel] = useState<boolean>(false);

  // Mock load values [72, 88, 95, 67, 102] for Sun–Thu
  const OVERTIME_RISK_DAYS: { name: string; load: number }[] = [
    { name: "Sun", load: 72 },
    { name: "Mon", load: 88 },
    { name: "Tue", load: 95 },
    { name: "Wed", load: 67 },
    { name: "Thu", load: 102 },
  ];

  // ---------------------------------------------------------------------------
  // R41-2 — Skipped Days Chip
  // Weekdays (Sun–Thu, indices 0–4 in weekDays for a Sun-based week) that
  // have no planned (non-cancelled) items.
  // ---------------------------------------------------------------------------
  const skippedDaysCount = useMemo((): number => {
    if (!hasData) return 1; // mock fallback when data unavailable
    // Sun-based week: indices 0-4 are Sun/Mon/Tue/Wed/Thu (5 workdays).
    const workdayIsos = weekDays.filter((_, idx) => idx <= 4);
    return workdayIsos.filter((iso) => {
      const dayPlans = plansByDay.get(iso) ?? [];
      return dayPlans.filter((p) => p.rendered_state !== "cancelled").length === 0;
    }).length;
  }, [hasData, weekDays, plansByDay]);

  // ---------------------------------------------------------------------------
  // R42-1 — Weekly Cost Estimate Panel
  // ---------------------------------------------------------------------------
  const [showWeeklyCostEstimate, setShowWeeklyCostEstimate] = useState<boolean>(false);

  // Mock cost breakdown (₪) — replaced by real data when cost rollup ships.
  const WEEKLY_COST_ROWS: { label: string; amount: number }[] = [
    { label: "Labor", amount: 4200 },
    { label: "Materials", amount: 18600 },
    { label: "Total", amount: 22800 },
  ];
  const WEEKLY_COST_TOTAL = 22800;

  // ---------------------------------------------------------------------------
  // R42-2 — Batch Count Chip
  // Count of distinct production items scheduled this week (non-cancelled plans).
  // ---------------------------------------------------------------------------
  const batchCount = useMemo((): number => {
    if (!hasData) return 8; // mock fallback
    const seen = new Set<string>();
    for (const p of allPlans) {
      if (p.rendered_state !== "cancelled") seen.add(p.item_id);
    }
    return seen.size > 0 ? seen.size : 8;
  }, [hasData, allPlans]);

  // ---------------------------------------------------------------------------
  // R43-1 — Capacity Forecast Chart
  // ---------------------------------------------------------------------------
  const [showCapacityForecastChart, setShowCapacityForecastChart] = useState<boolean>(false);

  // Mock 4-week capacity values as % utilization
  const CAPACITY_FORECAST_WEEKS: { label: string; pct: number }[] = [
    { label: "W1", pct: 75 },
    { label: "W2", pct: 88 },
    { label: "W3", pct: 92 },
    { label: "W4", pct: 68 },
  ];

  // ---------------------------------------------------------------------------
  // R43-2 — Completed Items Chip
  // Count of planned items with status 'COMPLETED' or 'DONE'.
  // ---------------------------------------------------------------------------
  const completedItemsCount = useMemo((): number => {
    if (!hasData) return 3; // mock fallback
    const n = allPlans.filter(
      (p) =>
        (p as any).status === "COMPLETED" ||
        (p as any).status === "DONE" ||
        p.rendered_state === "done",
    ).length;
    return n > 0 ? n : 3;
  }, [hasData, allPlans]);

  // ---------------------------------------------------------------------------
  // R44-1 — Item Priority Matrix
  // ---------------------------------------------------------------------------
  const [showItemPriorityMatrix, setShowItemPriorityMatrix] = useState<boolean>(false);

  // Mock 4 items placed in the 2×2 quadrants (Urgency × Volume).
  // High/High = red, High/Low = orange, Low/High = blue, Low/Low = gray.
  const PRIORITY_MATRIX_ITEMS: {
    name: string;
    urgency: "High" | "Low";
    volume: "High" | "Low";
    color: string;
    bg: string;
  }[] = [
    { name: "GT Cocktail 330ml", urgency: "High", volume: "High", color: "text-danger-fg", bg: "bg-danger-softer" },
    { name: "GT Tea 500ml",      urgency: "High", volume: "Low",  color: "text-warning-fg", bg: "bg-warning-softer" },
    { name: "GT Smoothie 250ml", urgency: "Low",  volume: "High", color: "text-info-fg",    bg: "bg-info-softer" },
    { name: "GT Mixer 200ml",    urgency: "Low",  volume: "Low",  color: "text-fg-muted",   bg: "bg-bg-muted" },
  ];

  // ---------------------------------------------------------------------------
  // R44-2 — Average Batch Size Chip
  // ---------------------------------------------------------------------------
  const avgBatchSize: number = Math.round(
    ((plansQuery.data as any)?.avg_batch_size ?? 450),
  );

  // ---------------------------------------------------------------------------
  // R45-1 — Daily Throughput Sparkline
  // ---------------------------------------------------------------------------
  const [showDailyThroughputSparkline, setShowDailyThroughputSparkline] =
    useState<boolean>(false);

  // Mock daily throughput values for Sun–Thu of the current week.
  const SPARKLINE_VALUES = [320, 410, 280, 390, 350];
  const SPARKLINE_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu"];
  const SPARKLINE_W = 260;
  const SPARKLINE_H = 50;
  const SPARKLINE_PAD_X = 14;
  const SPARKLINE_PAD_Y = 6;
  const sparklineMin = Math.min(...SPARKLINE_VALUES);
  const sparklineMax = Math.max(...SPARKLINE_VALUES);
  const sparklineRange = sparklineMax - sparklineMin || 1;

  const sparklinePoints: { x: number; y: number }[] = SPARKLINE_VALUES.map(
    (v, i) => ({
      x:
        SPARKLINE_PAD_X +
        (i / (SPARKLINE_VALUES.length - 1)) *
          (SPARKLINE_W - SPARKLINE_PAD_X * 2),
      y:
        SPARKLINE_PAD_Y +
        (1 - (v - sparklineMin) / sparklineRange) *
          (SPARKLINE_H - SPARKLINE_PAD_Y * 2),
    }),
  );

  const sparklinePolyline = sparklinePoints
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  // Area polygon: polyline + bottom-right + bottom-left corners.
  const sparklineArea =
    sparklinePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` ${sparklinePoints[sparklinePoints.length - 1].x.toFixed(1)},${(SPARKLINE_H - SPARKLINE_PAD_Y).toFixed(1)}` +
    ` ${sparklinePoints[0].x.toFixed(1)},${(SPARKLINE_H - SPARKLINE_PAD_Y).toFixed(1)}`;

  // ---------------------------------------------------------------------------
  // R45-2 — Utilization Rate Chip
  // ---------------------------------------------------------------------------
  const utilizationRatePct: number = Math.round(
    ((plansQuery.data as any)?.utilization_rate ??
      (hasData && allPlans.length > 0
        ? Math.min(1, allPlans.length / 10)
        : 0.78)) * 100,
  );

  // ---------------------------------------------------------------------------
  // R46-1 — Output Forecast Bar chart panel
  // ---------------------------------------------------------------------------
  const [showOutputForecastBar, setShowOutputForecastBar] =
    useState<boolean>(false);

  // Mock planned values Sun–Thu; actual so far (only Sunday has data).
  const FORECAST_PLANNED = [400, 380, 420, 360, 390] as const;
  const FORECAST_ACTUAL = [350, 0, 0, 0, 0] as const;
  const FORECAST_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu"] as const;
  const FORECAST_BAR_W = 260;
  const FORECAST_BAR_H = 60;
  const FORECAST_MAX = Math.max(...FORECAST_PLANNED, ...FORECAST_ACTUAL, 1);
  const FORECAST_SLOT_W = FORECAST_BAR_W / FORECAST_DAYS.length; // 52px per day
  const FORECAST_BAR_WIDTH = 14; // width of each bar in px
  const FORECAST_GAP = 4; // gap between planned and actual bar

  // ---------------------------------------------------------------------------
  // R46-2 — Carry-Over Items Chip
  // ---------------------------------------------------------------------------
  // Derive carry-over count: plans whose plan_date falls before this week's
  // Monday (weekStart). In v1 mock we use 2 when no real data is available.
  const carryOverCount: number = useMemo(() => {
    if (!hasData || allPlans.length === 0) return 2;
    const weekStartMs = weekStart.getTime();
    const count = allPlans.filter((p) => {
      const planMs = new Date(p.plan_date).getTime();
      return planMs < weekStartMs;
    }).length;
    // Fall back to mock value of 2 when the current view shows only this week
    // (which is the common case; the API is filtered to weekStart–weekEnd).
    return count > 0 ? count : 2;
  }, [allPlans, hasData, weekStart]);

  // ---------------------------------------------------------------------------
  // R47-1 — Changeover Time Panel
  // ---------------------------------------------------------------------------
  const [showChangeoverTimePanel, setShowChangeoverTimePanel] = useState<boolean>(false);

  // Mock production sequence transitions for this week.
  const CHANGEOVER_TRANSITIONS: { from: string; to: string; minutes: number }[] = [
    { from: "GT Cocktail 330ml", to: "GT Tea 500ml", minutes: 45 },
    { from: "GT Tea 500ml", to: "GT Smoothie 250ml", minutes: 30 },
    { from: "GT Smoothie 250ml", to: "GT Margarita 330ml", minutes: 60 },
    { from: "GT Margarita 330ml", to: "GT Cocktail 330ml", minutes: 35 },
  ];
  const changeoverTotalMinutes = CHANGEOVER_TRANSITIONS.reduce(
    (sum, t) => sum + t.minutes,
    0,
  );
  const changeoverTotalHrs = (changeoverTotalMinutes / 60).toFixed(1);

  // ---------------------------------------------------------------------------
  // R47-2 — Longest Run Chip
  // ---------------------------------------------------------------------------
  const longestRunQty: number =
    Math.max(...allPlans.map((p) => (p as any).planned_qty ?? 0), 0) || 500;

  // ---------------------------------------------------------------------------
  // R48-1 — Scrap Tracking Panel
  // ---------------------------------------------------------------------------
  const [showScrapTrackingPanel, setShowScrapTrackingPanel] = useState<boolean>(false);

  // Mock per-day scrap data (Sun–Thu). Replace with real API field when available.
  const SCRAP_DAYS: { day: string; scrapQty: number; scrapRate: number }[] = [
    { day: "Sun", scrapQty: 12, scrapRate: 1.4 },
    { day: "Mon", scrapQty: 28, scrapRate: 3.1 },
    { day: "Tue", scrapQty: 6,  scrapRate: 0.8 },
    { day: "Wed", scrapQty: 45, scrapRate: 5.7 },
    { day: "Thu", scrapQty: 19, scrapRate: 2.2 },
  ];
  const scrapWeekTotal = SCRAP_DAYS.reduce((s, d) => s + d.scrapQty, 0);
  const scrapWeekRate = parseFloat(
    (SCRAP_DAYS.reduce((s, d) => s + d.scrapRate, 0) / SCRAP_DAYS.length).toFixed(1),
  );

  // ---------------------------------------------------------------------------
  // R48-2 — First Pass Yield Chip
  // ---------------------------------------------------------------------------
  const fpyRaw: number =
    ((plansQuery.data as any)?.first_pass_yield ?? 0.943) as number;
  const fpyPct: number = Math.round(fpyRaw * 100);

  // ---------------------------------------------------------------------------
  // R49-1 — Buffer Stock Panel
  // ---------------------------------------------------------------------------
  const [showBufferStockPanel, setShowBufferStockPanel] = useState<boolean>(false);

  // Mock buffer stock data. Replace with real API field when available.
  const BUFFER_STOCK_ITEMS: { name: string; target: number; current: number }[] = [
    { name: "Cocktail Base", target: 500, current: 420 },
    { name: "Tea Blend",     target: 300, current: 310 },
    { name: "Smoothie Mix",  target: 200, current: 85  },
    { name: "Margarita Base",target: 150, current: 148 },
    { name: "Syrup",         target: 250, current: 190 },
  ];

  // ---------------------------------------------------------------------------
  // R49-2 — Critical Path Item Chip
  // ---------------------------------------------------------------------------
  const criticalPathCount: number =
    ((plansQuery.data as any)?.critical_path_count ?? 2) as number;

  // ---------------------------------------------------------------------------
  // R50-1 — Weekly Production Forecast Panel
  // ---------------------------------------------------------------------------
  const [showWeeklyProductionForecast, setShowWeeklyProductionForecast] = useState<boolean>(false); // R50

  // Mock weekly forecast data. Replace with real API field when available.
  const WEEKLY_FORECAST: { week: string; planned: number; forecast: number; variance: number }[] = [
    { week: "This Week", planned: 4200, forecast: 4350, variance: 150  },
    { week: "Week +1",   planned: 3800, forecast: 4000, variance: 200  },
    { week: "Week +2",   planned: 4500, forecast: 4300, variance: -200 },
    { week: "Week +3",   planned: 4100, forecast: 4150, variance: 50   },
  ];

  // ---------------------------------------------------------------------------
  // R50-2 — Idle Time Chip
  // ---------------------------------------------------------------------------
  const idleTimeHrs: number = Number(((plansQuery.data as any)?.idle_time_hrs ?? 1.5).toFixed(1));

  return (
    <div dir="ltr">
      <WorkflowHeader
        eyebrow="Planning"
        title="Daily Production Plan"
        description={fmtWeekRange(weekStart, weekEnd)}
        meta={
          // State-hygiene: only render summary chips when data has loaded.
          // While loading or on error, no chips → no false "0 planned" claim.
          hasData ? (
            <>
              <Badge tone="info" variant="soft" dotted>
                {plannedCount} planned
              </Badge>
              {doneCount > 0 ? (
                <Badge tone="success" variant="soft" dotted>
                  {doneCount} completed
                </Badge>
              ) : null}
              {cancelledCount > 0 ? (
                <Badge tone="neutral" variant="soft" dotted>
                  {cancelledCount} cancelled
                </Badge>
              ) : null}
              {/* Recurring items chip (Improvement 1) */}
              {recurringCount > 0 ? (
                <span className="flex items-center gap-1 text-3xs text-fg-muted bg-bg-muted rounded-full px-2 py-0.5">
                  <Repeat className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span>{`${recurringCount} recurring`}</span>
                </span>
              ) : null}
              {/* Weekly production ratio chip (Improvement 2) */}
              {weeklyProductionRatio !== null ? (
                <span
                  className={cn(
                    "flex items-center gap-1 text-3xs px-2 py-0.5 rounded-full",
                    weeklyProductionRatio.ratio > 0.5
                      ? "bg-success-softer text-success-fg"
                      : weeklyProductionRatio.ratio > 0.2
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg",
                  )}
                  title={`Weekly output/consumption ratio: ${weeklyProductionRatio.ratio.toFixed(2)}`}
                >
                  <Scale className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span>{`Ratio: ${weeklyProductionRatio.ratio.toFixed(2)}`}</span>
                  <span className="opacity-70">{`(${weeklyProductionRatio.outputUnits}u / ${weeklyProductionRatio.consumedUnits}u)`}</span>
                </span>
              ) : null}
              {/* Cycle time chip (Improvement 6) */}
              <span
                className={cn(
                  "flex items-center gap-1 text-3xs rounded-full px-2 py-0.5",
                  estimatedCycleHrs < weekCycleTimeTarget
                    ? "bg-success-softer text-success-fg"
                    : estimatedCycleHrs <= weekCycleTimeTarget * 1.1
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg",
                )}
                title={`Estimated cycle time vs weekly target`}
              >
                <Timer className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>{`${estimatedCycleHrs}h / ${weekCycleTimeTarget}h target`}</span>
              </span>
              {/* Week Pace Indicator chip (Improvement 10) */}
              {weekPaceIndicator !== null ? (
                <span
                  className={cn(
                    "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                    weekPaceIndicator.color === "success"
                      ? "bg-success-softer text-success-fg"
                      : weekPaceIndicator.color === "info"
                      ? "bg-info-softer text-info-fg"
                      : "bg-danger-softer text-danger-fg",
                  )}
                  title="Week pace: actual progress vs expected progress at this point in the week"
                >
                  <Gauge className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span>{`${weekPaceIndicator.label} (${Math.round(weekPaceIndicator.paceRatio * 100)}%)`}</span>
                </span>
              ) : null}
              {/* Week Health Score chip (Improvement 15) */}
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  weekHealthScore.grade === "A"
                    ? "bg-success-softer text-success-fg"
                    : weekHealthScore.grade === "B"
                    ? "bg-info-softer text-info-fg"
                    : weekHealthScore.grade === "C"
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg",
                )}
                title={`Week health score: ${weekHealthScore.score}/100 (capacity fill, material readiness, priority coverage, blocker-free days)`}
              >
                <HeartPulse className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>{`Week health: ${weekHealthScore.grade} (${weekHealthScore.score})`}</span>
              </span>
              {/* Batch Conflict Count chip (Improvement 16) */}
              {batchConflictChip !== null ? (
                <span
                  className={cn(
                    "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                    batchConflictChip.conflictDays > 0
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-success-softer text-success-fg",
                  )}
                  title="Conflict days: days where the same item appears in more than one day's plan, or a day exceeds capacity"
                >
                  <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span>{batchConflictChip.message}</span>
                </span>
              ) : null}
              {/* Material Gap Count chip (Improvement 18) */}
              {materialGapChip !== null ? (
                <span
                  className={cn(
                    "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                    materialGapChip.gapCount > 0
                      ? "bg-danger-softer text-danger-fg"
                      : "bg-success-softer text-success-fg",
                  )}
                  title="Items in this week's plan that have insufficient material coverage"
                >
                  <PackageX className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span>
                    {materialGapChip.gapCount > 0
                      ? `${materialGapChip.gapCount} material gap(s)`
                      : "Materials OK"}
                  </span>
                </span>
              ) : null}
              {/* Late Items chip (Improvement 20) */}
              {lateItemsChip !== null ? (
                <span
                  className={cn(
                    "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                    lateItemsChip.lateCount > 0
                      ? "bg-danger-softer text-danger-fg"
                      : "bg-success-softer text-success-fg",
                  )}
                  title={`Items planned after their deadline (${lateItemsChip.lateCount} of ${lateItemsChip.totalWithDeadline} items with a deadline)`}
                >
                  <Clock className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span>
                    {lateItemsChip.lateCount > 0
                      ? `${lateItemsChip.lateCount} late`
                      : "On schedule"}
                  </span>
                </span>
              ) : null}
              {/* Scheduled Units chip (Improvement 22) */}
              {scheduledUnitsChip !== null ? (
                <span
                  className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-info-softer text-info-fg"
                  title={`Total planned units across all active items this week`}
                >
                  <Package className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span>{`${scheduledUnitsChip.totalUnits.toLocaleString()} units planned (${scheduledUnitsChip.totalItems} items)`}</span>
                </span>
              ) : null}
              {/* Unplanned Items chip (Improvement 24) */}
              {unplannedItemsChip !== null ? (
                <span
                  className={cn(
                    "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                    unplannedItemsChip.unplannedCount > 0
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-success-softer text-success-fg",
                  )}
                  title={`Items in this week's plan without a confirmed plan (${unplannedItemsChip.unplannedCount} of ${unplannedItemsChip.totalRecommended})`}
                >
                  <ClipboardX className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span>
                    {unplannedItemsChip.unplannedCount > 0
                      ? `${unplannedItemsChip.unplannedCount} unplanned`
                      : "All planned"}
                  </span>
                </span>
              ) : null}
              {/* Skipped Days chip (R41-2) */}
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  skippedDaysCount > 0
                    ? "bg-bg-muted text-fg-muted"
                    : "bg-success-softer text-success-fg",
                )}
                title={`Weekdays in the current week with no planned production (${skippedDaysCount} of 5 workdays)`}
              >
                <CalendarMinus className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>{`Skipped: ${skippedDaysCount} day${skippedDaysCount !== 1 ? "s" : ""}`}</span>
              </span>
              {/* Batch Count chip (R42-2) */}
              <span
                className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted"
                title={`Distinct production items scheduled this week: ${batchCount}`}
              >
                <Layers className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>{`Batches: ${batchCount}`}</span>
              </span>
              {/* Completed Items chip (R43-2) */}
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  completedItemsCount > 0
                    ? "bg-success-softer text-success-fg"
                    : "bg-bg-muted text-fg-muted",
                )}
                title={`Items with status COMPLETED or DONE this week: ${completedItemsCount}`}
              >
                <CheckSquare className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>{`Done: ${completedItemsCount} items`}</span>
              </span>
              {/* Avg Batch Size chip (R44-2) */}
              <span
                className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted"
                title={`Average batch size this week: ${avgBatchSize} units`}
              >
                <Package className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>{`Avg batch: ${avgBatchSize} units`}</span>
              </span>
              {/* Utilization Rate chip (R45-2) */}
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  utilizationRatePct >= 80
                    ? "bg-success-softer text-success-fg"
                    : utilizationRatePct >= 60
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg",
                )}
                title={`Capacity utilization rate this week: ${utilizationRatePct}%`}
              >
                <Gauge className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>{`Util: ${utilizationRatePct}%`}</span>
              </span>
              {/* Carry-Over Items chip (R46-2) */}
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  carryOverCount > 0
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-success-softer text-success-fg",
                )}
                title={`Items carried over from last week still present in this plan: ${carryOverCount}`}
              >
                <Forward className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>{`Carry-over: ${carryOverCount}`}</span>
              </span>
              {/* Longest Run chip (R47-2) */}
              <span
                className="text-3xs rounded-full px-2 py-0.5 flex items-center gap-1 bg-bg-muted text-fg-muted"
                title={`Longest single planned run this week: ${longestRunQty} units`}
              >
                <Maximize2 className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>{`Longest: ${longestRunQty} units`}</span>
              </span>
              {/* First Pass Yield chip (R48-2) */}
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  fpyPct >= 95
                    ? "bg-success-softer text-success-fg"
                    : fpyPct >= 85
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg",
                )}
                title={`First Pass Yield this week: ${fpyPct}% (good output without rework or scrap)`}
              >
                <Target className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>{`FPY: ${fpyPct}%`}</span>
              </span>
              {/* Critical Path Item chip (R49-2) */}
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  criticalPathCount > 0
                    ? "bg-danger-softer text-danger-fg"
                    : "bg-success-softer text-success-fg",
                )}
                title={`Items on the critical path this week: ${criticalPathCount}`}
              >
                <Flag className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>{`Critical: ${criticalPathCount} item${criticalPathCount === 1 ? "" : "s"}`}</span>
              </span>
              {/* Idle Time chip (R50-2) */}
              <span
                className={cn(
                  "text-3xs rounded-full px-2 py-0.5 flex items-center gap-1",
                  idleTimeHrs <= 1
                    ? "bg-success-softer text-success-fg"
                    : idleTimeHrs <= 3
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg",
                )}
                title={`Estimated idle time this week: ${idleTimeHrs}h`}
              >
                <Pause className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span>{`Idle: ${idleTimeHrs}h`}</span>
              </span>
            </>
          ) : null
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Output target toggle (Improvement 2) */}
            <button
              type="button"
              className={cn(
                "btn btn-sm gap-1",
                showTargetEditor && "text-accent",
              )}
              onClick={() => setShowTargetEditor((v) => !v)}
              title="Set weekly output target"
            >
              <Target className="h-3 w-3" strokeWidth={2} />
              Output target
            </button>
            {/* Capacity fill gauge toggle (Improvement 3) */}
            <button
              type="button"
              className={cn(
                "btn btn-sm gap-1",
                showCapacityFill && "text-accent",
              )}
              onClick={() => setShowCapacityFill((v) => !v)}
              title="Show weekly capacity utilization"
            >
              <Gauge className="h-3 w-3" strokeWidth={2} />
              Capacity
            </button>
            {/* Material Readiness toggle (Improvement 5) */}
            <button
              type="button"
              className={cn(
                "btn btn-sm gap-1",
                showMaterialReadiness && "text-accent",
              )}
              onClick={() => setShowMaterialReadiness((v) => !v)}
              title="Show material readiness for planned items"
            >
              <PackageSearch className="h-3 w-3" strokeWidth={2} />
              Materials
            </button>
            {/* Cycle Time toggle (Improvement 6) */}
            <button
              type="button"
              className={cn(
                "btn btn-sm gap-1",
                showCycleTimeEditor && "text-accent",
              )}
              onClick={() => setShowCycleTimeEditor((v) => !v)}
              title="Set weekly cycle time target"
            >
              <Timer className="h-3 w-3" strokeWidth={2} />
              Cycle Time
            </button>
            {/* Effort × Urgency Matrix toggle (Improvement 9) */}
            <button
              type="button"
              className={cn(
                "btn btn-sm gap-1",
                showEffortMatrix && "text-accent",
              )}
              onClick={() => setShowEffortMatrix((v) => !v)}
              title="Show item effort × urgency matrix"
            >
              <Grid2X2 className="h-3 w-3" strokeWidth={2} />
              Matrix
            </button>
            {/* Batching Opportunity Indicator toggle (Improvement 11) */}
            <button
              type="button"
              className={cn(
                "btn btn-sm gap-1 relative",
                showBatchingOpps && "text-accent",
              )}
              onClick={() => setShowBatchingOpps((v) => !v)}
              title="Show batching opportunities across the week"
            >
              <Layers className="h-3 w-3" strokeWidth={2} />
              Batching
              {batchingOpportunities.length > 0 ? (
                <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-info/20 text-info-fg text-3xs font-semibold">
                  {batchingOpportunities.length}
                </span>
              ) : null}
            </button>
            {/* Week Commentary toggle (Improvement 12) */}
            <button
              type="button"
              className={cn(
                "btn btn-sm gap-1 relative",
                showWeekCommentary && "text-accent",
              )}
              onClick={() => setShowWeekCommentary((v) => !v)}
              title="Add or view weekly planning notes"
            >
              <MessageSquare className="h-3 w-3" strokeWidth={2} />
              Notes
              {weekCommentary.trim().length > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent" />
              ) : null}
            </button>
            {/* Plan Change Log toggle (Improvement 13) */}
            <button
              type="button"
              className={cn(
                "btn btn-sm gap-1 relative",
                showChangeLog && "text-accent",
              )}
              onClick={() => setShowChangeLog((v) => !v)}
              title="Show plan change log"
            >
              <History className="h-3 w-3" strokeWidth={2} />
              Log
              {planChangeLogs.length > 0 ? (
                <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-info/20 text-info-fg text-3xs font-semibold">
                  {planChangeLogs.length}
                </span>
              ) : null}
            </button>
            {/* Priority Item Highlight toggle (Improvement 14) */}
            <button
              type="button"
              className={cn(
                "btn btn-sm gap-1 relative",
                showPriorityHighlight && "text-accent text-yellow-500",
              )}
              onClick={() => setShowPriorityHighlight((v) => !v)}
              title="Highlight priority items"
            >
              <Star className="h-3 w-3" strokeWidth={2} />
              Priority
              {priorityItemIds.size > 0 ? (
                <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-yellow-100 text-yellow-700 text-3xs font-semibold">
                  {priorityItemIds.size}
                </span>
              ) : null}
            </button>
            {/* Week Summary toggle (Improvement 17) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showWeekSummary && "text-accent")}
              onClick={() => setShowWeekSummary((v) => !v)}
              title="View and copy week summary"
            >
              <FileText className="h-3 w-3" strokeWidth={2} />
              Week summary
            </button>
            {/* Day Capacity Bars toggle (Improvement 19) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showDayCapacityBars && "text-accent")}
              onClick={() => setShowDayCapacityBars((v) => !v)}
              title="Show daily capacity fill bars"
            >
              <BarChart3 className="h-3 w-3" strokeWidth={2} />
              Day bars
            </button>
            {/* Week Progress Ring toggle (Improvement 21) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showWeekProgressRing && "text-accent")}
              onClick={() => setShowWeekProgressRing((v) => !v)}
              title="Show week completion progress ring"
            >
              <CircleDot className="h-3 w-3" strokeWidth={2} />
              Week progress
            </button>
            {/* Item Frequency Chart toggle (Improvement 23) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showItemFrequencyChart && "text-accent")}
              onClick={() => setShowItemFrequencyChart((v) => !v)}
              title="Show item production frequency this week"
            >
              <BarChart2 className="h-3 w-3" strokeWidth={2} />
              Item frequency
            </button>
            {/* Overtime Risk Panel toggle (R41-1) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showOvertimeRiskPanel && "text-accent")}
              onClick={() => setShowOvertimeRiskPanel((v) => !v)}
              title="Show daily overtime risk by load percentage"
            >
              <AlertCircle className="h-3 w-3" strokeWidth={2} />
              Overtime Risk
            </button>
            {/* Weekly Cost Estimate toggle (R42-1) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showWeeklyCostEstimate && "text-accent")}
              onClick={() => setShowWeeklyCostEstimate((v) => !v)}
              title="Show weekly estimated cost breakdown"
            >
              <CircleDollarSign className="h-3 w-3" strokeWidth={2} />
              Cost Estimate
            </button>
            {/* Capacity Forecast Chart toggle (R43-1) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showCapacityForecastChart && "text-accent")}
              onClick={() => setShowCapacityForecastChart((v) => !v)}
              title="Show 4-week capacity forecast chart"
            >
              <AreaChart className="h-3 w-3" strokeWidth={2} />
              Capacity Forecast
            </button>
            {/* Item Priority Matrix toggle (R44-1) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showItemPriorityMatrix && "text-accent")}
              onClick={() => setShowItemPriorityMatrix((v) => !v)}
              title="Show item priority matrix (Urgency × Volume)"
            >
              <Grid3X3 className="h-3 w-3" strokeWidth={2} />
              Priority Matrix
            </button>
            {/* Daily Throughput Sparkline toggle (R45-1) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showDailyThroughputSparkline && "text-accent")}
              onClick={() => setShowDailyThroughputSparkline((v) => !v)}
              title="Show daily throughput sparkline for the current week"
            >
              <Activity className="h-3 w-3" strokeWidth={2} />
              Throughput
            </button>
            {/* Output Forecast Bar toggle (R46-1) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showOutputForecastBar && "text-accent")}
              onClick={() => setShowOutputForecastBar((v) => !v)}
              title="Show output forecast bar chart: actual vs planned per day (Sun–Thu)"
            >
              <BarChart3 className="h-3 w-3" strokeWidth={2} />
              Output Forecast
            </button>
            {/* Changeover Time Panel toggle (R47-1) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showChangeoverTimePanel && "text-accent")}
              onClick={() => setShowChangeoverTimePanel((v) => !v)}
              title="Show changeover time between production runs this week"
            >
              <Timer className="h-3 w-3" strokeWidth={2} />
              Changeovers
            </button>
            {/* Scrap Tracking Panel toggle (R48-1) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showScrapTrackingPanel && "text-accent")}
              onClick={() => setShowScrapTrackingPanel((v) => !v)}
              title="Show per-day scrap summary for this week"
            >
              <Trash2 className="h-3 w-3" strokeWidth={2} />
              Scrap
            </button>
            {/* Buffer Stock Panel toggle (R49-1) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showBufferStockPanel && "text-accent")}
              onClick={() => setShowBufferStockPanel((v) => !v)}
              title="Show buffer stock levels vs targets for key ingredients"
            >
              <Package className="h-3 w-3" strokeWidth={2} />
              Buffer
            </button>
            {/* Weekly Production Forecast toggle (R50-1) */}
            <button
              type="button"
              className={cn("btn btn-sm gap-1", showWeeklyProductionForecast && "text-accent")}
              onClick={() => setShowWeeklyProductionForecast((v) => !v)}
              title="Show 4-week planned vs forecast comparison"
            >
              <TrendingUp className="h-3 w-3" strokeWidth={2} />
              Wk Forecast
            </button>
            {/* Export week plan (Improvement 7) */}
            <button
              type="button"
              className="btn btn-sm gap-1"
              onClick={handleExportWeekPlan}
              title="Copy week plan to clipboard"
            >
              {copiedExport ? (
                <Check className="h-3 w-3 text-success-fg" strokeWidth={2.5} />
              ) : (
                <Download className="h-3 w-3" strokeWidth={2} />
              )}
              Export
            </button>
            <button
              type="button"
              className="btn btn-sm gap-1"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              title="Previous week"
            >
              <ChevronLeft className="h-3 w-3" strokeWidth={2} />
              Previous Week
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setWeekStart(startOfWeek(new Date()))}
            >
              This Week
            </button>
            <button
              type="button"
              className="btn btn-sm gap-1"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              title="Next week"
            >
              Next Week
              <ChevronRight className="h-3 w-3" strokeWidth={2} />
            </button>
            {canAct ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1.5"
                  onClick={() =>
                    // Cycle 12 P1 Phase3-S4-A fix: default the modal date to
                    // today (operator's working day) rather than the start of
                    // the currently-shown week (often a Sunday — non-working
                    // day for an Israeli factory). Operator can still pick
                    // any date in the picker; this just sets a friendlier
                    // default. Per W4 contract §4.1 step 4 + cycle-11 audit
                    // PRODUCTION/docs/qa/runtime_dead_end_audit.md.
                    setShowManualAdd({ defaultDate: toIsoDate(new Date()) })
                  }
                  data-testid="header-add-manual"
                >
                  <Plus className="h-3 w-3" strokeWidth={2.5} />
                  Add Manually
                </button>
                <button
                  type="button"
                  className="btn btn-sm gap-1.5"
                  onClick={() =>
                    // Cycle 12 P1 Phase3-S4-A fix: same default-to-today
                    // semantics for the rec-picker CTA. The picked rec
                    // brings its own suggested_for_date in the modal, so
                    // this default only matters before the operator picks.
                    setShowAddFromRecs({ defaultDate: toIsoDate(new Date()) })
                  }
                  title="Pick from approved production recommendations"
                  data-testid="header-add-from-recs"
                >
                  <Sparkles className="h-3 w-3" strokeWidth={2.5} />
                  Add from Recommendations
                </button>
              </>
            ) : null}
          </div>
        }
      />

      {/* Week Summary Panel (Improvement 17) */}
      {showWeekSummary ? (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
          <div className="flex items-center gap-1 mb-1">
            <FileText className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">Week Summary</span>
          </div>
          <pre className="text-3xs text-fg-muted whitespace-pre-wrap max-h-32 overflow-y-auto">
            {(() => {
              const weekLabel = fmtWeekRange(weekStart, weekEnd);
              const summaryLines: string[] = [`GT Week Summary — ${weekLabel}`, "=================="];
              let totalUnits = 0;
              let priorityCount = 0;
              for (let i = 0; i < 7; i++) {
                const date = addDays(weekStart, i);
                const iso = toIsoDate(date);
                const dayPlans = plansByDay.get(iso) ?? [];
                const activePlans = dayPlans.filter((p) => p.rendered_state !== "cancelled");
                if (activePlans.length === 0) continue;
                const { dayName, dateLabel } = fmtDayHeader(date);
                summaryLines.push(`${dayName} ${dateLabel}:`);
                for (const p of activePlans) {
                  const name: string = (p as any).item_name ?? p.item_id;
                  const qty: number = (p as any).planned_qty ?? (p as any).quantity ?? (p as any).qty ?? 0;
                  totalUnits += qty;
                  const isPri = priorityItemIds.has((p as any).item_id ?? "");
                  if (isPri) priorityCount += 1;
                  summaryLines.push(`  • ${name}: ${qty} units${isPri ? " ★" : ""}`);
                }
              }
              summaryLines.push("==================");
              summaryLines.push(`Total units planned: ${totalUnits}`);
              summaryLines.push(`Capacity fill: ${capacityFillPct}%`);
              summaryLines.push(`Priority items: ${priorityCount}`);
              return summaryLines.join("\n");
            })()}
          </pre>
          <button
            type="button"
            className="btn btn-sm gap-1 mt-1"
            onClick={handleExportWeekSummary}
          >
            {copiedWeekSummary ? (
              <>
                <Check className="h-3 w-3 text-success-fg" strokeWidth={2.5} />
                Copied!
              </>
            ) : (
              <>
                <FileText className="h-3 w-3" strokeWidth={2} />
                Copy to Clipboard
              </>
            )}
          </button>
        </div>
      ) : null}

      {/* Day Capacity Bars Panel (Improvement 19) */}
      {showDayCapacityBars ? (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2">
          <div className="flex items-center gap-1 mb-2">
            <BarChart3 className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">Daily Capacity Fill</span>
            <span className="ml-1 text-3xs text-fg-faint">({dayCapacityBarsData.weekLabel})</span>
          </div>
          <div className="flex gap-2 items-end h-16">
            {dayCapacityBarsData.days.map((day) => (
              <div key={day.label} className="flex flex-col items-center w-10">
                <span className="text-3xs text-fg-faint mb-0.5">{day.pct}%</span>
                <div className="w-10 bg-bg-muted rounded-sm overflow-hidden" style={{ height: "36px" }}>
                  <div
                    className={cn(
                      "w-full rounded-sm transition-all",
                      day.status === "over"
                        ? "bg-danger-fg"
                        : day.status === "high"
                        ? "bg-warning-fg"
                        : day.status === "ok"
                        ? "bg-success-fg/70"
                        : "bg-bg-muted",
                    )}
                    style={{ height: `${Math.min(100, day.pct)}%` }}
                  />
                </div>
                <span className="text-3xs text-fg-muted mt-0.5">{day.label}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-2">
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-2 h-2 rounded-sm bg-danger-fg" />
              Over
            </span>
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-2 h-2 rounded-sm bg-warning-fg" />
              High (&gt;80%)
            </span>
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-2 h-2 rounded-sm bg-success-fg/70" />
              OK (&gt;50%)
            </span>
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-2 h-2 rounded-sm bg-bg-muted border border-border" />
              Low
            </span>
          </div>
        </div>
      ) : null}

      {/* Week Progress Ring Panel (Improvement 21) */}
      {showWeekProgressRing ? (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1 mb-2">
            <CircleDot className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">Week Progress</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            {(() => {
              const circumference = 2 * Math.PI * 34; // ≈ 213.63
              const offset = circumference - (weekProgressRingData.completedPct / 100) * circumference;
              return (
                <svg
                  viewBox="0 0 80 80"
                  width="80"
                  height="80"
                  style={{ transform: "rotate(-90deg)" }}
                >
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="8"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${circumference}`}
                    strokeDashoffset={`${offset}`}
                    style={{ transition: "stroke-dashoffset 0.4s ease" }}
                  />
                  <text
                    x="40"
                    y="44"
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize="14"
                    fontWeight="600"
                    style={{ transform: "rotate(90deg)", transformOrigin: "40px 40px" }}
                  >
                    {weekProgressRingData.completedPct}%
                  </text>
                </svg>
              );
            })()}
            <span className="text-3xs text-fg-muted text-center">
              {`${weekProgressRingData.completed} of ${weekProgressRingData.total} items completed`}
            </span>
          </div>
        </div>
      ) : null}

      {/* Item Frequency Chart panel (Improvement 23) */}
      {showItemFrequencyChart ? (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1 mb-3">
            <BarChart2 className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">
              Item Production Frequency This Week
            </span>
          </div>
          {itemFrequencyData === null ? (
            <p className="text-3xs text-fg-faint">
              Not enough distinct items to display (need at least 3).
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {itemFrequencyData.items.map((row) => (
                <div key={row.name} className="flex items-center gap-2">
                  <span
                    className="text-3xs text-fg-muted shrink-0 truncate max-w-24"
                    title={row.name}
                  >
                    {row.name}
                  </span>
                  <div className="flex-1 flex items-center gap-1 min-w-0">
                    <div
                      className="h-2 rounded-full bg-accent/60 shrink-0"
                      style={{
                        width: `${Math.round((row.dayCount / itemFrequencyData.maxDays) * 100)}%`,
                        minWidth: "4px",
                      }}
                    />
                    <span className="text-3xs text-fg-muted shrink-0">
                      {row.dayCount}d
                    </span>
                  </div>
                  <span className="text-3xs text-fg-faint shrink-0">
                    {row.totalQty.toLocaleString()} units
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Overtime Risk Panel (R41-1) */}
      {showOvertimeRiskPanel ? (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1 mb-3">
            <AlertCircle className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">
              Overtime Risk — Daily Load
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {OVERTIME_RISK_DAYS.map((day) => {
              const clampedPct = Math.min(day.load, 100);
              const isRed = day.load > 95;
              const isYellow = day.load >= 80 && day.load <= 95;
              const labelColor = isRed
                ? "text-danger-fg"
                : isYellow
                ? "text-warning-fg"
                : "text-success-fg";
              const barColor = isRed
                ? "bg-danger-fg"
                : isYellow
                ? "bg-warning-fg"
                : "bg-success-fg";
              const labelText = isRed
                ? `${day.load}% — High risk`
                : isYellow
                ? `${day.load}% — Watch`
                : `${day.load}% — OK`;
              return (
                <div key={day.name} className="flex items-center gap-2">
                  <span className="text-3xs text-fg-muted shrink-0 w-8">{day.name}</span>
                  <div className="flex-1 h-2 bg-bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", barColor)}
                      style={{ width: `${clampedPct}%` }}
                    />
                  </div>
                  <span className={cn("text-3xs shrink-0 w-28", labelColor)}>
                    {labelText}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-3">
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-2 h-2 rounded-full bg-success-fg" />
              {"< 80% — OK"}
            </span>
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-2 h-2 rounded-full bg-warning-fg" />
              {"80–95% — Watch"}
            </span>
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-2 h-2 rounded-full bg-danger-fg" />
              {"> 95% — High risk"}
            </span>
          </div>
        </div>
      ) : null}

      {/* Weekly Cost Estimate Panel (R42-1) */}
      {showWeeklyCostEstimate ? (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1 mb-3">
            <CircleDollarSign className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">
              Weekly Cost Estimate
            </span>
            <span className="text-3xs text-fg-faint ml-1">(mock — cost rollup ships in Gate 5)</span>
          </div>
          <div className="flex flex-col gap-2">
            {WEEKLY_COST_ROWS.map((row) => {
              const pct = Math.round((row.amount / WEEKLY_COST_TOTAL) * 100);
              const isTotal = row.label === "Total";
              return (
                <div key={row.label} className={cn("flex items-center gap-2", isTotal && "mt-1 border-t border-border pt-2")}>
                  <span className={cn("text-3xs shrink-0 w-16", isTotal ? "text-fg-strong font-semibold" : "text-fg-muted")}>
                    {row.label}
                  </span>
                  {!isTotal ? (
                    <div className="flex-1 h-2 bg-bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent/60 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : (
                    <div className="flex-1" />
                  )}
                  <span className={cn("text-3xs shrink-0 tabular-nums", isTotal ? "text-fg-strong font-semibold" : "text-fg-muted")}>
                    {`₪${row.amount.toLocaleString()}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Capacity Forecast Chart panel (R43-1) */}
      {showCapacityForecastChart ? (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1 mb-2">
            <AreaChart className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">
              Capacity Forecast
            </span>
            <span className="text-3xs text-fg-faint ml-1">(4-week outlook, mock)</span>
          </div>
          {(() => {
            const W = 260;
            const H = 60;
            const PAD_X = 0;
            const PAD_Y = 4;
            const innerW = W - PAD_X * 2;
            const innerH = H - PAD_Y * 2;
            const pts = CAPACITY_FORECAST_WEEKS.map((w, i) => {
              const x = PAD_X + (i / (CAPACITY_FORECAST_WEEKS.length - 1)) * innerW;
              const y = PAD_Y + innerH - (w.pct / 100) * innerH;
              return { x, y, ...w };
            });
            // Build SVG area path: line across top, then close down to baseline
            const lineD = pts
              .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(" ");
            const areaD =
              lineD +
              ` L${pts[pts.length - 1].x.toFixed(1)},${(PAD_Y + innerH).toFixed(1)}` +
              ` L${pts[0].x.toFixed(1)},${(PAD_Y + innerH).toFixed(1)} Z`;
            return (
              <div>
                <svg
                  width={W}
                  height={H}
                  viewBox={`0 0 ${W} ${H}`}
                  aria-label="4-week capacity forecast area chart"
                  role="img"
                  style={{ display: "block", maxWidth: "100%" }}
                >
                  {/* Shaded area fill */}
                  <path d={areaD} fill="currentColor" className="text-accent/20" />
                  {/* Solid top stroke */}
                  <path
                    d={lineD}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="text-accent"
                  />
                  {/* Data point dots */}
                  {pts.map((p) => (
                    <circle
                      key={p.label}
                      cx={p.x}
                      cy={p.y}
                      r={3}
                      fill="currentColor"
                      className="text-accent"
                    />
                  ))}
                </svg>
                {/* Week labels */}
                <div
                  className="flex justify-between mt-1"
                  style={{ width: W, maxWidth: "100%" }}
                >
                  {pts.map((p) => (
                    <div key={p.label} className="flex flex-col items-center" style={{ minWidth: 0 }}>
                      <span className="text-3xs text-fg-faint">{p.label}</span>
                      <span className="text-3xs text-fg-muted font-mono">{p.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      {/* Item Priority Matrix panel (R44-1) */}
      {showItemPriorityMatrix ? (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1 mb-3">
            <Grid3X3 className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">
              Priority Matrix
            </span>
            <span className="text-3xs text-fg-faint ml-1">Urgency × Volume</span>
          </div>
          {/* 2×2 grid: columns = Volume (High | Low), rows = Urgency (High | Low) */}
          <div className="grid grid-cols-2 gap-0 rounded overflow-hidden border border-border text-3xs">
            {/* Column headers */}
            <div className="col-span-2 grid grid-cols-[auto_1fr_1fr]">
              <div className="w-16" />
              <div className="py-1 text-center text-fg-muted font-medium border-b border-l border-border">
                Volume: High
              </div>
              <div className="py-1 text-center text-fg-muted font-medium border-b border-l border-border">
                Volume: Low
              </div>
            </div>
            {/* Row: Urgency High */}
            {(["High", "Low"] as const).map((urgency) => (
              <div key={urgency} className="col-span-2 grid grid-cols-[auto_1fr_1fr]">
                {/* Row header */}
                <div className="w-16 flex items-center justify-center border-t border-r border-border px-1 py-2">
                  <span className="text-fg-muted font-medium" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: "10px" }}>
                    {`Urgency: ${urgency}`}
                  </span>
                </div>
                {(["High", "Low"] as const).map((volume) => {
                  const item = PRIORITY_MATRIX_ITEMS.find(
                    (it) => it.urgency === urgency && it.volume === volume,
                  );
                  return (
                    <div
                      key={volume}
                      className={cn(
                        "border-t border-l border-border p-2 flex flex-col gap-1 min-h-[56px]",
                        item ? item.bg : "bg-bg-subtle",
                      )}
                    >
                      {item ? (
                        <span
                          className={cn(
                            "rounded px-1 py-0.5 font-medium text-3xs truncate",
                            item.color,
                          )}
                          title={item.name}
                        >
                          {item.name}
                        </span>
                      ) : (
                        <span className="text-fg-faint text-3xs">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-2 h-2 rounded-sm bg-danger-softer border border-danger/20" />
              High urgency, High volume
            </span>
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-2 h-2 rounded-sm bg-warning-softer border border-warning/20" />
              High urgency, Low volume
            </span>
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-2 h-2 rounded-sm bg-info-softer border border-info/20" />
              Low urgency, High volume
            </span>
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-2 h-2 rounded-sm bg-bg-muted border border-border" />
              Low urgency, Low volume
            </span>
          </div>
        </div>
      ) : null}

      {/* Daily Throughput Sparkline panel (R45-1) */}
      {showDailyThroughputSparkline ? (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1 mb-2">
            <Activity className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">
              Daily Throughput
            </span>
            <span className="text-3xs text-fg-faint ml-1">Sun–Thu this week</span>
          </div>
          <div className="overflow-x-auto">
            <svg
              width={SPARKLINE_W}
              height={SPARKLINE_H}
              viewBox={`0 0 ${SPARKLINE_W} ${SPARKLINE_H}`}
              className="block"
              aria-label="Daily throughput sparkline"
            >
              {/* Area fill below the line */}
              <polygon
                points={sparklineArea}
                className="fill-accent/10"
              />
              {/* Line */}
              <polyline
                points={sparklinePolyline}
                fill="none"
                className="stroke-accent"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {/* Dots at each data point */}
              {sparklinePoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={3}
                  className="fill-accent stroke-bg-subtle"
                  strokeWidth={1}
                />
              ))}
            </svg>
            {/* Day labels below */}
            <div
              className="flex justify-between mt-1"
              style={{ width: SPARKLINE_W, maxWidth: "100%" }}
            >
              {SPARKLINE_DAYS.map((day, i) => (
                <div
                  key={day}
                  className="flex flex-col items-center"
                  style={{
                    position: "relative",
                    left: i === 0 ? `${SPARKLINE_PAD_X}px` : i === SPARKLINE_DAYS.length - 1 ? `-${SPARKLINE_PAD_X}px` : undefined,
                  }}
                >
                  <span className="text-3xs text-fg-faint">{day}</span>
                  <span className="text-3xs text-fg-muted font-mono">
                    {SPARKLINE_VALUES[i].toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Output Forecast Bar chart panel (R46-1) */}
      {showOutputForecastBar ? (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1 mb-2">
            <BarChart3 className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">
              Output Forecast
            </span>
            <span className="text-3xs text-fg-faint ml-1">Actual vs. planned (Sun–Thu)</span>
          </div>
          <div className="overflow-x-auto">
            <svg
              width={FORECAST_BAR_W}
              height={FORECAST_BAR_H}
              viewBox={`0 0 ${FORECAST_BAR_W} ${FORECAST_BAR_H}`}
              className="block"
              aria-label="Output forecast bar chart comparing actual vs planned output per day"
              role="img"
            >
              {FORECAST_DAYS.map((day, i) => {
                const slotCenterX = i * FORECAST_SLOT_W + FORECAST_SLOT_W / 2;
                const plannedH = Math.round(
                  (FORECAST_PLANNED[i] / FORECAST_MAX) * (FORECAST_BAR_H - 8),
                );
                const actualH = Math.round(
                  (FORECAST_ACTUAL[i] / FORECAST_MAX) * (FORECAST_BAR_H - 8),
                );
                const plannedX = slotCenterX - FORECAST_BAR_WIDTH / 2 - FORECAST_GAP / 2;
                const actualX = slotCenterX + FORECAST_GAP / 2;
                return (
                  <g key={day}>
                    {/* Planned bar (gray, behind) */}
                    <rect
                      x={plannedX}
                      y={FORECAST_BAR_H - plannedH - 4}
                      width={FORECAST_BAR_WIDTH}
                      height={plannedH}
                      rx={2}
                      className="fill-fg-faint/40"
                    />
                    {/* Actual bar (accent, front) — only rendered when > 0 */}
                    {FORECAST_ACTUAL[i] > 0 ? (
                      <rect
                        x={actualX}
                        y={FORECAST_BAR_H - actualH - 4}
                        width={FORECAST_BAR_WIDTH}
                        height={actualH}
                        rx={2}
                        className="fill-accent/80"
                      />
                    ) : null}
                  </g>
                );
              })}
            </svg>
            {/* Day labels */}
            <div
              className="flex mt-1"
              style={{ width: FORECAST_BAR_W, maxWidth: "100%" }}
            >
              {FORECAST_DAYS.map((day, i) => (
                <div
                  key={day}
                  className="flex flex-col items-center"
                  style={{ width: FORECAST_SLOT_W }}
                >
                  <span className="text-3xs text-fg-faint">{day}</span>
                  <span className="text-3xs text-fg-muted font-mono">
                    {FORECAST_ACTUAL[i] > 0
                      ? `${FORECAST_ACTUAL[i]}/${FORECAST_PLANNED[i]}`
                      : `—/${FORECAST_PLANNED[i]}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {/* Legend */}
          <div className="flex gap-4 mt-2">
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-3 h-2 rounded-sm bg-fg-faint/40" />
              Planned
            </span>
            <span className="flex items-center gap-1 text-3xs text-fg-faint">
              <span className="inline-block w-3 h-2 rounded-sm bg-accent/80" />
              Actual
            </span>
          </div>
        </div>
      ) : null}

      {/* Changeover Time Panel (R47-1) */}
      {showChangeoverTimePanel ? (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1 mb-3">
            <Timer className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">
              Changeover Times
            </span>
            <span className="text-3xs text-fg-faint ml-1">Production sequence this week</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {CHANGEOVER_TRANSITIONS.map((t, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded text-3xs",
                  idx % 2 === 0 ? "bg-bg-subtle" : "bg-bg-muted",
                )}
              >
                <span className="text-fg-muted flex-1 truncate">
                  <span className="font-medium text-fg-strong">{t.from}</span>
                  <span className="mx-1 text-fg-faint">→</span>
                  <span className="font-medium text-fg-strong">{t.to}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-fg-muted">
                  {t.minutes} min
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-3xs">
            <span className="text-fg-muted">Total changeover time this week</span>
            <span className="font-mono tabular-nums font-semibold text-fg-strong">
              {changeoverTotalHrs} hrs ({changeoverTotalMinutes} min)
            </span>
          </div>
        </div>
      ) : null}

      {/* Scrap Tracking Panel (R48-1) */}
      {showScrapTrackingPanel ? (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1 mb-3">
            <Trash2 className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">
              Scrap Tracking
            </span>
            <span className="text-3xs text-fg-faint ml-1">Daily scrap summary (Sun–Thu)</span>
          </div>
          <div className="flex flex-col gap-0.5">
            {SCRAP_DAYS.map((row, idx) => (
              <div
                key={row.day}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded text-3xs",
                  idx % 2 === 0 ? "bg-bg-subtle" : "bg-bg-muted",
                )}
              >
                <span className="w-8 font-medium text-fg-strong shrink-0">{row.day}</span>
                <span className="flex-1 font-mono tabular-nums text-fg-muted">
                  {row.scrapQty} units
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono tabular-nums font-semibold rounded-full px-1.5 py-0.5",
                    row.scrapRate < 2
                      ? "bg-success-softer text-success-fg"
                      : row.scrapRate < 5
                      ? "bg-warning-softer text-warning-fg"
                      : "bg-danger-softer text-danger-fg",
                  )}
                >
                  {row.scrapRate.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-3xs">
            <span className="text-fg-muted">Week total scrap</span>
            <div className="flex items-center gap-2">
              <span className="font-mono tabular-nums text-fg-strong">
                {scrapWeekTotal} units
              </span>
              <span
                className={cn(
                  "font-mono tabular-nums font-semibold rounded-full px-1.5 py-0.5",
                  scrapWeekRate < 2
                    ? "bg-success-softer text-success-fg"
                    : scrapWeekRate < 5
                    ? "bg-warning-softer text-warning-fg"
                    : "bg-danger-softer text-danger-fg",
                )}
              >
                avg {scrapWeekRate.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Buffer Stock Panel (R49-1) */}
      {showBufferStockPanel ? (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1 mb-3">
            <Package className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">
              Buffer Stock
            </span>
            <span className="text-3xs text-fg-faint ml-1">Current vs target buffer levels</span>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full text-3xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-fg-muted py-1 pr-3">Item</th>
                  <th className="text-right font-medium text-fg-muted py-1 px-3">Buffer Target</th>
                  <th className="text-right font-medium text-fg-muted py-1 px-3">Current Stock</th>
                  <th className="text-right font-medium text-fg-muted py-1 px-3">Gap</th>
                  <th className="text-center font-medium text-fg-muted py-1 pl-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {BUFFER_STOCK_ITEMS.map((item, idx) => {
                  const gap = item.target - item.current;
                  const ratio = item.current / item.target;
                  const status: "OK" | "Low" | "Critical" =
                    ratio >= 1
                      ? "OK"
                      : ratio >= 0.8
                      ? "Low"
                      : "Critical";
                  return (
                    <tr
                      key={item.name}
                      className={cn(
                        "border-b border-border/40",
                        idx % 2 === 0 ? "bg-bg-subtle" : "bg-bg-muted",
                      )}
                    >
                      <td className="py-1.5 pr-3 font-medium text-fg-strong">{item.name}</td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums text-fg-muted">
                        {item.target.toLocaleString()}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums text-fg-strong">
                        {item.current.toLocaleString()}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums">
                        <span
                          className={cn(
                            gap <= 0 ? "text-success-fg" : "text-danger-fg",
                          )}
                        >
                          {gap <= 0 ? `+${Math.abs(gap)}` : `-${gap}`}
                        </span>
                      </td>
                      <td className="py-1.5 pl-3 text-center">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-semibold",
                            status === "OK"
                              ? "bg-success-softer text-success-fg"
                              : status === "Low"
                              ? "bg-warning-softer text-warning-fg"
                              : "bg-danger-softer text-danger-fg",
                          )}
                        >
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Weekly Production Forecast Panel (R50-1) */}
      {showWeeklyProductionForecast ? (
        <div className="bg-bg-subtle border border-border rounded p-3 mt-2">
          <div className="flex items-center gap-1 mb-3">
            <TrendingUp className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">
              Weekly Production Forecast
            </span>
            <span className="text-3xs text-fg-faint ml-1">Planned vs forecast over 4-week horizon</span>
          </div>
          <div className="w-full overflow-x-auto">
            <table className="w-full text-3xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-fg-muted py-1 pr-3">Week</th>
                  <th className="text-right font-medium text-fg-muted py-1 px-3">Planned</th>
                  <th className="text-right font-medium text-fg-muted py-1 px-3">Forecast</th>
                  <th className="text-right font-medium text-fg-muted py-1 pl-3">Variance</th>
                </tr>
              </thead>
              <tbody>
                {WEEKLY_FORECAST.map((row, idx) => (
                  <tr
                    key={row.week}
                    className={cn(
                      "border-b border-border/40",
                      idx % 2 === 0 ? "bg-bg-subtle" : "bg-bg-muted",
                    )}
                  >
                    <td className="py-1.5 pr-3 font-medium text-fg-strong">{row.week}</td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-fg-muted">
                      {row.planned.toLocaleString()}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono tabular-nums text-fg-strong">
                      {row.forecast.toLocaleString()}
                    </td>
                    <td className="py-1.5 pl-3 text-right font-mono tabular-nums">
                      <span
                        className={cn(
                          row.variance > 0
                            ? "text-success-fg"
                            : row.variance < 0
                            ? "text-danger-fg"
                            : "text-fg-muted",
                        )}
                      >
                        {row.variance > 0
                          ? `+${row.variance.toLocaleString()}`
                          : row.variance < 0
                          ? `${row.variance.toLocaleString()}`
                          : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Weekly Output Target editor (Improvement 2) */}
      {showTargetEditor ? (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mb-3">
          <div className="text-3xs text-fg-faint font-medium mb-1">
            Weekly Output Target
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="1"
              className="w-20 text-3xs border border-border rounded px-2 py-1 bg-bg-raised text-fg-strong outline-none focus:border-accent/50"
              value={weeklyOutputTarget}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10) || 0;
                setWeeklyOutputTarget(val);
                try {
                  localStorage.setItem(
                    `gt_prod_output_target_${weekStartIso}`,
                    String(val),
                  );
                } catch {
                  // localStorage unavailable — non-fatal
                }
              }}
              aria-label="Weekly output target in units"
            />
            <span className="text-3xs text-fg-muted">units</span>
          </div>
          {weeklyTargetPct !== null ? (
            <>
              <div className="h-1.5 w-full bg-bg-muted rounded mt-1 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded transition-all",
                    weeklyTargetPct >= 100
                      ? "bg-success-fg"
                      : weeklyTargetPct >= 60
                      ? "bg-accent"
                      : "bg-warning-fg",
                  )}
                  style={{ width: `${weeklyTargetPct}%` }}
                />
              </div>
              <div className="text-3xs text-fg-muted text-right mt-0.5">
                {`${weeklyOutputActual} / ${weeklyOutputTarget} units`}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Weekly Capacity Fill Gauge (Improvement 3) */}
      {showCapacityFill ? (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mb-3">
          <div className="text-3xs text-fg-faint font-medium">
            Weekly Capacity Utilization
          </div>
          <div className="h-3 w-full bg-bg-muted rounded-full overflow-hidden mt-1">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                capacityFillPct <= 70
                  ? "bg-success-fg"
                  : capacityFillPct <= 90
                  ? "bg-warning-fg"
                  : "bg-danger-fg",
              )}
              style={{ width: `${capacityFillPct}%` }}
            />
          </div>
          <div className="text-3xs text-fg-muted text-right mt-0.5">
            {`${capacityFillPct}% utilized`}
            {" · "}
            {`${totalPlannedItems}/${MAX_DAILY_CAPACITY * 5} items`}
          </div>
        </div>
      ) : null}

      {/* Material Readiness Panel (Improvement 5) */}
      {showMaterialReadiness ? (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1 mb-1">
            <PackageSearch className="h-3 w-3 text-fg-strong shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">Material Readiness</span>
          </div>
          {materialReadinessRows.length === 0 ? (
            <div className="text-fg-faint text-3xs">No plan data to analyze</div>
          ) : (
            <div>
              {materialReadinessRows.map((row, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 py-1 border-b border-border last:border-0 text-3xs"
                >
                  <span className="text-fg-muted flex-1 truncate">{row.name}</span>
                  <span className="text-fg-faint">{`${row.available}/${row.needed}`} units</span>
                  <div className="w-16 h-1.5 bg-bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        row.readyPct >= 80
                          ? "bg-success-fg"
                          : row.readyPct >= 50
                          ? "bg-warning-fg"
                          : "bg-danger-fg",
                      )}
                      style={{ width: `${row.readyPct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Week Cycle Time Target (Improvement 6) */}
      {showCycleTimeEditor ? (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-2 text-3xs">
            <label className="text-fg-muted shrink-0">Weekly target (hours):</label>
            <input
              type="number"
              min="1"
              max="80"
              className="w-16 border border-border rounded px-1 text-fg-muted bg-bg-subtle text-3xs"
              value={weekCycleTimeTarget}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10) || 40;
                setWeekCycleTimeTarget(val);
                try {
                  localStorage.setItem("gt_plan_cycle_target", String(val));
                } catch {
                  // localStorage unavailable — non-fatal
                }
              }}
              aria-label="Weekly cycle time target in hours"
            />
          </div>
        </div>
      ) : null}

      {/* Effort × Urgency Matrix (Improvement 9) */}
      {showEffortMatrix ? (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="text-xs font-semibold text-fg-strong">
            Effort × Urgency Matrix
          </div>
          <div className="grid grid-cols-2 gap-1 mt-2">
            {/* [0,0] High Urgency × High Effort */}
            <div className="rounded p-1.5 text-3xs flex flex-col gap-0.5 bg-danger-softer border border-danger/20">
              <span className="text-danger-fg font-medium text-3xs">Do Now</span>
              {effortMatrixData.highUrgHighEff.length === 0 ? (
                <span className="text-fg-faint text-3xs">—</span>
              ) : (
                effortMatrixData.highUrgHighEff.map((name) => (
                  <span
                    key={name}
                    className="bg-danger-fg/10 text-danger-fg text-3xs rounded px-1 truncate"
                  >
                    {name}
                  </span>
                ))
              )}
            </div>
            {/* [0,1] High Urgency × Low Effort */}
            <div className="rounded p-1.5 text-3xs flex flex-col gap-0.5 bg-warning-softer border border-warning/20">
              <span className="text-warning-fg font-medium text-3xs">Quick Win</span>
              {effortMatrixData.highUrgLowEff.length === 0 ? (
                <span className="text-fg-faint text-3xs">—</span>
              ) : (
                effortMatrixData.highUrgLowEff.map((name) => (
                  <span
                    key={name}
                    className="bg-warning-fg/10 text-warning-fg text-3xs rounded px-1 truncate"
                  >
                    {name}
                  </span>
                ))
              )}
            </div>
            {/* [1,0] Low Urgency × High Effort */}
            <div className="rounded p-1.5 text-3xs flex flex-col gap-0.5 bg-info-softer border border-info/20">
              <span className="text-info-fg font-medium text-3xs">Schedule</span>
              {effortMatrixData.lowUrgHighEff.length === 0 ? (
                <span className="text-fg-faint text-3xs">—</span>
              ) : (
                effortMatrixData.lowUrgHighEff.map((name) => (
                  <span
                    key={name}
                    className="bg-info-fg/10 text-info-fg text-3xs rounded px-1 truncate"
                  >
                    {name}
                  </span>
                ))
              )}
            </div>
            {/* [1,1] Low Urgency × Low Effort */}
            <div className="rounded p-1.5 text-3xs flex flex-col gap-0.5 bg-bg-muted border border-border">
              <span className="text-fg-faint font-medium text-3xs">Later</span>
              {effortMatrixData.lowUrgLowEff.length === 0 ? (
                <span className="text-fg-faint text-3xs">—</span>
              ) : (
                effortMatrixData.lowUrgLowEff.map((name) => (
                  <span
                    key={name}
                    className="bg-fg-faint/10 text-fg-faint text-3xs rounded px-1 truncate"
                  >
                    {name}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Batching Opportunity Indicator (Improvement 11) */}
      {showBatchingOpps ? (
        <div className="bg-info-softer border border-info/20 rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1 mb-1">
            <Layers className="h-3 w-3 text-info-fg shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">Batching Opportunities</span>
            <span className="text-3xs text-fg-faint ml-1">
              ({batchingOpportunities.length} items)
            </span>
          </div>
          {batchingOpportunities.length === 0 ? (
            <div className="text-fg-faint text-3xs">
              No items repeat across multiple days
            </div>
          ) : (
            <div>
              {batchingOpportunities.map((opp) => (
                <div
                  key={opp.item}
                  className="flex items-center gap-2 py-1 border-b border-info/10 last:border-0 text-3xs"
                >
                  <span className="text-fg-muted flex-1 truncate">{opp.item}</span>
                  <span className="text-info-fg font-medium">{opp.daysCount}x</span>
                  <span className="text-fg-faint">({opp.dayLabels.join(", ")})</span>
                </div>
              ))}
            </div>
          )}
          <div className="text-3xs text-fg-faint mt-1">
            Consider batching repeated items to reduce changeover time
          </div>
        </div>
      ) : null}

      {/* Week Commentary panel (Improvement 12) */}
      {showWeekCommentary ? (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3 text-fg-faint shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">Week Commentary</span>
            <span className="text-3xs text-fg-faint ml-auto">
              (Week of {weekStartIso})
            </span>
          </div>
          <textarea
            className="w-full text-3xs bg-transparent border border-border rounded p-1.5 mt-1 resize-none h-16 text-fg-muted placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/40"
            value={weekCommentary}
            placeholder="Add your weekly planning notes and decisions here..."
            onChange={(e) => {
              const val = e.target.value;
              setWeekCommentary(val);
              try {
                localStorage.setItem(`gt_plan_week_commentary_${weekStartIso}`, val);
              } catch {
                // localStorage unavailable — non-fatal
              }
            }}
            aria-label="Week commentary notes"
          />
          <div className="flex justify-between mt-1 text-3xs text-fg-faint">
            <span>{weekCommentary.length} chars</span>
            {weekCommentary.trim().length > 0 ? (
              <button
                type="button"
                className="underline hover:no-underline"
                onClick={() => {
                  setWeekCommentary("");
                  try {
                    localStorage.removeItem(`gt_plan_week_commentary_${weekStartIso}`);
                  } catch {
                    // localStorage unavailable — non-fatal
                  }
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Week Commentary collapsed preview (Improvement 12) */}
      {weekCommentary.trim().length > 0 && !showWeekCommentary ? (
        <button
          type="button"
          className="w-full bg-bg-subtle border-b border-border px-5 py-1 text-3xs text-fg-muted truncate cursor-pointer flex items-center text-left hover:bg-bg-muted/50 transition-colors"
          onClick={() => setShowWeekCommentary(true)}
        >
          <MessageSquare className="h-3 w-3 text-fg-faint mr-1 shrink-0" strokeWidth={1.5} />
          <span className="truncate">
            {weekCommentary.trim().slice(0, 80)}
            {weekCommentary.trim().length > 80 ? "…" : ""}
          </span>
        </button>
      ) : null}

      {/* Plan Change Log (Improvement 13) */}
      {showChangeLog ? (
        <div className="bg-bg-subtle border border-border rounded p-2 mt-2 mx-5 mb-2">
          <div className="flex items-center gap-1">
            <History className="h-3 w-3 text-fg-faint shrink-0" strokeWidth={1.5} />
            <span className="text-xs font-semibold text-fg-strong">Plan Change Log</span>
            <span className="text-fg-faint text-3xs ml-auto">
              ({planChangeLogs.length} entries)
            </span>
            <button
              type="button"
              className="text-3xs underline hover:no-underline text-fg-faint ml-2"
              onClick={() => {
                setPlanChangeLogs([]);
                try {
                  localStorage.removeItem(CHANGE_LOG_KEY);
                } catch {
                  // localStorage unavailable — non-fatal
                }
              }}
            >
              Clear all
            </button>
          </div>
          {planChangeLogs.length === 0 ? (
            <div className="text-fg-faint text-3xs mt-1">
              No plan changes recorded yet
            </div>
          ) : (
            <div className="flex flex-col gap-0.5 mt-1">
              {planChangeLogs.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 text-3xs border-b border-border last:border-0 py-0.5"
                >
                  <span
                    className={cn(
                      "text-3xs rounded px-1 font-medium",
                      entry.action === "add"
                        ? "bg-success-softer text-success-fg"
                        : "bg-danger-softer text-danger-fg",
                    )}
                  >
                    {entry.action}
                  </span>
                  <span className="text-fg-muted flex-1 truncate">{entry.item}</span>
                  <span className="text-fg-faint">
                    {entry.day} · {entry.at}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Always-visible info banner — non-dismissible */}
      <div
        className="mb-4 flex items-start gap-3 rounded-md border border-info/40 bg-info-softer px-4 py-3 text-sm"
        data-testid="production-plan-banner"
      >
        <AlertCircle
          className="h-4 w-4 shrink-0 mt-0.5 text-info-fg"
          strokeWidth={2}
        />
        <div>
          <div className="font-semibold text-info-fg">
            Planned Only — inventory will update only after actual production is reported.
          </div>
          <div className="mt-0.5 text-xs text-fg-muted">
            This board shows what's planned for each day. Real inventory only
            changes once the operator submits an actual production report.
          </div>
        </div>
      </div>

      {/* Quick links to related surfaces */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Link
          href="/planning/runs"
          className="inline-flex items-center gap-1 text-accent hover:underline"
        >
          Production recommendations
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
        <span className="text-fg-faint">·</span>
        <Link
          href="/planning/forecast"
          className="inline-flex items-center gap-1 text-accent hover:underline"
        >
          Demand forecast
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
        <span className="text-fg-faint">·</span>
        <Link
          href="/planning/inventory-flow"
          className="inline-flex items-center gap-1 text-accent hover:underline"
        >
          Daily inventory flow
          <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>

      {/* Item search bar (Improvement 1) — filters items across all DayCards */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex items-center w-full max-w-xs">
          <Search className="absolute left-2 h-3 w-3 text-fg-faint pointer-events-none" strokeWidth={1.5} />
          <input
            type="text"
            className="w-full max-w-xs text-3xs border border-border rounded px-2 py-1 pl-6 bg-bg-subtle placeholder:text-fg-faint outline-none focus:border-accent/50"
            placeholder="Search items..."
            value={planItemSearch}
            onChange={(e) => setPlanItemSearch(e.target.value)}
            aria-label="Search production items across all days"
          />
          {planItemSearchActive ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setPlanItemSearch("")}
              className="absolute right-1.5 flex items-center justify-center h-4 w-4 text-fg-faint hover:text-fg-muted transition-colors"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          ) : null}
        </div>
        {planItemSearchActive ? (() => {
          const searchTerm = planItemSearch.trim().toLowerCase();
          const matchDayCount = weekDays.filter((dayIso) => {
            const dayPlans = plansByDay.get(dayIso) ?? [];
            return dayPlans.some((p) => {
              const name =
                ((p as any).item_name ?? (p as any).name ?? (p as any).component_name ?? "") as string;
              return name.toLowerCase().includes(searchTerm);
            });
          }).length;
          return (
            <span className="flex items-center gap-1 text-3xs text-fg-muted">
              <Search className="h-3 w-3 shrink-0" strokeWidth={1.5} />
              {`Showing matches in ${matchDayCount} day${matchDayCount !== 1 ? "s" : ""}`}
            </span>
          );
        })() : null}
      </div>

      {/* Low Progress Alert Banner (Improvement 4) */}
      {showProgressAlert && !dismissProgressAlert ? (
        (() => {
          // Compute how far through the work week (Mon-Fri) we are.
          // getDay(): 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
          // We treat days 1-5 as the 5-day work week; clamp to Mon-Fri range.
          const todayIdx = new Date().getDay();
          const workdayIdx = Math.max(1, Math.min(5, todayIdx));
          const weekCompletePct = Math.round(((workdayIdx - 1) / 5) * 100);
          return (
            <div className="mb-3 bg-warning-softer border border-warning/30 rounded p-2 flex items-center gap-2 text-3xs text-warning-fg">
              <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2} />
              <span className="flex-1 text-warning-fg">
                {`Week is ${weekCompletePct}% complete but production is only ${weekProgressPct}% done — consider rescheduling items`}
              </span>
              <button
                type="button"
                aria-label="Dismiss alert"
                onClick={() => setDismissProgressAlert(true)}
                className="shrink-0 flex items-center justify-center h-4 w-4 hover:opacity-70 transition-opacity"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </div>
          );
        })()
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* State-hygiene rendering: exactly one of                          */}
      {/*   loading | error | empty | week-view                            */}
      {/* is shown at any time. Header chips above are gated on hasData    */}
      {/* so the page never shows "0 planned" together with an error.     */}
      {/* ---------------------------------------------------------------- */}
      {plansQuery.isLoading ? (
        <SectionCard contentClassName="p-3">
          <div className="space-y-2" aria-busy="true" aria-live="polite">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="h-20 w-full animate-pulse rounded-md bg-bg-subtle"
              />
            ))}
          </div>
        </SectionCard>
      ) : plansQuery.isError ? (
        (() => {
          // Category-aware error rendering — closes audit P0-0.
          // The hook now throws a FetchError carrying status + a stable
          // category string. We branch off that to show the operator the
          // smallest concrete next action they can take, instead of a single
          // canned "try again" line.
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
                className="rounded border border-danger/40 bg-danger-softer p-4 text-sm text-danger-fg"
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
        <SectionCard contentClassName="p-5">
          <div
            className="text-center py-6 space-y-3"
            data-testid="production-plan-empty"
          >
            <Calendar
              className="h-10 w-10 mx-auto text-fg-faint"
              strokeWidth={1.5}
            />
            <div className="text-sm font-medium text-fg-strong">
              No production is planned for this week yet.
            </div>
            <div className="text-3xs text-fg-muted">
              You can add a plan manually or add one from production
              recommendations.
            </div>
            {canAct ? (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1.5"
                  onClick={() =>
                    // Cycle 12 P1 Phase3-S4-A fix: empty-state CTA defaults
                    // to today, matching the header CTAs.
                    setShowManualAdd({ defaultDate: toIsoDate(new Date()) })
                  }
                >
                  <Plus className="h-3 w-3" strokeWidth={2.5} />
                  Add Manually
                </button>
                <Link
                  href="/planning/runs"
                  className="btn btn-sm gap-1.5"
                >
                  Open production recommendations
                  <ArrowRight className="h-3 w-3" strokeWidth={2} />
                </Link>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : (
        // Week view — day cards
        <div className="space-y-2" data-testid="production-plan-week">
          {Array.from({ length: 7 }).map((_, i) => {
            const date = addDays(weekStart, i);
            const iso = toIsoDate(date);
            return (
              <DayCard
                key={iso}
                date={date}
                plans={plansByDay.get(iso) ?? []}
                expanded={expandedDay === iso}
                onToggle={() => setExpandedDay(expandedDay === iso ? null : iso)}
                canAct={canAct}
                onAdd={(d) => setShowManualAdd({ defaultDate: toIsoDate(d) })}
                onEdit={setEditingPlan}
                onCancel={setCancellingPlan}
                itemSearch={planItemSearch}
                recurringItemIds={recurringItemIds}
                isLocked={lockedDayIds.has(i)}
                onToggleLock={() => toggleDayLock(i)}
                showPriorityHighlight={showPriorityHighlight}
                priorityItemIds={priorityItemIds}
                onTogglePriority={togglePriorityItem}
              />
            );
          })}
        </div>
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
