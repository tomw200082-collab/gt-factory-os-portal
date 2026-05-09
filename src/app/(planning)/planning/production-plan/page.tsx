"use client";

// /planning/production-plan — Weekly Production Timeline Command Surface.
// PDP-UX-01 visual redesign. Three layers: Week Command Header, Week
// Timeline Rail, Production Week Board.
//
// Locked principle: plans NEVER write stock_ledger. Stock changes only
// when actual production is reported.
//
// Materials This Week Drawer ships in "unavailable" state until W4 authors
// the backend weekly-materials endpoint contract.

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  CheckCircle2,
  XCircle,
  Ban,
  Factory,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Calendar,
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
import {
  toIsoDate,
  startOfWeek,
  addDays,
  fmtDayHeader,
  fmtWeekRange,
  fmtQty,
} from "./_lib/helpers";
import { WeekTimelineRail } from "./_components/WeekTimelineRail";
import { ProductionDayLane } from "./_components/ProductionDayLane";
import { MaterialsThisWeekDrawer } from "./_components/MaterialsThisWeekDrawer";
import type {
  ProductionPlanRow,
  RecommendationCandidate,
} from "./_lib/types";

// Items hook — used by the manual-add form.
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

// Modal helper formatters
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

function completionBarColor(pct: number): string {
  if (pct >= 100) return "bg-success";
  if (pct >= 50) return "bg-accent";
  return "bg-warning";
}

