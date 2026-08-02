"use client";

// AddBatchModal — create a BASE-BATCH plan row directly from the board.
// Born from Tom's 2026-08-01 gate: the board could DISPLAY batch rows (the
// shape the factory uses most days) but only the weekly-meeting engine could
// CREATE them — every "Add production" entry point was per-item only
// (ux-flow audit FLOW-001/FLOW-002).
//
// Contract: POST /api/production-plan with plan_type:'base_batch'
// (production_plan_contract.md §6.2b). The server derives uom='L' and
// planned_qty = batch_size_l and computes fg_share — this dialog never
// sends them.
//
// Design language: same fixed-inset dialog as ManualAddModal; the split
// editor + liters meter reuse BatchTuneDialog's exported math so the two
// surfaces cannot drift.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Beaker, Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDialogA11y } from "../_lib/useDialogA11y";
import { packLiters, meterTone } from "./BatchTuneDialog";
import type { CreateBaseBatchRequest } from "../_lib/types";

// ---------------------------------------------------------------------------
// Data — ACTIVE BASE heads + the ACTIVE items that pack each of them.
// ---------------------------------------------------------------------------

interface BaseHeadRow {
  bom_head_id: string;
  display_family: string | null;
  final_bom_output_qty: string | null;
  final_bom_output_uom: string | null;
  status: string;
}

interface BatchableItemRow {
  item_id: string;
  item_name: string;
  status: string;
  base_bom_head_id: string | null;
  base_fill_qty_per_unit: string | null;
}

