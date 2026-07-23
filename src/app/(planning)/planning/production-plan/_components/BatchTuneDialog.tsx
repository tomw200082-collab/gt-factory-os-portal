"use client";

// BatchTuneDialog — the one dialog that tunes a production batch anywhere it
// appears (production-plan board, weekly-meeting cockpit). Born from Tom's
// 2026-07-23 gate: "אין לי אופציה לכוונן את הכמויות" — base-batch rows had NO
// quantity-tuning affordance anywhere in the stack.
//
// What it tunes:
//   • Base-batch rows: production day, per-product pack split (with a live
//     liters-vs-batch meter), notes. planned_qty stays = batch_size_l (DB
//     CHECK production_plan_base_batch_shape) — the split is the quantity.
//   • Item rows (matcha repack / manual adds): day, quantity, notes.
//   • Any tunable row: cancel-with-reason from the same surface (danger zone).
//
// Contract: PATCH /api/production-plan/[plan_id] — pack_manifest is the
// COMPLETE intended split (wholesale replace; backend recomputes fg_share).

import { useMemo, useState } from "react";
import {
  Ban,
  Loader2,
  RotateCcw,
  AlertTriangle,
  Save,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useDialogA11y } from "../_lib/useDialogA11y";
import { usePatchPlan } from "../_lib/usePlans";
import type { PatchProductionPlanRequest, ProductionPlanRow } from "../_lib/types";

// ---------------------------------------------------------------------------
// Normalized shape — both boards feed this one dialog.
// ---------------------------------------------------------------------------
export interface TunablePack {
  item_id: string;
  item_name: string | null;
  qty: number;
  /** Liters of base per unit; null/undefined = unknown (meter degrades). */
  fill_l_per_unit: number | null;
}

export interface TunableBatch {
  plan_id: string;
  plan_date: string; // YYYY-MM-DD
  is_base_batch: boolean;
  /** Operator-facing title: base display name or item name. */
  title: string;
  batch_size_l: number | null;
  /** Raw DB status — 'draft' shows the not-locked warning. */
  status: string;
  planned_qty: number | null; // item rows only
  uom: string | null;
  notes: string | null;
  packs: TunablePack[];
}

