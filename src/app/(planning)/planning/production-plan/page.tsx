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
import { useMemo, useState } from "react";
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
} from "./_lib/usePlans";
import type {
  ProductionPlanRow,
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
}: {
  plan: ProductionPlanRow;
  canAct: boolean;
  onEdit: (p: ProductionPlanRow) => void;
  onCancel: (p: ProductionPlanRow) => void;
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
              "text-sm font-medium",
              isCancelled ? "line-through text-fg-muted" : "text-fg-strong",
            )}
          >
            {plan.item_name ?? plan.item_id}
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

      {/* Done variance */}
      {isDone && plan.completed_actual ? (
        <div className="rounded border border-success/30 bg-success-softer/40 p-2 text-xs">
          <div className="font-medium text-success-fg">
            Completed in actual production
          </div>
          <div className="mt-0.5 text-fg-muted">
            Produced{" "}
            {fmtQty(
              plan.completed_actual.output_qty,
              plan.completed_actual.output_uom,
            )}
            {Number(plan.completed_actual.variance_qty) !== 0 ? (
              <span
                className={cn(
                  "ml-2 font-mono tabular-nums",
                  Number(plan.completed_actual.variance_qty) > 0
                    ? "text-success-fg"
                    : "text-warning-fg",
                )}
              >
                ({Number(plan.completed_actual.variance_qty) > 0 ? "+" : ""}
                {plan.completed_actual.variance_qty} vs planned)
              </span>
            ) : null}
          </div>
        </div>
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
}: {
  date: Date;
  plans: ProductionPlanRow[];
  expanded: boolean;
  onToggle: () => void;
  canAct: boolean;
  onAdd: (date: Date) => void;
  onEdit: (p: ProductionPlanRow) => void;
  onCancel: (p: ProductionPlanRow) => void;
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
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-fg-muted transition-transform",
            expanded && "rotate-90",
          )}
          strokeWidth={2}
        />
      </button>

      {expanded ? (
        <div className="border-t border-border/40 p-3 space-y-2">
          {plans.length === 0 ? (
            <div className="text-xs text-fg-muted text-center py-2">
              No production planned for this day yet.
            </div>
          ) : (
            plans.map((p) => (
              <PlanRowCard
                key={p.plan_id}
                plan={p}
                canAct={canAct}
                onEdit={onEdit}
                onCancel={onCancel}
              />
            ))
          )}
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
                required
              />
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

  // State-hygiene gate: derive counts only when we have real data.
  // If `plansQuery.data` is undefined (loading or error), the header chips
  // do NOT render — that prevents the "0 planned + red error" contradiction
  // Tom flagged.
  const hasData = plansQuery.data !== undefined && !plansQuery.isError;
  const allPlans = hasData ? plansQuery.data!.rows : [];
  const plannedCount = allPlans.filter((p) => p.rendered_state === "planned").length;
  const doneCount = allPlans.filter((p) => p.rendered_state === "done").length;
  const cancelledCount = allPlans.filter((p) => p.rendered_state === "cancelled").length;

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
            </>
          ) : null
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
                    setShowManualAdd({ defaultDate: toIsoDate(weekStart) })
                  }
                  data-testid="header-add-manual"
                >
                  <Plus className="h-3 w-3" strokeWidth={2.5} />
                  Add Manually
                </button>
                <button
                  type="button"
                  className="btn btn-sm gap-1.5"
                  disabled
                  title="Coming next — pick from approved production recommendations"
                  data-testid="header-add-from-recs"
                >
                  <Plus className="h-3 w-3" strokeWidth={2.5} />
                  Add from Recommendations
                  <span className="ml-1 text-3xs text-fg-faint">(coming next)</span>
                </button>
              </>
            ) : null}
          </div>
        }
      />

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
        <SectionCard contentClassName="p-5">
          <div
            className="rounded border border-danger/40 bg-danger-softer p-4 text-sm text-danger-fg"
            data-testid="production-plan-error"
          >
            <div className="font-semibold">
              We couldn't load the production plan.
            </div>
            <div className="mt-1 text-xs">
              Try refreshing the page. If the problem continues, contact the
              system administrator.
            </div>
            <button
              type="button"
              onClick={() => void plansQuery.refetch()}
              className="mt-3 text-xs font-medium underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        </SectionCard>
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
                    setShowManualAdd({ defaultDate: toIsoDate(weekStart) })
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
