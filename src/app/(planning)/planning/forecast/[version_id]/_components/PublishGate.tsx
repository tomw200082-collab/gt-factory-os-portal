"use client";

// ---------------------------------------------------------------------------
// Forecast version detail — Publish gate modal (two-stage, edit-chrome
// polish 2026-05-05).
//
// Owner: W2 Mode B-ForecastMonthly-Redesign (Wave 2 chunks 4 + 5, plan
// §Task 4.1.5).
//
// Sources consulted:
//   - Stripe invoicing docs: "Review invoice → Finalize and send /
//     Finalize only" two-step pattern, where the user explicitly confirms
//     the irreversible transition (draft → finalized).
//   - Linear UI redesign notes: heavy actions get a calm review surface,
//     not a single-click footgun.
//   - NN/g indicators-vs-validation: pre-flight checklist communicates
//     "what must be true before we do this" up front.
//
// Stages:
//   1. REVIEW  — pre-publish checklist of human-readable requirements.
//      Each row is green check OR amber X with a one-line explanation.
//      Disable "Continue" until every required row passes.
//   2. CONFIRM — small "are you sure?" surface explaining publish is
//      irreversible (forecast becomes the active demand source for the
//      planning engine). Primary "Publish forecast" + secondary "Back".
//
// Users can step Back from CONFIRM → REVIEW. Closing the modal at any
// stage cancels publish entirely.
//
// Built on @radix-ui/react-dialog for proper focus trap + a11y.
// ---------------------------------------------------------------------------

import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { MonthBucket } from "../_lib/format";
import type { ForecastLineLite, ItemForGrid } from "./MonthlyGrid";

export interface PublishMissingCell {
  item_id: string;
  period_bucket_key: string;
}

interface PublishGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Items in the forecast (sparse). */
  items: ItemForGrid[];
  /** Lines in the forecast. */
  lines: ForecastLineLite[];
  /** Bucket columns. */
  buckets: MonthBucket[];
  /** Items pre-fetched for name lookup. */
  itemsById: Map<string, { item_name: string; item_id: string }>;
  /** Missing cells from a prior publish 409 response (if any). */
  missingCellsFromBackend?: PublishMissingCell[];
  /** True while the publish mutation is in-flight. */
  isPublishing: boolean;
  /** Confirm publish. */
  onConfirm: () => void;
}

type Stage = "review" | "confirm";

function fmtIntLocal(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.floor(n).toLocaleString("en-US");
}

