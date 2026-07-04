"use client";

// /planning/production-plan — Weekly Production Timeline Command Surface.
// PDP-UX-01 visual redesign. Three layers: Week Command Header, Week
// Timeline Rail, Production Week Board.
//
// Locked principle: plans NEVER write stock_ledger. Stock changes only
// when actual production is reported.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  CheckCircle2,
  XCircle,
  Ban,
  Factory,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Calendar,
  PlayCircle,
  Boxes,
  StickyNote,
  RefreshCw,
  Loader2,
  Trash2,
  Info,
} from "lucide-react";
import { useDialogA11y } from "./_lib/useDialogA11y";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { useConfirm } from "@/components/overlays/ConfirmDialog";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";
import {
  usePlans,
  useCreatePlan,
  usePatchPlan,
  useDeletePlan,
  useRecommendationCandidates,
  FetchError,
  PlanMutationError,
} from "./_lib/usePlans";
import {
  toIsoDate,
  startOfWeek,
  addDays,
  fmtDayHeader,
  fmtWeekRange,
  fmtQty,
} from "./_lib/helpers";
import {
  buildUomOptions,
  computeTodaySummary,
  fmtUpdatedTime,
  groupFieldErrors,
  type GroupedFieldErrors,
} from "./_lib/board-summary";
import {
  boardOverflows,
  centeredScrollLeft,
  isLaneOutOfView,
} from "./_lib/board-scroll";
import { WeekTimelineRail } from "./_components/WeekTimelineRail";
import { ProductionDayLane } from "./_components/ProductionDayLane";
import { RecipeOverridePanel } from "./_components/RecipeOverridePanel";
import { ItemStockContext } from "./_components/ItemStockContext";
import { usePrefetchInventoryFlow } from "../inventory-flow/_lib/useInventoryFlow";
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

// Form fields the server's 422 validation errors can be mapped onto inline
// (Tranche 048, INTER-004). Anything else lands in the general error block.
const MANUAL_ADD_FIELDS = [
  "plan_date",
  "item_id",
  "planned_qty",
  "uom",
  "notes",
] as const;

// Stable error-element id per ManualAdd field (Tranche 079 A11Y-R06).
// Used by both ManualAddFieldErrors (renders the element) and the matching
// input/select/textarea (references it via aria-describedby).
function manualAddFieldErrorId(field: string): string {
  return `manual-add-field-error-${field}`;
}

// Inline per-field server-error list (INTER-004).
function ManualAddFieldErrors({
  field,
  serverErrors,
}: {
  field: string;
  serverErrors: GroupedFieldErrors | null;
}) {
  const errors = serverErrors?.byField[field] ?? [];
  if (errors.length === 0) return null;
  return (
    <div
      id={manualAddFieldErrorId(field)}
      className="mt-1 space-y-0.5"
      data-testid={`manual-add-field-error-${field}`}
    >
      {errors.map((m, i) => (
        <p key={i} className="text-3xs text-danger-fg" role="alert">
          {m}
        </p>
      ))}
    </div>
  );
}