export function tunableFromPlanRow(p: ProductionPlanRow): TunableBatch {
  return {
    plan_id: p.plan_id,
    plan_date: p.plan_date,
    is_base_batch: p.is_base_batch,
    title: p.is_base_batch
      ? (p.base_bom_head_id ?? "Base batch").replace(/^BOM-BASE-/, "").replace(/-/g, " ")
      : (p.item_name ?? "Unnamed item"),
    batch_size_l: p.planned_qty != null && p.is_base_batch ? parseFloat(p.planned_qty) : null,
    status: p.status,
    planned_qty: p.planned_qty != null && !p.is_base_batch ? parseFloat(p.planned_qty) : null,
    uom: p.uom,
    notes: p.notes,
    packs: (p.pack_manifest ?? []).map((l) => ({
      item_id: l.item_id,
      item_name: l.item_name,
      qty: parseFloat(l.qty),
      fill_l_per_unit:
        l.fill_l_per_unit != null && Number.isFinite(parseFloat(l.fill_l_per_unit))
          ? parseFloat(l.fill_l_per_unit)
          : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Liters meter math (exported for unit tests)
// ---------------------------------------------------------------------------
export function packLiters(packs: Array<{ qty: number; fill_l_per_unit: number | null }>): {
  liters: number | null; // null = at least one line has unknown fill
  units: number;
} {
  let liters = 0;
  let known = true;
  let units = 0;
  for (const p of packs) {
    units += Number.isFinite(p.qty) ? p.qty : 0;
    if (p.fill_l_per_unit == null) known = false;
    else liters += (Number.isFinite(p.qty) ? p.qty : 0) * p.fill_l_per_unit;
  }
  return { liters: known ? Math.round(liters * 100) / 100 : null, units };
}

export function meterTone(liters: number, batch: number): "ok" | "under" | "over" {
  if (batch <= 0) return "ok";
  const ratio = liters / batch;
  if (ratio > 1.02) return "over";
  if (ratio < 0.98) return "under";
  return "ok";
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------
export function BatchTuneDialog({
  batch,
  onClose,
  onSaved,
}: {
  batch: TunableBatch;
  onClose: () => void;
  /** Extra cache invalidation for the caller (e.g. meeting's cadence keys). */
  onSaved?: () => void;
}) {
  const patch = usePatchPlan();

  const [planDate, setPlanDate] = useState(batch.plan_date);
  const [notes, setNotes] = useState(batch.notes ?? "");
  const [qty, setQty] = useState<string>(
    batch.planned_qty != null ? String(batch.planned_qty) : "",
  );
  // Pack lines as editable strings; removed lines keep their data for undo.
  const [lines, setLines] = useState(
    batch.packs.map((p) => ({ ...p, qtyStr: String(p.qty), removed: false })),
  );
  const [error, setError] = useState<string | null>(null);

  // Danger zone (cancel batch)
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const activeLines = lines.filter((l) => !l.removed);

  const parsedPacks = activeLines.map((l) => ({
    item_id: l.item_id,
    item_name: l.item_name,
    qty: parseFloat(l.qtyStr),
    fill_l_per_unit: l.fill_l_per_unit,
  }));
  const packsValid =
    !batch.is_base_batch ||
    (parsedPacks.length > 0 && parsedPacks.every((p) => Number.isFinite(p.qty) && p.qty > 0));
  const itemQtyValid =
    batch.is_base_batch || (Number.isFinite(parseFloat(qty)) && parseFloat(qty) > 0);

  const packsDirty =
    batch.is_base_batch &&
    (activeLines.length !== batch.packs.length ||
      lines.some((l) => !l.removed && parseFloat(l.qtyStr) !== l.qty));
  const isDirty =
    planDate !== batch.plan_date ||
    notes !== (batch.notes ?? "") ||
    packsDirty ||
    (!batch.is_base_batch && qty !== String(batch.planned_qty ?? ""));

  const meter = useMemo(() => packLiters(parsedPacks), [parsedPacks]);
  const batchL = batch.batch_size_l ?? 0;
  const tone =
    meter.liters != null && batchL > 0 ? meterTone(meter.liters, batchL) : "ok";

  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  function requestClose() {
    if (patch.isPending) return;
    if (isDirty || cancelReason.trim()) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }
  const { dialogRef, titleRef, onKeyDown: onDialogKeyDown } = useDialogA11y({
    onClose: requestClose,
    closeDisabled: patch.isPending,
  });

  const canSave = isDirty && packsValid && itemQtyValid && !patch.isPending;

  function submit() {
    if (!canSave) return;
    const body: PatchProductionPlanRequest = {};
    if (planDate !== batch.plan_date) body.plan_date = planDate;
    if (notes !== (batch.notes ?? "")) body.notes = notes;
    if (batch.is_base_batch) {
      if (packsDirty) {
        body.pack_manifest = parsedPacks.map((p) => ({ item_id: p.item_id, qty: p.qty }));
      }
    } else if (qty !== String(batch.planned_qty ?? "")) {
      body.planned_qty = parseFloat(qty);
    }
    setError(null);
    patch.mutate(
      { plan_id: batch.plan_id, body },
      {
        onSuccess: () => {
          onSaved?.();
          onClose();
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  function submitCancel() {
    setError(null);
    patch.mutate(
      {
        plan_id: batch.plan_id,
        body: { action: "cancel", cancel_reason: cancelReason.trim() || null },
      },
      {
        onSuccess: () => {
          onSaved?.();
          onClose();
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  }

  return (
    <div
      ref={dialogRef}
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-tune-title"
      data-testid="batch-tune-dialog"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      onKeyDown={onDialogKeyDown}
    >
      <div className="flex max-h-[min(92vh,680px)] w-full max-w-lg flex-col rounded-t-lg border border-border bg-bg-raised p-5 shadow-pop sm:rounded-lg">
        <div className="flex shrink-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <h2
              id="batch-tune-title"
              ref={titleRef}
              tabIndex={-1}
              className="truncate text-base font-semibold text-fg-strong outline-none"
            >
              {batch.is_base_batch ? `Tune batch — ${batch.title}` : `Tune plan — ${batch.title}`}
            </h2>
            <p className="mt-0.5 text-3xs text-fg-muted">
              {batch.is_base_batch
                ? `${batchL || "?"} L tank · adjust the bottle split, day, or notes`
                : "Adjust the quantity, day, or notes"}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs min-h-[32px] min-w-[32px] shrink-0"
            onClick={requestClose}
            disabled={patch.isPending}
            aria-label="Close"
            title="Close"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>

        {batch.status === "draft" && (
          <div
            role="status"
            className="mt-3 flex shrink-0 items-start gap-2 rounded-md border border-warning-border bg-warning-softer px-3 py-2 text-xs text-warning-fg"
            data-testid="batch-tune-draft-notice"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              This batch is still a draft — lock the week to protect your edits from the next
              draft regeneration.
            </span>
          </div>
        )}

        <form
          className="mt-4 flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Production day
              </span>
              <input
                type="date"
                className="input"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                data-testid="batch-tune-date"
              />
            </label>

            {batch.is_base_batch ? (
              <div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Bottle split
                  </span>
                  <span
                    className={cn(
                      "text-xs font-medium tabular-nums",
                      tone === "ok" && "text-success-fg",
                      tone === "under" && "text-warning-fg",
                      tone === "over" && "text-danger-fg",
                    )}
                    role="status"
                    aria-live="polite"
                    data-testid="batch-tune-meter"
                  >
                    {meter.liters != null
                      ? `${meter.liters} / ${batchL} L`
                      : `${meter.units} units`}
                    {tone === "over" ? " — over the tank" : tone === "under" ? " — leaves base over" : ""}
                  </span>
                </div>
                <ul className="space-y-1.5" data-testid="batch-tune-pack-lines">
                  {lines.map((l, idx) => (
                    <li
                      key={l.item_id}
                      className={cn(
                        "flex items-center gap-2 rounded-md border border-border-faint bg-bg-subtle/40 px-2.5 py-1.5",
                        l.removed && "opacity-50",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm" dir="auto">
                        {l.item_name ?? l.item_id}
                        {l.fill_l_per_unit != null ? (
                          <span className="ml-1.5 text-3xs text-fg-faint tabular-nums">
                            {l.fill_l_per_unit} L/unit
                          </span>
                        ) : null}
                      </span>
                      {l.removed ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs gap-1 text-accent"
                          onClick={() =>
                            setLines((ls) =>
                              ls.map((x, i) => (i === idx ? { ...x, removed: false } : x)),
                            )
                          }
                          data-testid="batch-tune-line-restore"
                        >
                          <RotateCcw className="h-2.5 w-2.5" strokeWidth={2.5} />
                          Restore
                        </button>
                      ) : (
                        <>
                          <label className="sr-only" htmlFor={`pack-qty-${l.item_id}`}>
                            Quantity for {l.item_name ?? l.item_id}
                          </label>
                          <input
                            id={`pack-qty-${l.item_id}`}
                            type="number"
                            inputMode="numeric"
                            step="any"
                            min="0"
                            className={cn(
                              "input w-24 text-right tabular-nums",
                              !(parseFloat(l.qtyStr) > 0) && "border-danger",
                            )}
                            value={l.qtyStr}
                            onChange={(e) =>
                              setLines((ls) =>
                                ls.map((x, i) =>
                                  i === idx ? { ...x, qtyStr: e.target.value } : x,
                                ),
                              )
                            }
                            aria-invalid={!(parseFloat(l.qtyStr) > 0) ? true : undefined}
                            data-testid={`batch-tune-qty-${l.item_id}`}
                          />
                          {activeLines.length > 1 ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs min-h-[32px] min-w-[32px] text-fg-muted"
                              onClick={() =>
                                setLines((ls) =>
                                  ls.map((x, i) => (i === idx ? { ...x, removed: true } : x)),
                                )
                              }
                              aria-label={`Remove ${l.item_name ?? l.item_id} from the split`}
                              title="Remove from split"
                              data-testid="batch-tune-line-remove"
                            >
                              <X className="h-2.5 w-2.5" strokeWidth={2.5} />
                            </button>
                          ) : null}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-3xs text-fg-faint">
                  The split is the plan&apos;s quantity — procurement buys bottles, caps and labels
                  from these numbers.
                </p>
              </div>
            ) : (
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
                    aria-invalid={!itemQtyValid ? true : undefined}
                    data-testid="batch-tune-item-qty"
                  />
                  {!itemQtyValid ? (
                    <span role="alert" className="mt-1 block text-3xs text-danger-fg">
                      Enter a quantity greater than zero.
                    </span>
                  ) : null}
                </label>
                <div className="block">
                  <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Unit
                  </span>
                  <div className="input flex items-center bg-bg-subtle/50 text-fg-muted">
                    {batch.uom ?? "—"}
                  </div>
                </div>
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Notes
              </span>
              <textarea
                rows={2}
                className="input min-h-[3rem]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="batch-tune-notes"
              />
            </label>

            {error ? (
              <div
                role="alert"
                className="rounded border border-danger/40 bg-danger-softer px-3 py-2 text-3xs text-danger-fg"
                data-testid="batch-tune-error"
              >
                {error}
              </div>
            ) : null}

            {/* Danger zone — cancel this batch without leaving the cockpit. */}
            <div className="rounded-md border border-border-faint bg-bg-subtle/30 px-3 py-2">
              {cancelOpen ? (
                <div className="space-y-2" data-testid="batch-tune-cancel-panel">
                  <label className="block">
                    <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      Reason for cancelling (optional)
                    </span>
                    <input
                      type="text"
                      className="input"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="e.g. demand covered, materials short"
                    />
                  </label>
                  <p className="text-3xs text-fg-muted">
                    Cancelling removes the batch from the board and from procurement&apos;s
                    shopping list. Inventory does not change.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setCancelOpen(false)}
                      disabled={patch.isPending}
                    >
                      Keep the batch
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger gap-1.5"
                      onClick={submitCancel}
                      disabled={patch.isPending}
                      data-testid="batch-tune-cancel-confirm"
                    >
                      <Ban className="h-3 w-3" strokeWidth={2.5} />
                      {patch.isPending ? "Cancelling…" : "Cancel batch"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="text-3xs font-medium text-fg-muted hover:text-danger-fg hover:underline"
                  onClick={() => setCancelOpen(true)}
                  aria-expanded={cancelOpen}
                  data-testid="batch-tune-cancel-open"
                >
                  Cancel this batch…
                </button>
              )}
            </div>
          </div>

          {confirmingDiscard ? (
            <div
              className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-3"
              data-testid="batch-tune-discard-confirm"
            >
              <span className="mr-auto text-xs text-fg-muted">Discard unsaved changes?</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setConfirmingDiscard(false)}
              >
                Keep editing
              </button>
              <button type="button" className="btn btn-sm btn-danger" onClick={onClose}>
                Discard
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-3">
              <button
                type="button"
                className="btn btn-sm"
                onClick={requestClose}
                disabled={patch.isPending}
              >
                Close
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm gap-1.5"
                disabled={!canSave}
                title={!isDirty ? "No changes yet" : undefined}
                data-testid="batch-tune-save"
              >
                {patch.isPending ? (
                  <Loader2
                    className="h-3 w-3 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Save className="h-3 w-3" strokeWidth={2.5} />
                )}
                {patch.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