function useBaseHeads() {
  return useQuery<{ rows: BaseHeadRow[]; count: number }>({
    queryKey: ["boms", "heads", "BASE", "ACTIVE", "for-batch-composer"],
    queryFn: async () => {
      const res = await fetch("/api/boms/heads?bom_kind=BASE&status=ACTIVE&limit=200");
      if (!res.ok) throw new Error("Could not load base recipes");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useBatchableItems() {
  return useQuery<{ rows: BatchableItemRow[]; count: number }>({
    queryKey: ["master", "items", "ACTIVE", "for-batch-composer"],
    queryFn: async () => {
      const res = await fetch("/api/items?status=ACTIVE&limit=1000");
      if (!res.ok) throw new Error("Could not load items");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Operator-facing base label: display_family, else the head id un-slugged. */
export function baseHeadLabel(h: { bom_head_id: string; display_family: string | null }): string {
  return (
    h.display_family ??
    h.bom_head_id.replace(/^BOM-BASE-/, "").replace(/-/g, " ")
  );
}

interface SplitLine {
  item_id: string;
  item_name: string;
  fill_l_per_unit: number | null;
  qtyStr: string;
  removed: boolean;
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export function AddBatchModal({
  defaultDate,
  onClose,
  onSubmit,
  isSubmitting,
  serverError,
}: {
  defaultDate: string;
  onClose: () => void;
  onSubmit: (req: Omit<CreateBaseBatchRequest, "plan_type">) => void;
  isSubmitting: boolean;
  /** Non-field server error (422 general / 409 / 5xx) shown inline. */
  serverError: string | null;
}) {
  const headsQuery = useBaseHeads();
  const itemsQuery = useBatchableItems();

  const [planDate, setPlanDate] = useState(defaultDate);
  const [headId, setHeadId] = useState("");
  const [batchLStr, setBatchLStr] = useState("");
  const [lines, setLines] = useState<SplitLine[]>([]);
  const [notes, setNotes] = useState("");

  const { dialogRef, titleRef, onKeyDown: onDialogKeyDown } = useDialogA11y({
    onClose,
    closeDisabled: isSubmitting,
  });

  // Members per head — a base is only offerable when at least one ACTIVE
  // item packs it (an empty composer would be a dead end).
  const membersByHead = useMemo(() => {
    const map = new Map<string, BatchableItemRow[]>();
    for (const r of itemsQuery.data?.rows ?? []) {
      if (!r.base_bom_head_id || r.status !== "ACTIVE") continue;
      const list = map.get(r.base_bom_head_id) ?? [];
      list.push(r);
      map.set(r.base_bom_head_id, list);
    }
    return map;
  }, [itemsQuery.data]);

  const baseOptions = useMemo(() => {
    return (headsQuery.data?.rows ?? [])
      .filter((h) => (membersByHead.get(h.bom_head_id)?.length ?? 0) > 0)
      .sort((a, b) => baseHeadLabel(a).localeCompare(baseHeadLabel(b)));
  }, [headsQuery.data, membersByHead]);

  const selectedHead = baseOptions.find((h) => h.bom_head_id === headId) ?? null;

  function handleHeadChange(id: string) {
    setHeadId(id);
    const head = (headsQuery.data?.rows ?? []).find((h) => h.bom_head_id === id);
    // Prefill tank size from the recipe's recorded output; planner can edit.
    const out = head?.final_bom_output_qty ? parseFloat(head.final_bom_output_qty) : NaN;
    setBatchLStr(Number.isFinite(out) && out > 0 ? String(out) : "");
    setLines(
      (membersByHead.get(id) ?? [])
        .slice()
        .sort((a, b) => a.item_name.localeCompare(b.item_name))
        .map((m) => ({
          item_id: m.item_id,
          item_name: m.item_name,
          fill_l_per_unit:
            m.base_fill_qty_per_unit != null &&
            Number.isFinite(parseFloat(m.base_fill_qty_per_unit))
              ? parseFloat(m.base_fill_qty_per_unit)
              : null,
          qtyStr: "",
          removed: false,
        })),
    );
  }

  const activeLines = lines.filter((l) => !l.removed);
  const parsedPacks = activeLines.map((l) => ({
    item_id: l.item_id,
    qty: parseFloat(l.qtyStr),
    fill_l_per_unit: l.fill_l_per_unit,
  }));

  const batchL = parseFloat(batchLStr);
  const meter = useMemo(() => packLiters(parsedPacks), [parsedPacks]);
  const tone =
    meter.liters != null && Number.isFinite(batchL) && batchL > 0
      ? meterTone(meter.liters, batchL)
      : "ok";

  const splitValid =
    parsedPacks.length > 0 && parsedPacks.every((p) => Number.isFinite(p.qty) && p.qty > 0);
  const canSubmit =
    !!planDate &&
    !!headId &&
    Number.isFinite(batchL) &&
    batchL > 0 &&
    splitValid &&
    !isSubmitting;

  function doSubmit() {
    if (!canSubmit) return;
    onSubmit({
      plan_date: planDate,
      base_bom_head_id: headId,
      batch_size_l: batchL,
      pack_manifest: parsedPacks.map((p) => ({ item_id: p.item_id, qty: p.qty })),
      notes: notes.trim() ? notes.trim() : undefined,
    });
  }

  const loading = headsQuery.isLoading || itemsQuery.isLoading;
  const loadError = headsQuery.isError || itemsQuery.isError;

  return (
    <div
      ref={dialogRef}
      dir="ltr"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-2 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-batch-modal-title"
      data-testid="add-batch-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      onKeyDown={onDialogKeyDown}
      tabIndex={-1}
    >
      <div className="flex max-h-[min(92vh,680px)] w-full max-w-lg flex-col rounded-t-lg border border-border bg-bg-raised p-5 shadow-pop sm:rounded-lg">
        <h2
          id="add-batch-modal-title"
          ref={titleRef}
          tabIndex={-1}
          className="shrink-0 text-base font-semibold text-fg-strong outline-none"
        >
          Add base batch
        </h2>
        <p className="mt-1 shrink-0 text-3xs text-fg-muted">
          One tank run, split across the bottles that pack it. Planned only — inventory will
          not change until actual production is reported.
        </p>

        <form
          className="mt-4 flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            doSubmit();
          }}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-muted">
                Production day *
              </span>
              <input
                type="date"
                className="input"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                required
                aria-required="true"
                data-testid="add-batch-date"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-muted">
                Base recipe *
              </span>
              <select
                className="input"
                value={headId}
                onChange={(e) => handleHeadChange(e.target.value)}
                disabled={loading}
                required
                aria-required="true"
                data-testid="add-batch-base"
              >
                <option value="">
                  {loading ? "Loading bases…" : "— select a base —"}
                </option>
                {baseOptions.map((h) => (
                  <option key={h.bom_head_id} value={h.bom_head_id}>
                    {baseHeadLabel(h)}
                  </option>
                ))}
              </select>
              {loadError ? (
                <p className="mt-1 text-3xs text-danger-fg" role="alert">
                  Could not load base recipes — close and try again.
                </p>
              ) : null}
            </label>

            {selectedHead ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-muted">
                    Tank size (liters) *
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    className="input w-40 tabular-nums"
                    value={batchLStr}
                    onChange={(e) => setBatchLStr(e.target.value)}
                    required
                    aria-required="true"
                    aria-invalid={batchLStr && !(batchL > 0) ? true : undefined}
                    data-testid="add-batch-size"
                  />
                  {batchLStr && !(batchL > 0) ? (
                    <p className="mt-1 text-3xs text-warning-fg">
                      Enter a positive tank size in liters.
                    </p>
                  ) : selectedHead.final_bom_output_qty ? (
                    <p className="mt-1 text-3xs text-fg-faint">
                      Recipe output: {parseFloat(selectedHead.final_bom_output_qty)} L — adjust to
                      the tank you&apos;ll actually run.
                    </p>
                  ) : null}
                </label>

                <div>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-3xs font-semibold uppercase tracking-sops text-fg-muted">
                      Bottle split *
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
                      data-testid="add-batch-meter"
                    >
                      {meter.liters != null
                        ? `${meter.liters} / ${Number.isFinite(batchL) ? batchL : "?"} L`
                        : `${meter.units} units`}
                      {tone === "over"
                        ? " — over the tank"
                        : tone === "under"
                          ? " — leaves base over"
                          : ""}
                    </span>
                  </div>
                  <ul className="space-y-1.5" data-testid="add-batch-pack-lines">
                    {lines.map((l, idx) => (
                      <li
                        key={l.item_id}
                        className={cn(
                          "flex items-center gap-2 rounded-md border border-border-faint bg-bg-subtle/40 px-2.5 py-1.5",
                          l.removed && "opacity-50",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm" dir="auto">
                          {l.item_name}
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
                          >
                            <RotateCcw className="h-2.5 w-2.5" strokeWidth={2.5} />
                            Restore
                          </button>
                        ) : (
                          <>
                            <label className="sr-only" htmlFor={`add-batch-qty-${l.item_id}`}>
                              Quantity for {l.item_name}
                            </label>
                            <input
                              id={`add-batch-qty-${l.item_id}`}
                              type="number"
                              inputMode="numeric"
                              step="any"
                              min="0"
                              placeholder="0"
                              className={cn(
                                "input w-24 text-right tabular-nums",
                                l.qtyStr && !(parseFloat(l.qtyStr) > 0) && "border-danger",
                              )}
                              value={l.qtyStr}
                              onChange={(e) =>
                                setLines((ls) =>
                                  ls.map((x, i) =>
                                    i === idx ? { ...x, qtyStr: e.target.value } : x,
                                  ),
                                )
                              }
                              aria-invalid={
                                l.qtyStr && !(parseFloat(l.qtyStr) > 0) ? true : undefined
                              }
                              data-testid={`add-batch-qty-${l.item_id}`}
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
                                aria-label={`Remove ${l.item_name} from the split`}
                                title="Remove from split"
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
                    The split is the plan&apos;s quantity — procurement buys bottles, caps and
                    labels from these numbers. You can retune it any time from the card.
                  </p>
                </div>

                <label className="block">
                  <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-muted">
                    Notes
                  </span>
                  <textarea
                    rows={2}
                    className="input min-h-[3rem]"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes about this batch"
                  />
                </label>
              </>
            ) : null}

            {serverError ? (
              <div
                className="rounded border border-danger/40 bg-danger-softer px-3 py-2 text-3xs text-danger-fg"
                role="alert"
                data-testid="add-batch-server-error"
              >
                {serverError}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-2">
            <button type="button" className="btn btn-sm" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm gap-1.5"
              disabled={!canSubmit}
              data-testid="add-batch-submit"
            >
              {isSubmitting ? (
                <Loader2
                  className="h-3 w-3 animate-spin motion-reduce:animate-none"
                  strokeWidth={2.5}
                  aria-hidden
                />
              ) : (
                <Beaker className="h-3 w-3" strokeWidth={2.5} />
              )}
              {isSubmitting ? "Saving…" : "Add batch to plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