export function PublishGate({
  open,
  onOpenChange,
  items,
  lines,
  buckets,
  itemsById,
  missingCellsFromBackend,
  isPublishing,
  onConfirm,
}: PublishGateProps) {
  const [stage, setStage] = useState<Stage>("review");

  // Reset to "review" every time the modal opens.
  useEffect(() => {
    if (open) setStage("review");
  }, [open]);

  // Compute summary stats + checklist state from props.
  const summary = useMemo(() => {
    const filledLines = lines.filter((l) => Number(l.forecast_quantity) > 0);
    const totalDemand = filledLines.reduce(
      (acc, l) => acc + Number(l.forecast_quantity),
      0,
    );

    const linesByCell = new Map<string, string>();
    for (const l of lines) {
      linesByCell.set(`${l.item_id}|${l.period_bucket_key}`, l.forecast_quantity);
    }
    const localMissing: PublishMissingCell[] = [];
    const itemsWithLines = new Set(lines.map((l) => l.item_id));
    for (const itemId of itemsWithLines) {
      for (const b of buckets) {
        const v = linesByCell.get(`${itemId}|${b.key}`);
        if (v === undefined || v === "" || v === null) {
          localMissing.push({ item_id: itemId, period_bucket_key: b.key });
        }
      }
    }

    // Empty-week detection: any bucket where the total across items is 0.
    const bucketTotals = new Map<string, number>();
    for (const l of lines) {
      const cur = bucketTotals.get(l.period_bucket_key) ?? 0;
      bucketTotals.set(
        l.period_bucket_key,
        cur + (Number(l.forecast_quantity) || 0),
      );
    }
    const emptyBuckets: string[] = [];
    for (const b of buckets) {
      const v = bucketTotals.get(b.key) ?? 0;
      if (v <= 0) emptyBuckets.push(b.key);
    }

    return {
      itemsCount: items.length,
      bucketsCount: buckets.length,
      filledCellsCount: filledLines.length,
      totalDemand,
      localMissing,
      emptyBuckets,
    };
  }, [items, lines, buckets]);

  // Prefer backend-reported missing cells if present (richer / authoritative).
  const missingToShow = missingCellsFromBackend?.length
    ? missingCellsFromBackend
    : summary.localMissing;

  // Pre-publish checklist rows.
  const checklist: Array<{
    id: string;
    pass: boolean;
    title: string;
    detail: string;
  }> = [
    {
      id: "has-items",
      pass: summary.itemsCount > 0,
      title: "Forecast contains at least one item",
      detail:
        summary.itemsCount > 0
          ? `${fmtIntLocal(summary.itemsCount)} item${summary.itemsCount === 1 ? "" : "s"} included.`
          : "Add an item via the search box before publishing.",
    },
    {
      id: "all-cells-filled",
      pass: missingToShow.length === 0,
      title: "Every bucket has a value",
      detail:
        missingToShow.length === 0
          ? "All cells are filled."
          : `${missingToShow.length} cell${missingToShow.length === 1 ? "" : "s"} still need values.`,
    },
    {
      id: "total-positive",
      pass: summary.totalDemand > 0,
      title: "Total demand is greater than zero",
      detail:
        summary.totalDemand > 0
          ? `${fmtIntLocal(summary.totalDemand)} units across ${summary.bucketsCount} bucket${summary.bucketsCount === 1 ? "" : "s"}.`
          : "Enter at least one positive quantity.",
    },
    {
      id: "no-empty-bucket",
      pass: summary.emptyBuckets.length === 0,
      title: "No empty months in the horizon",
      detail:
        summary.emptyBuckets.length === 0
          ? "Every month carries at least one positive value."
          : `${summary.emptyBuckets.length} bucket${summary.emptyBuckets.length === 1 ? "" : "s"} sum to zero across all items.`,
    },
  ];

  const allPass = checklist.every((c) => c.pass);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-40 bg-fg-strong/40 backdrop-blur-sm animate-fade-in"
          data-testid="forecast-publish-overlay"
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-border/70 bg-bg-raised shadow-pop animate-fade-in"
          data-testid="forecast-publish-modal"
          data-stage={stage}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border/60 bg-gradient-to-b from-bg-raised to-bg/40 px-5 py-4">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-1.5">
                {/* Tranche 075 (cross-cutting tiny-text): bumped text-[9px]
                    arbitrary brackets to the existing scale class text-3xs
                    used elsewhere in this surface (line ~330, ~467) and
                    across planning. */}
                <span className="text-3xs font-bold uppercase tracking-ops text-fg-faint">
                  Step {stage === "review" ? "1" : "2"} of 2
                </span>
                <span className="text-fg-faint">·</span>
                <span className="text-3xs font-semibold uppercase tracking-ops text-fg-muted">
                  {stage === "review" ? "Review" : "Confirm"}
                </span>
              </div>
              <Dialog.Title className="text-base font-semibold tracking-tight text-fg-strong">
                {stage === "review"
                  ? "Pre-publish review"
                  : "Publish this forecast?"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-relaxed text-fg-muted">
                {stage === "review"
                  ? "Every requirement below must pass before publish. Drafts are auto-saved — you can come back later."
                  : "Once published, this forecast becomes the active demand source for the planning engine. Drafts can be revised but a published forecast is immutable."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="-mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded text-fg-faint hover:bg-bg-subtle hover:text-fg"
                aria-label="Close"
                data-testid="forecast-publish-close"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body */}
          {stage === "review" ? (
            <div className="space-y-3 px-5 py-4">
              {/* Compact summary strip */}
              <div className="flex items-baseline justify-between gap-3 rounded border border-border/60 bg-bg-subtle/50 px-3 py-2">
                <SummaryInline label="Items" value={fmtIntLocal(summary.itemsCount)} />
                <SummaryInline label="Cells filled" value={fmtIntLocal(summary.filledCellsCount)} />
                <SummaryInline label="Total demand" value={fmtIntLocal(summary.totalDemand)} />
              </div>

              {/* Checklist */}
              <div
                className="fc-publish-checklist"
                data-testid="forecast-publish-checklist"
              >
                {checklist.map((row) => (
                  <div
                    key={row.id}
                    className="fc-publish-checklist-row"
                    data-pass={row.pass ? "true" : "false"}
                    data-testid={`forecast-publish-checklist-${row.id}`}
                  >
                    {row.pass ? (
                      <CheckCircle2
                        className="fc-publish-checklist-icon h-3.5 w-3.5"
                        strokeWidth={2.5}
                      />
                    ) : (
                      <XCircle
                        className="fc-publish-checklist-icon h-3.5 w-3.5"
                        strokeWidth={2.5}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="fc-publish-checklist-title">
                        {row.title}
                      </div>
                      <div className="fc-publish-checklist-detail">
                        {row.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Missing-cell inline list (only when checklist failed on
                  the all-cells-filled row). */}
              {missingToShow.length > 0 ? (
                <div
                  className="rounded border border-warning/30 bg-warning-softer px-3 py-2 text-2xs text-warning-fg"
                  data-testid="forecast-publish-f1-fail"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className="mt-0.5 h-3 w-3 shrink-0"
                      strokeWidth={2.5}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">
                        {missingToShow.length} missing cell
                        {missingToShow.length === 1 ? "" : "s"}
                      </div>
                      <ul
                        className="mt-1.5 max-h-28 overflow-y-auto space-y-0.5 font-mono"
                        data-testid="forecast-publish-missing-list"
                      >
                        {missingToShow.slice(0, 8).map((c) => {
                          const item = itemsById.get(c.item_id);
                          const bucketLabel = buckets.find(
                            (b) => b.key === c.period_bucket_key,
                          )?.label;
                          return (
                            <li
                              key={`${c.item_id}|${c.period_bucket_key}`}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="truncate">
                                {item?.item_name ?? c.item_id}
                              </span>
                              <span className="shrink-0 text-fg-muted">
                                {bucketLabel ?? c.period_bucket_key}
                              </span>
                            </li>
                          );
                        })}
                        {missingToShow.length > 8 ? (
                          <li className="text-3xs text-fg-faint">
                            and {missingToShow.length - 8} more…
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 px-5 py-5">
              <div className="flex items-start gap-3 rounded border border-success/30 bg-success-softer px-3 py-3">
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-success-fg"
                  strokeWidth={2}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 text-xs text-success-fg">
                  <div className="font-semibold">All checks passed.</div>
                  <div className="mt-0.5 text-fg-muted">
                    {fmtIntLocal(summary.itemsCount)} item
                    {summary.itemsCount === 1 ? "" : "s"} ·{" "}
                    {fmtIntLocal(summary.filledCellsCount)} cell
                    {summary.filledCellsCount === 1 ? "" : "s"} ·{" "}
                    {fmtIntLocal(summary.totalDemand)} units total demand.
                  </div>
                </div>
              </div>

              <div className="rounded border border-border/60 bg-bg-subtle/50 px-3 py-2.5 text-xs text-fg-muted">
                <div className="font-semibold text-fg">
                  What happens after publish?
                </div>
                <ul className="mt-1.5 space-y-1 leading-relaxed">
                  <li className="flex items-start gap-1.5">
                    <ChevronRight
                      className="mt-0.5 h-3 w-3 shrink-0 text-fg-faint"
                      strokeWidth={2.5}
                    />
                    <span>
                      The forecast becomes the active demand source for the
                      next planning run.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <ChevronRight
                      className="mt-0.5 h-3 w-3 shrink-0 text-fg-faint"
                      strokeWidth={2.5}
                    />
                    <span>
                      The version is immutable — to revise, create a new
                      draft that supersedes this one.
                    </span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <ChevronRight
                      className="mt-0.5 h-3 w-3 shrink-0 text-fg-faint"
                      strokeWidth={2.5}
                    />
                    <span>
                      Items not in this forecast will rely solely on open
                      orders for demand.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-bg-subtle/40 px-5 py-3">
            {stage === "confirm" ? (
              <button
                type="button"
                className="btn btn-sm gap-1.5"
                onClick={() => setStage("review")}
                disabled={isPublishing}
                data-testid="forecast-publish-back"
              >
                <ChevronLeft className="h-3 w-3" strokeWidth={2.5} />
                Back
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="btn btn-sm"
                  data-testid="forecast-publish-cancel"
                  disabled={isPublishing}
                >
                  Cancel
                </button>
              </Dialog.Close>
              {stage === "review" ? (
                <button
                  type="button"
                  className={cn(
                    "btn btn-sm gap-1.5",
                    allPass ? "btn-primary" : "",
                  )}
                  data-testid="forecast-publish-continue"
                  disabled={!allPass}
                  onClick={() => setStage("confirm")}
                >
                  Continue
                  <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1.5"
                  data-testid="forecast-publish-confirm"
                  disabled={isPublishing}
                  onClick={onConfirm}
                >
                  <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                  {isPublishing ? "Publishing…" : "Publish forecast"}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SummaryInline({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-base font-bold tabular-nums tracking-tight text-fg-strong">
        {value}
      </span>
      <span className="text-3xs uppercase tracking-[0.06em] text-fg-muted">
        {label}
      </span>
    </div>
  );
}