function ManualAddModal({
  defaultDate,
  onClose,
  onSubmit,
  isSubmitting,
  uomOptions,
  serverErrors,
}: {
  defaultDate: string;
  onClose: () => void;
  // Tranche 052 — reviewRecipe=true creates the plan and immediately opens
  // the RecipeOverridePanel for it (MANUFACTURED items only); false is the
  // quiet one-click path (today's behavior).
  onSubmit: (
    req: {
      plan_date: string;
      item_id: string;
      planned_qty: number;
      uom: string;
      notes?: string;
    },
    reviewRecipe: boolean,
  ) => void;
  isSubmitting: boolean;
  uomOptions: string[];
  serverErrors: GroupedFieldErrors | null;
}) {
  const itemsQuery = useProducibleItems();
  const [planDate, setPlanDate] = useState(defaultDate);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [uom, setUom] = useState("");
  const [notes, setNotes] = useState("");

  // Tranche 075 (A11Y-007 / A11Y-016) — proper dialog semantics on this
  // inline custom dialog (Radix-Dialog drop-in not used because the surface
  // is a fixed-inset overlay with bespoke layout, and the structural rewrite
  // would change submit behaviour for tranches 048 / 052). Instead:
  //   - aria-labelledby points at the heading (id added below).
  //   - Escape closes via a keydown listener bound to the dialog wrapper.
  //   - Initial focus is moved into the dialog (first heading, since the
  //     first field is a date input that the planner may not want to type
  //     into immediately).
  //   - Focus is returned to the element that opened the modal on close.
  const { dialogRef, titleRef, onKeyDown: onDialogKeyDown } = useDialogA11y({
    onClose,
    closeDisabled: isSubmitting,
  });

  // UX-flow audit (FLOW-E/B): on a submit (422) error, move focus to the first
  // field flagged aria-invalid so keyboard / screen-reader users land on the
  // problem instead of staying on the dialog title.
  useEffect(() => {
    if (!serverErrors || Object.keys(serverErrors.byField ?? {}).length === 0) {
      return;
    }
    queueMicrotask(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    });
  }, [serverErrors]);

  // INTER-004 — UoM is a select over the known UoM universe. If the
  // item-derived default (sales_uom) somehow isn't in the option list, keep
  // it selectable rather than silently dropping the value.
  const uomChoices = useMemo(
    () => (uom && !uomOptions.includes(uom) ? [uom, ...uomOptions] : uomOptions),
    [uom, uomOptions],
  );

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

  // Tranche 052 — only MANUFACTURED items have a liquid recipe to review;
  // REPACK keeps the plain single-button submit.
  const selectedItem = producibleItems.find((r) => r.item_id === itemId) ?? null;
  const canReviewRecipe = selectedItem?.supply_method === "MANUFACTURED";

  function doSubmit(reviewRecipe: boolean) {
    if (!canSubmit) return;
    onSubmit(
      {
        plan_date: planDate,
        item_id: itemId,
        planned_qty: parseFloat(qty),
        uom,
        notes: notes.trim() ? notes.trim() : undefined,
      },
      reviewRecipe,
    );
  }

  return (
    <div
      ref={dialogRef}
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-add-modal-title"
      data-testid="manual-add-modal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={onDialogKeyDown}
      tabIndex={-1}
    >
      <div className="flex max-h-[min(90vh,620px)] w-full max-w-lg flex-col rounded-t-lg border border-border bg-bg-raised p-5 shadow-pop sm:rounded-lg">
        <h2
          id="manual-add-modal-title"
          ref={titleRef}
          tabIndex={-1}
          className="shrink-0 text-base font-semibold text-fg-strong outline-none"
        >
          Add production manually
        </h2>
        <p className="mt-1 shrink-0 text-3xs text-fg-muted">
          Planned only — inventory will not change until actual production is reported.
        </p>

        <form
          className="mt-4 flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            // Tranche 052 — Enter / the primary button reviews the recipe
            // when the item has one; otherwise it's the plain add.
            doSubmit(canReviewRecipe);
          }}
        >
          {/* Tranche 116 (FLOW-116-02) — the stock-context strip pushed this
              modal's content past comfortable viewport height on short
              screens; the field stack now scrolls internally while the
              submit row stays pinned (same pattern as
              AddFromRecommendationsModal below). */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
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
              aria-required="true"
              aria-describedby={
                serverErrors?.byField["plan_date"]?.length
                  ? manualAddFieldErrorId("plan_date")
                  : undefined
              }
              aria-invalid={serverErrors?.byField["plan_date"]?.length ? true : undefined}
            />
            <ManualAddFieldErrors field="plan_date" serverErrors={serverErrors} />
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
              aria-required="true"
              aria-describedby={
                serverErrors?.byField["item_id"]?.length
                  ? manualAddFieldErrorId("item_id")
                  : undefined
              }
              aria-invalid={serverErrors?.byField["item_id"]?.length ? true : undefined}
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
            <ManualAddFieldErrors field="item_id" serverErrors={serverErrors} />
          </label>

          {/* Tranche 116 — stock-timing context: as soon as a product is
              picked, show when it's smart to produce it (on-hand, produce-by
              deadline, daily demand, cover after this run). Row 4 recomputes
              live as qty is typed below. */}
          <ItemStockContext
            mode="preview"
            itemId={itemId || null}
            planDate={planDate}
            previewQty={parseFloat(qty) > 0 ? parseFloat(qty) : null}
          />

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
                  [
                    qty && !(parseFloat(qty) > 0) ? "manual-add-qty-hint" : null,
                    serverErrors?.byField["planned_qty"]?.length
                      ? manualAddFieldErrorId("planned_qty")
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                aria-invalid={
                  (qty && !(parseFloat(qty) > 0)) ||
                  serverErrors?.byField["planned_qty"]?.length
                    ? true
                    : undefined
                }
                required
                aria-required="true"
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
              <ManualAddFieldErrors field="planned_qty" serverErrors={serverErrors} />
            </label>
            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Unit of measure *
              </span>
              <select
                className="input"
                value={uom}
                onChange={(e) => setUom(e.target.value)}
                required
                aria-required="true"
                aria-describedby={
                  serverErrors?.byField["uom"]?.length
                    ? manualAddFieldErrorId("uom")
                    : undefined
                }
                aria-invalid={serverErrors?.byField["uom"]?.length ? true : undefined}
                data-testid="manual-add-uom"
              >
                <option value="">— select a unit —</option>
                {uomChoices.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <ManualAddFieldErrors field="uom" serverErrors={serverErrors} />
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
              aria-describedby={
                serverErrors?.byField["notes"]?.length
                  ? manualAddFieldErrorId("notes")
                  : undefined
              }
            />
            <ManualAddFieldErrors field="notes" serverErrors={serverErrors} />
          </label>

          {/* INTER-004 — 422 errors that don't map to a single field. */}
          {serverErrors && serverErrors.general.length > 0 ? (
            <div
              className="rounded border border-danger/40 bg-danger-softer px-3 py-2 text-3xs text-danger-fg"
              role="alert"
              data-testid="manual-add-general-error"
            >
              {serverErrors.general.map((m, i) => (
                <p key={i}>{m}</p>
              ))}
            </div>
          ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-2">
            <button type="button" className="btn btn-sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            {/* Tranche 052 — for MANUFACTURED items the primary action steps
                into the recipe review; a quiet secondary keeps today's
                one-click add. REPACK items keep the single plain submit. */}
            {canReviewRecipe ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-fg-muted"
                  disabled={!canSubmit}
                  onClick={() => doSubmit(false)}
                  title="Add to the plan with the standard recipe"
                  data-testid="manual-add-submit-plain"
                >
                  Add without reviewing recipe
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm gap-1.5"
                  disabled={!canSubmit}
                  title="Add to the plan, then review this run's recipe"
                  data-testid="manual-add-submit"
                >
                  <FlaskConical className="h-3 w-3" strokeWidth={2.5} />
                  {isSubmitting ? "Saving…" : "Review recipe"}
                </button>
              </>
            ) : (
              <button
                type="submit"
                className="btn btn-primary btn-sm gap-1.5"
                disabled={!canSubmit}
                data-testid="manual-add-submit"
              >
                {/* UX-flow audit (FINDING-05/O): show a spinner, not just a
                    label change, so the in-flight state reads without relying
                    on text alone (matches the AddNote modal). */}
                {isSubmitting ? (
                  <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} aria-hidden />
                ) : (
                  <Plus className="h-3 w-3" strokeWidth={2.5} />
                )}
                {isSubmitting ? "Saving…" : "Add to plan"}
              </button>
            )}
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

  // Tranche 079 (A11Y-R02 / R10) — same dialog treatment as ManualAddModal:
  // initial focus on heading, focus return to trigger on close,
  // Escape-to-close, focus trap on Tab/Shift+Tab.
  const { dialogRef, titleRef, onKeyDown: onDialogKeyDown } = useDialogA11y({
    onClose,
    closeDisabled: isSubmitting,
  });

  return (
    <div
      ref={dialogRef}
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-from-recs-modal-title"
      data-testid="add-from-recs-modal"
      tabIndex={-1}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={onDialogKeyDown}
    >
      {/* FLOW-017 (Tranche 054) — cap the sheet height so the footer
          buttons stay reachable on short phones. */}
      <div className="w-full max-w-2xl rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-pop max-h-[min(90vh,600px)] flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2
              id="add-from-recs-modal-title"
              ref={titleRef}
              tabIndex={-1}
              className="text-base font-semibold text-fg-strong outline-none"
            >
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
            aria-label="Close"
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
                    // INTER-012 — disabled rows say why they can't be added.
                    // Rows already on the plan are filtered out server-side,
                    // so the only block reasons here are feasibility ones.
                    title={
                      isBlocked
                        ? `Can't add: ${fmtFeasibilityLabel(rec.feasibility_status)}`
                        : undefined
                    }
                    data-testid="rec-candidate-row"
                    data-rec-id={rec.recommendation_id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-fg-strong truncate">
                          {rec.item_display_name ?? "Unnamed product"}
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
              Selected: <span className="font-medium text-fg">{selectedRec.item_display_name ?? "Unnamed product"}</span>{" "}
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
              // INTER-012 — concrete reason while the button is disabled.
              title={
                isSubmitting
                  ? "Adding the selected recommendation…"
                  : !selectedRec
                    ? "Select a recommendation from the list first"
                    : undefined
              }
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
  uomOptions,
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
  uomOptions: string[];
}) {
  const [planDate, setPlanDate] = useState(plan.plan_date);
  const [qty, setQty] = useState(plan.planned_qty ?? "");
  const [uom, setUom] = useState(plan.uom ?? "");
  const [notes, setNotes] = useState(plan.notes ?? "");
  // INTER-003 — client-side qty validation. A blank/zero/non-numeric quantity
  // previously submitted NaN and relied on a generic backend 422 toast; now it
  // is caught inline under the field before the PATCH fires.
  const [qtyError, setQtyError] = useState<string | null>(null);

  // Tranche 079 (INTER-002) — UoM is a select over the known universe;
  // if the plan's current UoM is not in the option list keep it selectable
  // so we don't silently drop a value.
  const uomChoices = useMemo(
    () => (uom && !uomOptions.includes(uom) ? [uom, ...uomOptions] : uomOptions),
    [uom, uomOptions],
  );

  // UX-flow audit (FINDING-07): the diff is computed on submit and an empty
  // diff closes the modal silently. Disabling "Save changes" until something
  // actually changed makes the no-op impossible and removes the "did it save?"
  // ambiguity.
  const isDirty =
    planDate !== plan.plan_date ||
    qty !== (plan.planned_qty ?? "") ||
    uom !== (plan.uom ?? "") ||
    notes !== (plan.notes ?? "");

  // DR-018 INTER-007 (Tranche 123) — Escape / backdrop-click / Cancel all
  // used to close silently even with unsaved edits. Guard once, reuse
  // everywhere a close can be triggered.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  function requestClose() {
    if (isDirty && !isSubmitting) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  // Tranche 079 (A11Y-R02 / R10) — dialog treatment (matches ManualAddModal).
  const { dialogRef, titleRef, onKeyDown: onDialogKeyDown } = useDialogA11y({
    onClose: requestClose,
    closeDisabled: isSubmitting,
  });

  return (
    <div
      ref={dialogRef}
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
      data-testid="edit-modal"
      tabIndex={-1}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
      onKeyDown={onDialogKeyDown}
    >
      <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-pop">
        <h2
          id="edit-modal-title"
          ref={titleRef}
          tabIndex={-1}
          className="text-base font-semibold text-fg-strong outline-none"
        >
          Edit plan
        </h2>
        <p className="mt-1 text-3xs text-fg-muted">{plan.item_name ?? "Unnamed item"}</p>

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
            const qtyChanged = qty !== plan.planned_qty;
            if (qtyChanged) {
              const n = parseFloat(qty);
              if (!Number.isFinite(n) || n <= 0) {
                setQtyError("Enter a planned quantity greater than zero.");
                return;
              }
              body.planned_qty = n;
            }
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
                onChange={(e) => {
                  setQty(e.target.value);
                  if (qtyError) setQtyError(null);
                }}
                aria-invalid={qtyError ? true : undefined}
                aria-describedby={qtyError ? "edit-qty-error" : undefined}
              />
              {qtyError ? (
                <span
                  id="edit-qty-error"
                  role="alert"
                  className="mt-1 block text-3xs text-danger-fg"
                  data-testid="edit-qty-error"
                >
                  {qtyError}
                </span>
              ) : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Unit of measure
              </span>
              {/* INTER-002 (Tranche 079) — UoM is a select over the known
                  set the page already computes (uomOptions). The plan's
                  current uom is appended if it's not in the option list so
                  edits don't silently drop arbitrary historical values. */}
              <select
                className="input"
                value={uom}
                onChange={(e) => setUom(e.target.value)}
                data-testid="edit-uom"
              >
                {uomChoices.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
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

          {confirmingDiscard ? (
            <div
              className="flex flex-wrap items-center justify-end gap-2 pt-2"
              data-testid="edit-discard-confirm"
            >
              <span className="mr-auto text-xs text-fg-muted">Discard unsaved changes?</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setConfirmingDiscard(false)}
                data-testid="edit-discard-keep"
              >
                Keep editing
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={onClose}
                data-testid="edit-discard-confirm-yes"
              >
                Discard
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button type="button" className="btn btn-sm" onClick={requestClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm gap-1.5"
                disabled={isSubmitting || !isDirty}
                data-testid="edit-submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function AddNoteModal({
  defaultDate,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  defaultDate: string;
  onClose: () => void;
  onSubmit: (req: { plan_date: string; notes: string }) => void;
  isSubmitting: boolean;
}) {
  const [planDate, setPlanDate] = useState(defaultDate);
  const [notes, setNotes] = useState("");

  const canSubmit = planDate && notes.trim().length > 0 && !isSubmitting;

  // Tranche 079 (A11Y-R02 / R10) — dialog treatment.
  const { dialogRef, titleRef, onKeyDown: onDialogKeyDown } = useDialogA11y({
    onClose,
    closeDisabled: isSubmitting,
  });

  return (
    <div
      ref={dialogRef}
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-note-modal-title"
      data-testid="add-note-modal"
      tabIndex={-1}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={onDialogKeyDown}
    >
      <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-pop">
        <h2
          id="add-note-modal-title"
          ref={titleRef}
          tabIndex={-1}
          className="text-base font-semibold text-fg-strong outline-none"
        >
          Add a note
        </h2>
        <p className="mt-1 text-3xs text-fg-muted">
          Notes appear on the plan board but don&apos;t affect inventory.
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            onSubmit({ plan_date: planDate, notes: notes.trim() });
          }}
        >
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Day *
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
              Note *
            </span>
            <textarea
              rows={3}
              className="input min-h-[4rem]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Organize the warehouse, technician visit at 2pm…"
              required
              autoFocus
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
              data-testid="add-note-submit"
            >
              {/* INTER-001 (Tranche 079) — spinner alongside "Saving…" while
                  pending, matching ManualAdd / AddFromRecs. */}
              {isSubmitting ? (
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} aria-hidden />
              ) : (
                <StickyNote className="h-3 w-3" strokeWidth={2} />
              )}
              {isSubmitting ? "Saving…" : "Add note"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditNoteModal({
  plan,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  plan: ProductionPlanRow;
  onClose: () => void;
  onSubmit: (body: { plan_date?: string; notes?: string }) => void;
  isSubmitting: boolean;
}) {
  const [planDate, setPlanDate] = useState(plan.plan_date);
  const [notes, setNotes] = useState(plan.notes ?? "");

  const canSubmit = notes.trim().length > 0 && !isSubmitting;
  const isDirty = planDate !== plan.plan_date || notes !== (plan.notes ?? "");

  // DR-018 INTER-007 (Tranche 123) — same dirty-close guard as EditModal.
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  function requestClose() {
    if (isDirty && !isSubmitting) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  // Tranche 079 (A11Y-R02 / R10) — dialog treatment.
  const { dialogRef, titleRef, onKeyDown: onDialogKeyDown } = useDialogA11y({
    onClose: requestClose,
    closeDisabled: isSubmitting,
  });

  return (
    <div
      ref={dialogRef}
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-note-modal-title"
      data-testid="edit-note-modal"
      tabIndex={-1}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
      onKeyDown={onDialogKeyDown}
    >
      <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-pop">
        <h2
          id="edit-note-modal-title"
          ref={titleRef}
          tabIndex={-1}
          className="text-base font-semibold text-fg-strong outline-none"
        >
          Edit note
        </h2>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const body: { plan_date?: string; notes?: string } = {};
            if (planDate !== plan.plan_date) body.plan_date = planDate;
            if (notes !== (plan.notes ?? "")) body.notes = notes;
            onSubmit(body);
          }}
        >
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Day
            </span>
            <input
              type="date"
              className="input"
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Note
            </span>
            <textarea
              rows={3}
              className="input min-h-[4rem]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              autoFocus
            />
          </label>

          {confirmingDiscard ? (
            <div
              className="flex flex-wrap items-center justify-end gap-2 pt-2"
              data-testid="edit-note-discard-confirm"
            >
              <span className="mr-auto text-xs text-fg-muted">Discard unsaved changes?</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setConfirmingDiscard(false)}
                data-testid="edit-note-discard-keep"
              >
                Keep editing
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={onClose}
                data-testid="edit-note-discard-confirm-yes"
              >
                Discard
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button type="button" className="btn btn-sm" onClick={requestClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm gap-1.5"
                disabled={!canSubmit}
                data-testid="edit-note-submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    Saving…
                  </>
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
          )}
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

  // Tranche 079 (A11Y-R02 / R10) — dialog treatment.
  const { dialogRef, titleRef, onKeyDown: onDialogKeyDown } = useDialogA11y({
    onClose,
    closeDisabled: isSubmitting,
  });

  return (
    <div
      ref={dialogRef}
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
      data-testid="cancel-modal"
      tabIndex={-1}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={onDialogKeyDown}
    >
      <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-pop">
        <h2
          id="cancel-modal-title"
          ref={titleRef}
          tabIndex={-1}
          className="text-base font-semibold text-fg-strong outline-none"
        >
          Cancel plan
        </h2>
        <p className="mt-1 text-3xs text-fg-muted">
          {plan.plan_type === "note"
            ? "Note"
            : `${plan.item_name ?? "this item"} · ${fmtQty(plan.planned_qty ?? "0", plan.uom ?? "")}`}
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
            // Reason is OPTIONAL (Tom-directed 2026-06-15): cancelling a plan row
            // does not change inventory, so no explanation is forced. A blank
            // reason is submitted and stored as null.
            onSubmit(reason.trim());
          }}
        >
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Reason for cancellation (optional)
            </span>
            <textarea
              rows={3}
              className="input min-h-[4rem]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. schedule change, raw material shortage, demand updated"
            />
          </label>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button type="button" className="btn btn-sm" onClick={onClose} disabled={isSubmitting}>
              Back
            </button>
            <button
              type="submit"
              // INTER-005 (Tranche 048) — destructive confirm is the filled
              // danger pattern, matching the repo-wide btn-danger usage.
              className="btn btn-sm btn-danger gap-1.5"
              disabled={isSubmitting}
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

function DeleteModal({
  plan,
  onClose,
  onConfirm,
  isSubmitting,
}: {
  plan: ProductionPlanRow;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}) {
  // A11Y — same dialog treatment as CancelModal (focus trap + restore).
  const { dialogRef, titleRef, onKeyDown: onDialogKeyDown } = useDialogA11y({
    onClose,
    closeDisabled: isSubmitting,
  });

  const isCancelled = plan.rendered_state === "cancelled";

  return (
    <div
      ref={dialogRef}
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      data-testid="delete-modal"
      tabIndex={-1}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={onDialogKeyDown}
    >
      <div className="w-full max-w-lg rounded-t-lg sm:rounded-lg border border-border bg-bg-raised p-5 shadow-pop">
        <h2
          id="delete-modal-title"
          ref={titleRef}
          tabIndex={-1}
          className="text-base font-semibold text-fg-strong outline-none"
        >
          Delete this record?
        </h2>
        <p className="mt-1 text-3xs text-fg-muted">
          {plan.plan_type === "note"
            ? "Note"
            : `${plan.item_name ?? "this item"} · ${fmtQty(plan.planned_qty ?? "0", plan.uom ?? "")}`}
          {isCancelled ? " · cancelled" : ""}
        </p>

        <div className="mt-3 rounded border border-danger/30 bg-danger-softer/30 p-3 text-xs text-danger-fg">
          This permanently removes the record from the production plan. It
          won&apos;t change any inventory, and it can&apos;t be undone.
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="btn btn-sm" onClick={onClose} disabled={isSubmitting}>
            Keep record
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger gap-1.5"
            disabled={isSubmitting}
            onClick={onConfirm}
            data-testid="delete-submit"
          >
            <Trash2 className="h-3 w-3" strokeWidth={2.5} />
            {isSubmitting ? "Deleting…" : "Delete"}
          </button>
        </div>
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
      // A11Y-R11 (Tranche 079) — errors interrupt (alert / assertive); success
      // confirmations are polite status announcements.
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
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
          className="text-3xs underline hover:no-underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
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
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 6);

  // UX-flow audit (deep-linking + state-preservation): the visible week lives
  // in the URL as ?week=YYYY-MM-DD, so it is shareable and survives navigating
  // away and back. SSR renders the default (current) week — matching the first
  // client paint, no hydration mismatch — then this mount effect honors a
  // ?week= param if present. We read window.location directly (rather than
  // useSearchParams) to keep the page SSR-/build-safe with no Suspense wrapper.
  useEffect(() => {
    const wk = new URLSearchParams(window.location.search).get("week");
    if (wk && /^\d{4}-\d{2}-\d{2}$/.test(wk)) {
      const d = new Date(`${wk}T00:00:00`);
      if (!Number.isNaN(d.getTime())) setWeekStart(startOfWeek(d));
    }
  }, []);

  // Change the visible week AND reflect it in the URL. replaceState (not push)
  // keeps week-stepping out of the back stack while still leaving a shareable,
  // back-restorable URL on the page.
  const goToWeek = useCallback((d: Date) => {
    const ws = startOfWeek(d);
    setWeekStart(ws);
    const params = new URLSearchParams(window.location.search);
    params.set("week", toIsoDate(ws));
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
  }, []);

  // Modal state
  const [showManualAdd, setShowManualAdd] = useState<{ defaultDate: string } | null>(null);
  const [showAddFromRecs, setShowAddFromRecs] = useState<{ defaultDate: string } | null>(null);
  const [showAddNote, setShowAddNote] = useState<{ defaultDate: string } | null>(null);
  const [editingPlan, setEditingPlan] = useState<ProductionPlanRow | null>(null);
  const [cancellingPlan, setCancellingPlan] = useState<ProductionPlanRow | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<ProductionPlanRow | null>(null);
  // Tranche 052 — plan whose improvised liquid recipe is being edited.
  // Opened from the ManualAdd "Review recipe" step or a card's
  // "Adjust recipe" action.
  const [recipePanelPlanId, setRecipePanelPlanId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  // INTER-004 (Tranche 048) — server 422 field errors for the ManualAddModal,
  // rendered inline under the matching fields instead of toast-only.
  const [manualAddErrors, setManualAddErrors] = useState<GroupedFieldErrors | null>(null);
  // INTER-003 (Tranche 079) — when a per-card patch (Move-to-tomorrow today,
  // future per-card actions) is in flight, disable only that card's buttons
  // by id, not every card on the board via patchMut.isPending.
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);

  const plansQuery = usePlans(toIsoDate(weekStart), toIsoDate(weekEnd));
  const createMut = useCreatePlan();
  const patchMut = usePatchPlan();
  const deleteMut = useDeletePlan();
  // Tranche 116 — warm the inventory-flow cache on mount so ItemStockContext
  // (ManualAddModal + job-card impact panel) doesn't pay the cold ~22s SQL
  // wait the first time a planner opens either surface.
  usePrefetchInventoryFlow({});

  function flashToast(kind: "success" | "error", message: string) {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 4500);
  }

  // §1-safe short label for a plan in toasts / confirms — the item name or the
  // base-batch descriptor, never the raw item_id. Returns null when there is no
  // human label to show (the caller then keeps the generic message).
  function planLabel(p: ProductionPlanRow): string | null {
    if (p.item_name) return p.item_name;
    if (p.is_base_batch) {
      const n = p.pack_manifest_count;
      return `base batch (${n} SKU${n === 1 ? "" : "s"})`;
    }
    return null;
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
  const allPlans = plansQuery.data?.rows ?? [];
  const productionPlans = allPlans.filter((p) => p.plan_type === "production");
  const plannedCount = productionPlans.filter((p) => p.rendered_state === "planned").length;
  const doneCount = productionPlans.filter((p) => p.rendered_state === "done").length;
  const cancelledCount = productionPlans.filter((p) => p.rendered_state === "cancelled").length;
  // DR-018 FLOW-007 (Tranche 123) — drafts can otherwise sit indefinitely
  // with no portal affordance pointing at the "done editing" handshake.
  const draftCount = productionPlans.filter((p) => p.status === "draft").length;

  const totalQty = productionPlans
    .filter((p) => p.rendered_state !== "cancelled")
    .reduce((s, p) => s + (parseFloat(p.planned_qty ?? "0") || 0), 0);

  const dominantUom = (() => {
    const uoms = productionPlans
      .filter((p) => p.rendered_state !== "cancelled")
      .map((p) => p.uom);
    const first = uoms[0];
    return first && uoms.every((u) => u === first) ? first : "units";
  })();

  // FLOW-014/015 (Tranche 113) — the planned-qty total may only be summed when
  // every active plan shares a unit; summing liters + bottles + kg into one
  // number is meaningless. When the week mixes units the KPI shows the honest
  // run count instead. (dominantUom above stays the day-lane fallback.)
  const activePlanCount = productionPlans.filter(
    (p) => p.rendered_state !== "cancelled",
  ).length;
  const uniformUom = (() => {
    const uoms = productionPlans
      .filter((p) => p.rendered_state !== "cancelled")
      .map((p) => p.uom);
    return uoms.length > 0 && uoms.every((u) => u === uoms[0]) ? uoms[0] : null;
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
        .reduce((s, p) => s + (parseFloat(p.planned_qty ?? "0") || 0), 0);
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
  const tomorrowIso = toIsoDate(addDays(new Date(), 1));

  // D13 Tier 1 (Tranche 048) — Today strip numbers + tomorrow preview.
  // The plans query only covers the visible week, so the strip renders only
  // when today falls inside it (ISO strings compare lexicographically).
  const todaySummary = useMemo(
    () => computeTodaySummary(plansQuery.data?.rows ?? [], todayIso, tomorrowIso),
    [plansQuery.data, todayIso, tomorrowIso],
  );
  const todayInWeek =
    todayIso >= toIsoDate(weekStart) && todayIso <= toIsoDate(weekEnd);

  // INTER-004 (Tranche 048) — UoM options for the manual-add select: UoMs
  // present on the visible production rows first, then the contract set.
  const uomOptions = useMemo(
    () =>
      buildUomOptions(
        (plansQuery.data?.rows ?? [])
          .filter((p) => p.plan_type === "production")
          .map((p) => p.uom),
      ),
    [plansQuery.data],
  );
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

  // FLOW-001 (Tranche 054) — auto-center the TODAY lane in the horizontal
  // board once per week-view load. Pure geometry lives in _lib/board-scroll.
  const boardRef = useRef<HTMLDivElement | null>(null);
  const todayLaneRef = useRef<HTMLDivElement | null>(null);
  // Week key the auto-center already ran for; navigating to another week and
  // back re-arms it.
  const autoCenteredWeekRef = useRef<string | null>(null);
  // Drives the md+ visibility of the "Today" jump button (below md it is
  // always shown while today is on the board).
  const [todayOutOfView, setTodayOutOfView] = useState(false);

  const updateTodayVisibility = useCallback(() => {
    const board = boardRef.current;
    const lane = todayLaneRef.current;
    if (!board || !lane) {
      setTodayOutOfView(false);
      return;
    }
    const boardRect = board.getBoundingClientRect();
    const laneRect = lane.getBoundingClientRect();
    const laneLeft = laneRect.left - boardRect.left + board.scrollLeft;
    setTodayOutOfView(
      boardOverflows(board.clientWidth, board.scrollWidth) &&
        isLaneOutOfView(board.scrollLeft, {
          containerWidth: board.clientWidth,
          laneLeft,
          laneWidth: laneRect.width,
        }),
    );
  }, []);

  const centerTodayLane = useCallback(
    (smooth: boolean) => {
      const board = boardRef.current;
      const lane = todayLaneRef.current;
      if (!board || !lane) return;
      // Never jolt layouts that already show the whole week (desktop).
      if (!boardOverflows(board.clientWidth, board.scrollWidth)) return;
      const boardRect = board.getBoundingClientRect();
      const laneRect = lane.getBoundingClientRect();
      const left = centeredScrollLeft({
        containerWidth: board.clientWidth,
        scrollWidth: board.scrollWidth,
        laneLeft: laneRect.left - boardRect.left + board.scrollLeft,
        laneWidth: laneRect.width,
      });
      if (typeof board.scrollTo === "function") {
        board.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
      } else {
        board.scrollLeft = left;
      }
      updateTodayVisibility();
    },
    [updateTodayVisibility],
  );

  // Run once per week-view load, after plans data lands, and only when today
  // is inside the visible week. Refetches (60s interval) never re-trigger it.
  useEffect(() => {
    const weekKey = toIsoDate(weekStart);
    if (autoCenteredWeekRef.current === weekKey) return;
    if (!hasData) return;
    autoCenteredWeekRef.current = weekKey;
    if (todayInWeek) centerTodayLane(false);
    updateTodayVisibility();
  }, [hasData, todayInWeek, weekStart, centerTodayLane, updateTodayVisibility]);

  useEffect(() => {
    window.addEventListener("resize", updateTodayVisibility);
    return () => window.removeEventListener("resize", updateTodayVisibility);
  }, [updateTodayVisibility]);

  // Handlers
  function handleManualAdd(
    req: {
      plan_date: string;
      item_id: string;
      planned_qty: number;
      uom: string;
      notes?: string;
    },
    reviewRecipe: boolean,
  ) {
    setManualAddErrors(null);
    createMut.mutate({ plan_type: "production", ...req }, {
      onSuccess: (resp) => {
        flashToast("success", "Production added to the plan. Inventory has not changed.");
        setShowManualAdd(null);
        // Tranche 052 — "Review recipe" path: the plan is created first,
        // then the recipe panel opens immediately for that plan.
        if (reviewRecipe && resp.plan_id) {
          setRecipePanelPlanId(resp.plan_id);
        }
      },
      onError: (err) => {
        // INTER-004 — map server 422 validation errors onto the form fields
        // inline; everything else keeps the existing toast behavior.
        if (
          err instanceof PlanMutationError &&
          err.status === 422 &&
          err.validationErrors.length > 0
        ) {
          setManualAddErrors(
            groupFieldErrors(err.validationErrors, MANUAL_ADD_FIELDS),
          );
          return;
        }
        flashToast("error", err.message);
      },
    });
  }

  // D13 Tier 1 (Tranche 048) — quick "Move to tomorrow" for an unreported
  // today-plan. Reuses the existing date-edit PATCH; usePatchPlan already
  // invalidates the production-plan queries on success.
  async function handleMoveToTomorrow(p: ProductionPlanRow) {
    const name = planLabel(p);
    const label = `${name ?? "this plan"} · ${fmtQty(p.planned_qty ?? "0", p.uom ?? "")}`;
    const ok = await confirm({
      title: "Move plan to tomorrow?",
      description: `Moves "${label}" to tomorrow (${tomorrowIso}). Inventory is not affected.`,
      confirmLabel: "Move to tomorrow",
    });
    if (!ok) return;
    setPendingPlanId(p.plan_id);
    patchMut.mutate(
      { plan_id: p.plan_id, body: { plan_date: tomorrowIso } },
      {
        onSuccess: () => {
          flashToast("success", name ? `${name} moved to tomorrow.` : "Plan moved to tomorrow.");
        },
        onError: (err) => { flashToast("error", err.message); },
        onSettled: () => {
          // INTER-003 — clear the per-card lock whether the patch settled
          // green or red. patchMut.isPending unwinds in the same tick.
          setPendingPlanId(null);
        },
      },
    );
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
        plan_type: "production",
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

  function handleAddNote(req: { plan_date: string; notes: string }) {
    createMut.mutate(
      { plan_type: "note", plan_date: req.plan_date, notes: req.notes },
      {
        onSuccess: () => {
          flashToast("success", "Note added to the plan.");
          setShowAddNote(null);
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
    const name = planLabel(editingPlan);
    patchMut.mutate(
      { plan_id: editingPlan.plan_id, body },
      {
        onSuccess: () => {
          flashToast("success", name ? `Plan updated for ${name}.` : "Plan updated.");
          setEditingPlan(null);
        },
        onError: (err) => { flashToast("error", err.message); },
      },
    );
  }

  function handleCancel(reason: string) {
    if (!cancellingPlan) return;
    const name = planLabel(cancellingPlan);
    patchMut.mutate(
      { plan_id: cancellingPlan.plan_id, body: { action: "cancel", cancel_reason: reason.trim() || null } },
      {
        onSuccess: () => {
          flashToast(
            "success",
            name
              ? `Plan cancelled for ${name}. Inventory has not changed.`
              : "Plan cancelled. Inventory has not changed.",
          );
          setCancellingPlan(null);
        },
        onError: (err) => { flashToast("error", err.message); },
      },
    );
  }

  function handleDelete() {
    if (!deletingPlan) return;
    const name = planLabel(deletingPlan);
    deleteMut.mutate(
      { plan_id: deletingPlan.plan_id },
      {
        onSuccess: () => {
          flashToast("success", name ? `Record deleted for ${name}.` : "Record deleted.");
          setDeletingPlan(null);
        },
        onError: (err) => { flashToast("error", err.message); },
      },
    );
  }

  return (
    <div dir="ltr">
      {confirmDialog}
      {/* ── Layer 1: Week Command Header ── */}
      <WorkflowHeader
        eyebrow="Planning workspace"
        title="Production plan"
        description="Plan production for the week."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
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
                  Add from Recommendations
                </button>
                <button
                  type="button"
                  className="btn btn-sm gap-1.5"
                  onClick={() => setShowAddNote({ defaultDate: toIsoDate(new Date()) })}
                  title="Add a note to the plan"
                  data-testid="header-add-note"
                >
                  <StickyNote className="h-3 w-3" strokeWidth={2} />
                  Add note
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

      {/* DR-018 FLOW-007 (Tranche 123) — drafts had no portal affordance
          pointing at the "done editing" handshake and could sit
          indefinitely. Non-dismissible (no close button) — it should
          disappear because the drafts got resolved, not because it was
          dismissed. */}
      {draftCount > 0 && (
        <div
          className="mb-4 flex flex-wrap items-start gap-2 rounded-md border border-info/30 bg-info-softer/40 px-3 py-2 text-xs text-info-fg"
          data-testid="draft-review-banner"
          role="status"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Engine drafts below are waiting for your review. When
            you&apos;re done, go to{" "}
            <Link
              href="/planning"
              className="font-medium underline underline-offset-2 hover:no-underline"
            >
              Planning Overview
            </Link>{" "}
            — or open Weekly Meeting to lock the week.
          </span>
          <Link
            href="/planning/meeting"
            className="shrink-0 whitespace-nowrap font-medium underline underline-offset-2 hover:no-underline"
            data-testid="draft-review-banner-link"
          >
            Open Weekly Meeting →
          </Link>
        </div>
      )}

      {/* Tranche 117 (visual amplify) — the banner, 4 KPI microcards, and
          secondary nav used to be four separate stacked boxes pushing the
          board below the fold. One dense status bar now carries all of it,
          in the same inline "N label · N label" idiom the week-summary
          footer already uses lower on this page — reused, not invented. */}
      <div
        className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border/50 bg-bg-raised px-3 py-2 text-xs"
        data-testid="planned-only-banner"
        role="status"
      >
        {/* /ux-release-gate fix (2026-07-02): the nav links used to live
            inside this loading/loaded ternary and vanished for ~1-2s on
            every page load (FLOW-117-01) — they're now a permanent sibling
            so they're reachable immediately. */}
        {plansQuery.isLoading ? (
          <span className="h-4 w-64 animate-pulse rounded bg-bg-subtle" aria-hidden="true" />
        ) : (
          <>
            <span className="text-fg-muted">
              <span className="font-medium text-fg-strong">Planned only.</span>{" "}
              Inventory updates only after actual production is reported.
            </span>
            {hasData && (
              <>
                <span className="text-fg-faint" aria-hidden>·</span>
                <span className="font-mono font-semibold tabular-nums text-fg-strong">{plannedCount}</span>
                <span className="text-fg-muted">planned</span>
                <span className="text-fg-faint" aria-hidden>·</span>
                <span className="font-mono font-semibold tabular-nums text-success-fg">{doneCount}</span>
                <span className="text-fg-muted">completed</span>
                <span className="text-fg-faint" aria-hidden>·</span>
                <span className="font-mono font-semibold tabular-nums text-fg-strong">
                  {uniformUom
                    ? totalQty % 1 === 0
                      ? totalQty.toFixed(0)
                      : totalQty.toFixed(1)
                    : activePlanCount}
                </span>
                <span className="text-fg-muted">
                  {uniformUom
                    ? `${uniformUom} total`
                    : activePlanCount === 1
                      ? "planned run"
                      : "planned runs"}
                </span>
                <span className="text-fg-faint" aria-hidden>·</span>
                <span className="font-mono font-semibold tabular-nums text-fg-strong">{completionPct}%</span>
                <span className="text-fg-muted">complete</span>
              </>
            )}
          </>
        )}
        <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-3 text-fg-muted sm:w-auto sm:justify-start">
          <Link href="/planning/runs" className="flex items-center gap-1 py-2 hover:text-fg transition-colors">
            <PlayCircle className="h-3 w-3" strokeWidth={2} />
            Planning runs
          </Link>
          <Link href="/planning/inventory-flow" className="flex items-center gap-1 py-2 hover:text-fg transition-colors">
            <Boxes className="h-3 w-3" strokeWidth={2} />
            Inventory flow
          </Link>
          <Link href="/stock/production-actual" className="flex items-center gap-1 py-2 hover:text-fg transition-colors">
            <Factory className="h-3 w-3" strokeWidth={2} />
            Report production
          </Link>
        </div>
      </div>

      {/* Week navigation — FLOW-006 (Tranche 054): below md the week-range
          label gets its own line above, Previous/Next/Refresh collapse to
          icon-only (aria-labels carry the names), and the Updated-HH:MM
          stamp drops below as a caption. md+ keeps the pre-054 layout. */}
      <div className="mb-4">
        {/* Mobile-only week-range line (md+ shows it inline in the row) */}
        <div
          className="mb-2 text-center font-mono text-sm font-semibold text-fg-strong tabular-nums md:hidden"
          data-testid="week-range-mobile"
        >
          {fmtWeekRange(weekStart, weekEnd)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-sm gap-1"
              onClick={() => goToWeek(addDays(weekStart, -7))}
              aria-label="Previous week"
            >
              <ChevronLeft className="h-3 w-3" strokeWidth={2} />
              <span className="hidden md:inline">Previous</span>
            </button>
            <button
              type="button"
              className="btn btn-sm gap-1"
              onClick={() => goToWeek(addDays(weekStart, 7))}
              aria-label="Next week"
            >
              <span className="hidden md:inline">Next</span>
              <ChevronRight className="h-3 w-3" strokeWidth={2} />
            </button>
            {/* FLOW-001 — jump the board back to today's lane. Always
                available below md while today is on the board; at md+ it
                appears only when today's lane is scrolled out of view, so
                wide desktop layouts are unchanged. */}
            {hasData && todayInWeek && allPlans.length > 0 ? (
              <button
                type="button"
                className={cn(
                  "btn btn-sm gap-1",
                  !todayOutOfView && "md:hidden",
                )}
                onClick={() => centerTodayLane(true)}
                aria-label="Scroll the board to today's lane"
                title="Scroll the board to today's lane"
                data-testid="board-jump-today"
              >
                <Calendar className="h-3 w-3" strokeWidth={2} />
                Today
              </button>
            ) : null}
          </div>
          <div className="hidden md:block font-mono text-sm font-semibold text-fg-strong tabular-nums">
            {fmtWeekRange(weekStart, weekEnd)}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => goToWeek(new Date())}
            >
              This week
            </button>
            {/* INTER-011 (Tranche 048) — the board also auto-refreshes every
                60s (usePlans refetchInterval); this is the manual path plus a
                freshness stamp. */}
            {plansQuery.dataUpdatedAt > 0 ? (
              <span
                className="hidden md:inline font-mono text-3xs text-fg-muted tabular-nums"
                data-testid="plans-updated-at"
              >
                Updated {fmtUpdatedTime(plansQuery.dataUpdatedAt)}
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-sm gap-1"
              onClick={() => void plansQuery.refetch()}
              disabled={plansQuery.isFetching}
              aria-label="Refresh the plan board now"
              title="Refresh the plan board now"
              data-testid="plans-refresh"
            >
              <RefreshCw
                className={cn("h-3 w-3", plansQuery.isFetching && "animate-spin")}
                strokeWidth={2}
              />
              <span className="hidden md:inline">Refresh</span>
            </button>
          </div>
        </div>
        {/* Mobile-only freshness caption */}
        {plansQuery.dataUpdatedAt > 0 ? (
          <div
            className="mt-1 font-mono text-3xs text-fg-muted tabular-nums md:hidden"
            data-testid="plans-updated-at-mobile"
          >
            Updated {fmtUpdatedTime(plansQuery.dataUpdatedAt)}
          </div>
        ) : null}
      </div>

      {/* ── Layer 2: Week Timeline Rail ── */}
      {hasData && (
        <WeekTimelineRail days={railDays} weekMax={weekMaxVolume} />
      )}

      {/* D13 Tier 1 (Tranche 048) — compact "Today" strip: today's lane
          progress + tomorrow preview + quick "Move to tomorrow" for each
          still-unreported today plan. Only rendered when today is inside
          the visible week (the query window). */}
      {hasData && todayInWeek ? (
        /* UX-flow audit (FINDING-06/F): the strip is the planner's "today"
           anchor, so it must persist even on a day with nothing planned —
           it used to vanish when today + tomorrow were both empty. */
        <div
          className="mb-4 rounded-lg border border-border/50 bg-bg-raised px-4 py-3 shadow-raised"
          data-testid="today-strip"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Today
            </span>
            {todaySummary.todayPlanned === 0 ? (
              <span className="text-fg-muted" data-testid="today-strip-counts">
                Nothing planned for today yet.
              </span>
            ) : (
            <span data-testid="today-strip-counts">
              planned{" "}
              <span className="font-mono font-semibold tabular-nums text-fg-strong">
                {todaySummary.todayPlanned}
              </span>
              <span className="text-fg-faint"> · </span>
              reported{" "}
              <span className="font-mono font-semibold tabular-nums text-success-fg">
                {todaySummary.todayReported}
              </span>
              <span className="text-fg-faint"> · </span>
              unreported{" "}
              <span
                className={cn(
                  "font-mono font-semibold tabular-nums",
                  todaySummary.todayUnreported > 0
                    ? "text-warning-fg"
                    : "text-fg-strong",
                )}
              >
                {todaySummary.todayUnreported}
              </span>
            </span>
            )}
            <span
              className="ml-auto text-fg-muted"
              data-testid="today-strip-tomorrow"
            >
              Tomorrow:{" "}
              <span className="font-mono font-semibold tabular-nums text-fg-strong">
                {todaySummary.tomorrowJobs}
              </span>{" "}
              {todaySummary.tomorrowJobs === 1 ? "job" : "jobs"},{" "}
              <span className="font-mono font-semibold tabular-nums text-fg-strong">
                {fmtQty(String(todaySummary.tomorrowUnits), todaySummary.tomorrowUom ?? "units")}
              </span>
            </span>
          </div>
          {canAct && todaySummary.unreportedTodayPlans.length > 0 ? (
            <div className="mt-2 space-y-1" data-testid="today-strip-unreported">
              {todaySummary.unreportedTodayPlans.map((p) => (
                <div
                  key={p.plan_id}
                  className="flex items-center justify-between gap-2 rounded border border-border/40 bg-bg-subtle/40 px-2 py-1 text-xs"
                  data-testid="today-strip-unreported-row"
                  data-plan-id={p.plan_id}
                >
                  <span className="min-w-0 truncate text-fg">
                    {p.item_name ?? "Unnamed product"}{" "}
                    <span className="font-mono tabular-nums text-fg-muted">
                      {fmtQty(p.planned_qty ?? "0", p.uom ?? "")}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-xs shrink-0"
                    onClick={() => handleMoveToTomorrow(p)}
                    // INTER-003 (Tranche 079) — disable only the in-flight
                    // plan's row, plus any row when another row is updating
                    // (with a clear "wait" tooltip). Rows that are NOT the
                    // pending one stay clickable when nothing is in flight.
                    disabled={
                      pendingPlanId === p.plan_id ||
                      (pendingPlanId !== null && pendingPlanId !== p.plan_id)
                    }
                    title={
                      pendingPlanId !== null && pendingPlanId !== p.plan_id
                        ? "Another plan is updating — please wait"
                        : "Move this plan to tomorrow's lane"
                    }
                    data-testid="today-strip-move-tomorrow"
                  >
                    Move to tomorrow
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

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
                    <span className="ml-auto text-3xs text-fg-faint">
                      If this continues, contact your system administrator.
                    </span>
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
                  Add from Recommendations
                </button>
              </>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Board container — bg-bg-subtle covers the dot-grid behind lanes.
              Tranche 054: ref + onScroll feed the today-lane auto-center and
              the "Today" jump-button visibility (FLOW-001). */}
          <div
            ref={boardRef}
            onScroll={updateTodayVisibility}
            className="rounded-xl bg-bg-subtle p-3 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            data-testid="production-plan-week"
            // A11Y-006 — a horizontally-scrolling region must be keyboard
            // operable. tabindex makes it focusable so arrow keys scroll it;
            // role+label give it an accessible name in the tab order.
            tabIndex={0}
            role="region"
            aria-label="Weekly production board — scroll horizontally for all seven days"
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
                  // FLOW-002 (Tranche 054) — lane floor 140px below md so a
                  // phone shows ~2.5 lanes; md+ keeps the original 196px.
                  <div
                    key={iso}
                    ref={isToday ? todayLaneRef : undefined}
                    className="min-w-[140px] md:min-w-[196px] flex-1"
                  >
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
                      onAddNote={(d) => setShowAddNote({ defaultDate: toIsoDate(d) })}
                      onEdit={setEditingPlan}
                      onCancel={setCancellingPlan}
                      onDelete={setDeletingPlan}
                      onAdjustRecipe={(p) => setRecipePanelPlanId(p.plan_id)}
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
                <span className="text-3xs font-semibold uppercase tracking-sops text-fg-muted">
                  Week completion
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums text-fg-strong">
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
                <span className="font-mono font-semibold text-fg-strong tabular-nums">{plannedCount}</span>{" "}
                planned
              </span>
              <span className="text-fg-faint">·</span>
              <span>
                <span className="font-mono font-semibold text-success-fg tabular-nums">{doneCount}</span>{" "}
                completed
              </span>
              {cancelledCount > 0 && (
                <>
                  <span className="text-fg-faint">·</span>
                  <span>
                    <span className="font-mono font-semibold text-danger-fg tabular-nums">{cancelledCount}</span>{" "}
                    cancelled
                  </span>
                </>
              )}
            </div>
            {/* FLOW-020 (Tranche 054) — visible at all widths (was hidden
                lg:flex); the flex-wrap parent gives it its own row on
                narrow screens. */}
            <div className="flex items-center gap-2 ml-auto">
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
          onClose={() => {
            setShowManualAdd(null);
            setManualAddErrors(null);
          }}
          onSubmit={handleManualAdd}
          isSubmitting={createMut.isPending}
          uomOptions={uomOptions}
          serverErrors={manualAddErrors}
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

      {showAddNote ? (
        <AddNoteModal
          defaultDate={showAddNote.defaultDate}
          onClose={() => setShowAddNote(null)}
          onSubmit={handleAddNote}
          isSubmitting={createMut.isPending}
        />
      ) : null}

      {editingPlan?.plan_type === "note" ? (
        <EditNoteModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSubmit={handleEdit}
          isSubmitting={patchMut.isPending}
        />
      ) : editingPlan ? (
        <EditModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSubmit={handleEdit}
          isSubmitting={patchMut.isPending}
          uomOptions={uomOptions}
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

      {deletingPlan ? (
        <DeleteModal
          plan={deletingPlan}
          onClose={() => setDeletingPlan(null)}
          onConfirm={handleDelete}
          isSubmitting={deleteMut.isPending}
        />
      ) : null}

      {/* Tranche 052 — improvised liquid recipe editor */}
      {recipePanelPlanId ? (
        <RecipeOverridePanel
          planId={recipePanelPlanId}
          onClose={() => setRecipePanelPlanId(null)}
          onSaved={(msg) => flashToast("success", msg)}
        />
      ) : null}

      {toast ? (
        <Toast kind={toast.kind} message={toast.message} onClose={() => setToast(null)} />
      ) : null}
    </div>
  );
}

export type { RenderedState } from "./_lib/types";