function fmtFeasibilityLabel(status: string): string {
  switch (status) {
    case "ready_now": return "Ready to produce";
    case "blocked_missing_bom": return "Blocked — missing BOM";
    case "blocked_missing_components": return "Blocked — missing components";
    case "blocked_inactive_item": return "Blocked — inactive item";
    case "blocked_inactive_bom": return "Blocked — inactive BOM";
    default: return status;
  }
}

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
        (r) => r.supply_method === "MANUFACTURED" || r.supply_method === "REPACK",
      )
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
  }, [itemsQuery.data]);

  function handleItemChange(id: string) {
    setItemId(id);
    const item = producibleItems.find((r) => r.item_id === id);
    if (item?.sales_uom && !uom) setUom(item.sales_uom);
  }

  const canSubmit = planDate && itemId && parseFloat(qty) > 0 && uom && !isSubmitting;

  return (
    <div
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      data-testid="manual-add-modal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-fg-strong">
          Add production manually
        </h2>
        <p className="mt-1 text-3xs text-fg-muted">
          Planned only — inventory will not change until actual production is reported.
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
                aria-describedby={qty && !(parseFloat(qty) > 0) ? "manual-add-qty-hint" : undefined}
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
            <button type="button" className="btn btn-sm" onClick={onClose} disabled={isSubmitting}>
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
  const selectedRec = rows.find((r) => r.recommendation_id === selectedRecId) ?? null;
  const canSubmit = !!selectedRec && !isSubmitting;

  return (
    <div
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      data-testid="add-from-recs-modal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-fg-strong">
              Add from production recommendations
            </h2>
            <p className="mt-1 text-3xs text-fg-muted">
              Approved production recommendations from completed planning runs
              that are not yet on the plan.
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
            <button type="button" className="btn btn-sm" onClick={() => setFilterDate("")}>
              Clear filter
            </button>
          ) : null}
          <div className="ml-auto text-3xs text-fg-muted">
            Default suggested day: <span className="font-mono tabular-nums">{defaultDate}</span>
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded border border-border/60 bg-bg-subtle/30">
          {candidatesQuery.isLoading ? (
            <div className="space-y-2 p-3" aria-busy="true" aria-live="polite" data-testid="add-from-recs-loading">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 w-full animate-pulse rounded-md bg-bg-subtle" />
              ))}
            </div>
          ) : candidatesQuery.isError ? (
            <div className="m-3 rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg" data-testid="add-from-recs-error">
              <div className="font-semibold">We couldn&apos;t load production recommendations.</div>
              <div className="mt-1 text-3xs">Try again in a moment. If the problem continues, contact the system administrator.</div>
              <button
                type="button"
                onClick={() => void candidatesQuery.refetch()}
                className="mt-2 text-3xs font-medium underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center" data-testid="add-from-recs-empty">
              <Sparkles className="mx-auto h-8 w-8 text-fg-faint" strokeWidth={1.5} />
              <div className="mt-2 text-sm font-medium text-fg-strong">
                No production recommendations available to add.
              </div>
              <div className="mt-1 text-3xs text-fg-muted">
                They appear here when planning runs approve them. Open the planning run review screen to approve recommendations first.
              </div>
              <Link href="/planning/runs" className="btn btn-sm mt-3 gap-1.5">
                <PlayCircle className="h-3 w-3" strokeWidth={2} />
                Go to planning runs
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border/30" data-testid="add-from-recs-list">
              {total > rows.length && (
                <div className="px-3 py-1.5 text-3xs text-fg-faint bg-bg-muted/50">
                  Showing {rows.length} of {total} recommendations.
                  {filterDate ? " Filter by date to narrow results." : " Apply a date filter to narrow."}
                </div>
              )}
              {rows.map((rec) => {
                const isSelected = rec.recommendation_id === selectedRecId;
                const isBlocked = rec.feasibility_status !== "ready_now";
                return (
                  <button
                    key={rec.recommendation_id}
                    type="button"
                    className={cn(
                      "w-full text-left px-3 py-3 transition-colors",
                      isSelected
                        ? "bg-accent-softer border-l-2 border-l-accent"
                        : "hover:bg-bg-subtle/60",
                      isBlocked ? "opacity-60" : "",
                    )}
                    onClick={() => setSelectedRecId(isSelected ? null : rec.recommendation_id)}
                    disabled={isBlocked}
                    data-testid="rec-candidate-row"
                    data-rec-id={rec.recommendation_id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-fg-strong truncate">
                          {rec.item_display_name ?? rec.item_id}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-3xs text-fg-muted">
                          <span className="tabular-nums">{fmtRecQty(rec.suggested_qty, rec.uom)}</span>
                          <span className="text-fg-faint">·</span>
                          <span>For {rec.suggested_for_date}</span>
                          {rec.shortage_date && (
                            <>
                              <span className="text-fg-faint">·</span>
                              <span className="text-warning-fg">Shortage by {rec.shortage_date}</span>
                            </>
                          )}
                        </div>
                        {isBlocked && (
                          <div className="mt-1 text-3xs text-warning-fg">
                            {fmtFeasibilityLabel(rec.feasibility_status)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge
                          tone={isBlocked ? "warning" : "success"}
                          variant="soft"
                        >
                          {isBlocked ? "Blocked" : "Ready"}
                        </Badge>
                        <span className="text-3xs text-fg-faint">
                          Run {fmtRunExecutedAt(rec.run_executed_at)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {selectedRec && (
            <div className="text-3xs text-fg-muted min-w-0 flex-1 truncate">
              Selected: <span className="font-medium text-fg">{selectedRec.item_display_name ?? selectedRec.item_id}</span>{" "}
              · {fmtRecQty(selectedRec.suggested_qty, selectedRec.uom)} for {selectedRec.suggested_for_date}
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" className="btn btn-sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={!canSubmit}
              onClick={() => { if (selectedRec) onConfirm(selectedRec); }}
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-fg-strong">Edit plan</h2>
        <p className="mt-1 text-3xs text-fg-muted">{plan.item_name ?? plan.item_id}</p>

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
            <button type="button" className="btn btn-sm" onClick={onClose} disabled={isSubmitting}>
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-fg-strong">Cancel plan</h2>
        <p className="mt-1 text-3xs text-fg-muted">
          {plan.item_name ?? plan.item_id} · {fmtQty(plan.planned_qty, plan.uom)}
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
            <button type="button" className="btn btn-sm" onClick={onClose} disabled={isSubmitting}>
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
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} />
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

export default function ProductionPlanPage() {
  const { session } = useSession();
  const canAct = session.role === "planner" || session.role === "admin";

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 6);

  // Modal state
  const [showManualAdd, setShowManualAdd] = useState<{ defaultDate: string } | null>(null);
  const [showAddFromRecs, setShowAddFromRecs] = useState<{ defaultDate: string } | null>(null);
  const [editingPlan, setEditingPlan] = useState<ProductionPlanRow | null>(null);
  const [cancellingPlan, setCancellingPlan] = useState<ProductionPlanRow | null>(null);
  const [showMaterialsDrawer, setShowMaterialsDrawer] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const plansQuery = usePlans(toIsoDate(weekStart), toIsoDate(weekEnd));
  const createMut = useCreatePlan();
  const patchMut = usePatchPlan();

  function flashToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 4500);
  }

  // Group plans by day
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

  // Per-day totals for the timeline rail load bars
  const dayTotals = useMemo(() => {
    const out = new Map<string, { total: number; allDone: boolean; hasPlanned: boolean }>();
    for (let i = 0; i < 7; i++) {
      const iso = toIsoDate(addDays(weekStart, i));
      const plans = plansByDay.get(iso) ?? [];
      const total = plans
        .filter((p) => p.rendered_state !== "cancelled")
        .reduce((s, p) => s + (parseFloat(p.planned_qty) || 0), 0);
      const liveOrDone = plans.filter((p) => p.rendered_state !== "cancelled");
      const allDone =
        liveOrDone.length > 0 && liveOrDone.every((p) => p.rendered_state === "done");
      const hasPlanned = plans.some((p) => p.rendered_state === "planned");
      out.set(iso, { total, allDone, hasPlanned });
    }
    return out;
  }, [plansByDay, weekStart]);

  const weekMaxVolume = useMemo(() => {
    return Math.max(0, ...Array.from(dayTotals.values(), (d) => d.total));
  }, [dayTotals]);

  // Build the DayRailInfo array for the WeekTimelineRail
  const todayIso = toIsoDate(new Date());
  const railDays = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, i) => {
        const date = addDays(weekStart, i);
        const iso = toIsoDate(date);
        const { dayName, dateLabel } = fmtDayHeader(date);
        const info = dayTotals.get(iso) ?? { total: 0, allDone: false, hasPlanned: false };
        const isToday = iso === todayIso;
        const isPast = date < new Date() && !isToday;
        const isOverdue = isPast && info.hasPlanned;
        return { iso, dayName, dateLabel, isToday, isPast, isOverdue, ...info };
      }),
    [weekStart, dayTotals, todayIso],
  );

  // Handlers
  function handleManualAdd(req: {
    plan_date: string;
    item_id: string;
    planned_qty: number;
    uom: string;
    notes?: string;
  }) {
    createMut.mutate(req, {
      onSuccess: () => {
        flashToast("success", "Production added to the plan. Inventory has not changed.");
        setShowManualAdd(null);
      },
      onError: (err) => { flashToast("error", err.message); },
    });
  }

  function handleAddFromRec(rec: RecommendationCandidate) {
    const qty = parseFloat(rec.suggested_qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      flashToast("error", "This recommendation has an invalid quantity. Please contact the system administrator.");
      return;
    }
    if (!rec.uom) {
      flashToast("error", "This recommendation is missing a unit of measure. Open the planning run to investigate.");
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
        onError: (err) => { flashToast("error", err.message); },
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
        onError: (err) => { flashToast("error", err.message); },
      },
    );
  }

  function handleCancel(reason: string) {
    if (!cancellingPlan) return;
    patchMut.mutate(
      { plan_id: cancellingPlan.plan_id, body: { action: "cancel", cancel_reason: reason } },
      {
        onSuccess: () => {
          flashToast("success", "Plan cancelled. Inventory has not changed.");
          setCancellingPlan(null);
        },
        onError: (err) => { flashToast("error", err.message); },
      },
    );
  }

  return (
    <div dir="ltr">
      {/* ── Layer 1: Week Command Header ── */}
      <WorkflowHeader
        eyebrow="Planning workspace"
        title="Production plan"
        description="Plan production for the week. Inventory updates only when actuals are reported."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Materials this week — drawer trigger */}
            <button
              type="button"
              className="btn btn-sm gap-1.5 text-fg-muted hover:text-fg"
              onClick={() => setShowMaterialsDrawer(true)}
              data-testid="header-materials-drawer"
              aria-label="Materials this week"
            >
              <Boxes className="h-3 w-3" strokeWidth={2} />
              Materials this week
              <span className="ml-1 rounded text-[9px] font-semibold px-1 py-0.5 bg-warning-soft text-warning-fg border border-warning/30 leading-none">
                Pending data source
              </span>
            </button>

            {canAct && (
              <>
                <button
                  type="button"
                  className="btn btn-sm gap-1.5"
                  onClick={() => setShowAddFromRecs({ defaultDate: toIsoDate(new Date()) })}
                  title="Pick from approved production recommendations"
                  data-testid="header-add-from-recs"
                >
                  <Sparkles className="h-3 w-3" strokeWidth={2.5} />
                  Add from recommendations
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1.5"
                  onClick={() => setShowManualAdd({ defaultDate: toIsoDate(new Date()) })}
                  data-testid="header-add-manual"
                >
                  <Plus className="h-3 w-3" strokeWidth={2.5} />
                  Add production
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Secondary nav pills */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-fg-muted">
        <Link href="/planning/runs" className="hover:text-fg transition-colors flex items-center gap-1">
          <PlayCircle className="h-3 w-3" strokeWidth={2} />
          Planning runs
        </Link>
        <span className="text-fg-faint" aria-hidden>·</span>
        <Link href="/planning/inventory-flow" className="hover:text-fg transition-colors flex items-center gap-1">
          <Boxes className="h-3 w-3" strokeWidth={2} />
          Inventory flow
        </Link>
        <span className="text-fg-faint" aria-hidden>·</span>
        <Link href="/stock/production-actual" className="hover:text-fg transition-colors flex items-center gap-1">
          <Factory className="h-3 w-3" strokeWidth={2} />
          Report production
        </Link>
      </div>

      {/* Planned-only caveat banner */}
      <div
        className="mb-4 rounded-md border border-info/30 bg-info-softer/40 px-3 py-2 text-xs text-info-fg"
        role="note"
        data-testid="planned-only-banner"
      >
        <span className="font-medium">Planned only.</span>{" "}
        Inventory updates only after actuals are reported in the production report.
      </div>

      {/* KPI strip — renders only when data has loaded */}
      {hasData && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="kpi-microcard" style={{ ["--kpi-accent" as string]: "var(--warning)" }}>
            <span className="text-[22px] font-semibold tabular-nums leading-none tracking-tightish text-fg-strong">
              {plannedCount}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-sops leading-none text-fg-muted mt-0.5">
              Planned
            </span>
          </div>
          <div className="kpi-microcard" style={{ ["--kpi-accent" as string]: "var(--success)" }}>
            <span className="text-[22px] font-semibold tabular-nums leading-none tracking-tightish text-success-fg">
              {doneCount}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-sops leading-none text-fg-muted mt-0.5">
              Completed
            </span>
          </div>
          <div className="kpi-microcard" style={{ ["--kpi-accent" as string]: "var(--accent)" }}>
            <span className="text-[22px] font-semibold tabular-nums leading-none tracking-tightish text-fg-strong">
              {totalQty % 1 === 0 ? totalQty.toFixed(0) : totalQty.toFixed(1)}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-sops leading-none text-fg-muted mt-0.5">
              {dominantUom} total
            </span>
          </div>
          <div className="kpi-microcard" style={{ ["--kpi-accent" as string]: "var(--info)" }}>
            <span className="text-[22px] font-semibold tabular-nums leading-none tracking-tightish text-fg-strong">
              {completionPct}%
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-sops leading-none text-fg-muted mt-0.5">
              Done
            </span>
          </div>
        </div>
      )}

      {/* Week navigation */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm gap-1"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-3 w-3" strokeWidth={2} />
            Previous
          </button>
          <button
            type="button"
            className="btn btn-sm gap-1"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
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

      {/* ── Layer 2: Week Timeline Rail ── */}
      {hasData && (
        <WeekTimelineRail days={railDays} weekMax={weekMaxVolume} />
      )}

      {/* ── Layer 3: Production Week Board — state-hygiene rendering ── */}
      {plansQuery.isLoading ? (
        /* Loading skeleton */
        <div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7"
          aria-busy="true"
          aria-live="polite"
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-[180px] w-full animate-pulse rounded-lg bg-bg-subtle" />
          ))}
        </div>
      ) : plansQuery.isError ? (
        /* Error state */
        (() => {
          const err = plansQuery.error;
          const category = err instanceof FetchError ? err.category : "other";
          const status = err instanceof FetchError ? err.status : null;
          let title = "We couldn't load the production plan.";
          let body = "Check your connection and try again. If the problem continues, contact the system administrator.";
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
            body = "Ask an admin to grant you the planner or admin role, or go back to the dashboard.";
            secondary = { label: "Back to dashboard", href: "/dashboard" };
            primaryAction = null;
          } else if (category === "break_glass") {
            title = "The system is in read-only mode (break-glass).";
            body = "Reads are paused while admins resolve a critical condition. Try again in a few minutes.";
            secondary = { label: "Open integrations", href: "/admin/integrations#break-glass" };
          } else if (category === "server") {
            title = "The server hit an error while loading the plan.";
            body = "If a release was just deployed, wait 30 seconds and try again. Otherwise contact the system administrator.";
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
                    <Link href={secondary.href} className="text-xs font-medium underline hover:no-underline">
                      {secondary.label}
                    </Link>
                  ) : null}
                  {status && status >= 500 ? (
                    <span className="ml-auto text-3xs text-fg-faint">Reference: HTTP {status}</span>
                  ) : null}
                </div>
              </div>
            </SectionCard>
          );
        })()
      ) : allPlans.length === 0 ? (
        /* Empty state — no plans at all this week */
        <EmptyState
          title="No production planned for this week"
          description="Add a plan manually or pull one from approved production recommendations. Inventory will not change until actual production is reported."
          icon={<Calendar className="h-5 w-5 text-fg-faint" strokeWidth={1.5} />}
          action={
            canAct ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1.5"
                  onClick={() => setShowManualAdd({ defaultDate: toIsoDate(new Date()) })}
                  data-testid="empty-state-add-manual"
                >
                  <Plus className="h-3 w-3" strokeWidth={2.5} />
                  Add production
                </button>
                <button
                  type="button"
                  className="btn btn-sm gap-1.5"
                  onClick={() => setShowAddFromRecs({ defaultDate: toIsoDate(new Date()) })}
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
          {/* Board container — bg-bg-subtle covers the dot-grid behind lanes */}
          <div
            className="rounded-xl bg-bg-subtle p-3 overflow-x-auto"
            data-testid="production-plan-week"
          >
            <div
              className="flex gap-3"
              style={{ minWidth: "max-content" }}
            >
              {Array.from({ length: 7 }).map((_, i) => {
                const date = addDays(weekStart, i);
                const iso = toIsoDate(date);
                const { dayName, dateLabel } = fmtDayHeader(date);
                const isToday = iso === todayIso;
                const isPast = date < new Date() && !isToday;
                const plans = plansByDay.get(iso) ?? [];
                const hasPlanned = plans.some((p) => p.rendered_state === "planned");
                const isOverdue = isPast && hasPlanned;
                const info = dayTotals.get(iso) ?? { total: 0, allDone: false, hasPlanned: false };

                return (
                  <div key={iso} style={{ minWidth: 196, flex: 1 }}>
                    <ProductionDayLane
                      date={date}
                      isoDate={iso}
                      dayName={dayName}
                      dateLabel={dateLabel}
                      plans={plans}
                      canAct={canAct}
                      isToday={isToday}
                      isPast={isPast}
                      isOverdue={isOverdue}
                      dayTotal={info.total}
                      dominantUom={dominantUom}
                      onAdd={(d) => setShowManualAdd({ defaultDate: toIsoDate(d) })}
                      onEdit={setEditingPlan}
                      onCancel={setCancellingPlan}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Week summary footer */}
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border/50 bg-bg-raised px-4 py-3 shadow-raised">
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
                    completionBarColor(completionPct),
                  )}
                  style={{ width: `${Math.min(completionPct, 100)}%` }}
                  aria-hidden
                />
              </div>
            </div>
            <div className="hidden sm:block h-8 w-px bg-border/50" aria-hidden />
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <span>
                <span className="font-semibold text-fg-strong tabular-nums">{plannedCount}</span>{" "}
                planned
              </span>
              <span className="text-fg-faint">·</span>
              <span>
                <span className="font-semibold text-success-fg tabular-nums">{doneCount}</span>{" "}
                completed
              </span>
              {cancelledCount > 0 && (
                <>
                  <span className="text-fg-faint">·</span>
                  <span>
                    <span className="font-semibold text-danger-fg tabular-nums">{cancelledCount}</span>{" "}
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

      {/* ── Modals ── */}
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

      {/* ── Materials This Week Drawer ── */}
      <MaterialsThisWeekDrawer
        open={showMaterialsDrawer}
        onClose={() => setShowMaterialsDrawer(false)}
        weekStart={weekStart}
        weekEnd={weekEnd}
      />

      {toast ? (
        <Toast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />
      ) : null}
    </div>
  );
}

export type { RenderedState } from "./_lib/types";
