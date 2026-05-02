"use client";

// ---------------------------------------------------------------------------
// Forecast version detail — Publish gate modal.
//
// Owner: W2 Mode B-ForecastMonthly-Redesign (Wave 2 chunks 4 + 5, plan
// §Task 4.1.5).
//
// Triggered by the "Publish" button. Shows:
//   - Total items × buckets that will be published
//   - Total demand sum (integer, formatted with thousands separator)
//   - F1 status: "All complete" or inline list of missing cells
//   - Cancel + Confirm buttons
//
// On Confirm: POSTs /api/forecasts/publish via the parent's mutation (parent
// owns the request to keep the modal pure / testable). On 409
// FORECAST_CELLS_MISSING (Wave 1 backend), parent surfaces the inline list
// here.
//
// Built on @radix-ui/react-dialog (already a portal dependency) for proper
// focus trap + a11y. English LTR per Tom-locked global standard.
// ---------------------------------------------------------------------------

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { formatInt } from "../_lib/format";
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
  // Compute summary stats from props.
  const summary = useMemo(() => {
    const filledLines = lines.filter((l) => Number(l.forecast_quantity) > 0);
    const totalDemand = filledLines.reduce(
      (acc, l) => acc + Number(l.forecast_quantity),
      0,
    );

    // Local F1 (sparse): for each item that has at least one line, every
    // unfrozen bucket should have a non-zero (or at least non-null) entry.
    // Wave 1 backend treats NULL forecast_quantity as the gate; client-side
    // we mirror that for preview. Frozen buckets are exempt because the
    // current-month freeze rule doesn't permit edits anyway.
    const linesByCell = new Map<string, string>();
    for (const l of lines) {
      linesByCell.set(`${l.item_id}|${l.period_bucket_key}`, l.forecast_quantity);
    }
    const localMissing: PublishMissingCell[] = [];
    const itemsWithLines = new Set(lines.map((l) => l.item_id));
    for (const itemId of itemsWithLines) {
      for (const b of buckets) {
        if (b.frozen) continue;
        const v = linesByCell.get(`${itemId}|${b.key}`);
        if (v === undefined || v === "" || v === null) {
          localMissing.push({ item_id: itemId, period_bucket_key: b.key });
        }
      }
    }

    return {
      itemsCount: items.length,
      bucketsCount: buckets.length,
      filledCellsCount: filledLines.length,
      totalDemand,
      localMissing,
    };
  }, [items, lines, buckets]);

  // Prefer backend-reported missing cells if present (richer / authoritative).
  const missingToShow = missingCellsFromBackend?.length
    ? missingCellsFromBackend
    : summary.localMissing;

  const f1Pass = missingToShow.length === 0;

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
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border/60 bg-gradient-to-b from-bg-raised to-bg/40 px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold tracking-tight text-fg-strong">
                Publish forecast?
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-relaxed text-fg-muted">
                Once published, this forecast becomes the active demand source
                for the next planning run. Drafts can be revised but a published
                forecast is immutable.
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
          <div className="space-y-3 px-5 py-4">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <SummaryStat
                label="Items"
                value={formatInt(summary.itemsCount)}
              />
              <SummaryStat
                label="Cells filled"
                value={formatInt(summary.filledCellsCount)}
              />
              <SummaryStat
                label="Total demand"
                value={formatInt(summary.totalDemand)}
              />
            </div>

            {/* F1 status */}
            {f1Pass ? (
              <div
                className="flex items-start gap-2 rounded border border-success/30 bg-success-softer px-3 py-2.5 text-xs text-success-fg"
                data-testid="forecast-publish-f1-pass"
              >
                <CheckCircle2
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  strokeWidth={2.5}
                />
                <div>
                  <div className="font-semibold">All cells filled.</div>
                  <div className="mt-0.5 text-fg-muted">
                    Sparse forecast — only items you added are included. Items
                    not in the forecast will rely solely on open orders.
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="rounded border border-warning/30 bg-warning-softer px-3 py-2.5 text-xs text-warning-fg"
                data-testid="forecast-publish-f1-fail"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    strokeWidth={2.5}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {missingToShow.length} cell
                      {missingToShow.length === 1 ? "" : "s"} need values
                      before publish.
                    </div>
                    <div className="mt-0.5 text-fg-muted">
                      Every item in the forecast must have a value for every
                      unfrozen month.
                    </div>
                  </div>
                </div>
                <ul
                  className="mt-2 max-h-32 overflow-y-auto rounded border border-warning/20 bg-bg-raised/60 px-2 py-1.5 text-2xs text-fg"
                  data-testid="forecast-publish-missing-list"
                >
                  {missingToShow.slice(0, 12).map((c) => {
                    const item = itemsById.get(c.item_id);
                    const bucketLabel = buckets.find(
                      (b) => b.key === c.period_bucket_key,
                    )?.label;
                    return (
                      <li
                        key={`${c.item_id}|${c.period_bucket_key}`}
                        className="flex items-center justify-between gap-2 py-0.5 font-mono"
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
                  {missingToShow.length > 12 ? (
                    <li className="pt-1 text-3xs text-fg-faint">
                      and {missingToShow.length - 12} more…
                    </li>
                  ) : null}
                </ul>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-bg-subtle/40 px-5 py-3">
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
            <button
              type="button"
              className={cn(
                "btn btn-sm gap-1.5",
                f1Pass ? "btn-primary" : "",
              )}
              data-testid="forecast-publish-confirm"
              disabled={isPublishing || !f1Pass}
              onClick={onConfirm}
            >
              <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
              {isPublishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/60 bg-bg-raised px-3 py-2">
      <div className="text-3xs font-semibold uppercase tracking-sops text-fg-muted">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-fg-strong">
        {value}
      </div>
    </div>
  );
}
