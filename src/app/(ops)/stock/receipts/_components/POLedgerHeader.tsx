"use client";

// ---------------------------------------------------------------------------
// POLedgerHeader — sticky progress strip shown above the receipt form
// when the operator is in the PO track.
//
// Tranche 020.
//
// Replaces the buried "Reference PO (optional)" combobox + the
// shimmer-only context strip from Cycle 16. Shows:
//   - PO number, supplier, expected date (with urgency tier coloring)
//   - Aggregate line progress (3 of 5 fully received)
//   - Aggregate qty progress bar
//   - View PO + Switch PO affordances
//
// All numbers come from po_lines[]; the parent owns the fetch.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  type PoLineOption,
  PO_STATUS_BADGE,
  expectedBucketLabel,
} from "./types";

interface POLedgerHeaderProps {
  poId: string;
  poNumber: string;
  supplierName: string;
  expectedReceiveDate: string | null;
  status: string;
  poLines: PoLineOption[];
  // True when this PO was opened via ?po_id= URL param. In that path the
  // operator can't "switch PO" without leaving the linked CTA flow — we
  // hide the switch affordance and show "Back to PO" instead.
  urlLocked: boolean;
  onSwitch?: () => void;
  isLoading: boolean;
}

export function POLedgerHeader({
  poId,
  poNumber,
  supplierName,
  expectedReceiveDate,
  status,
  poLines,
  urlLocked,
  onSwitch,
  isLoading,
}: POLedgerHeaderProps) {
  const bucket = expectedBucketLabel(expectedReceiveDate);

  // Aggregate progress.
  // Lines complete = line_status === "CLOSED" (received-in-full).
  // Qty progress = sum(received_qty) / sum(ordered_qty) across non-cancelled lines.
  const active = poLines.filter((l) => l.line_status !== "CANCELLED");
  const closed = active.filter((l) => l.line_status === "CLOSED").length;
  const totalOrdered = active.reduce(
    (acc, l) => acc + (Number(l.ordered_qty) || 0),
    0,
  );
  const totalReceived = active.reduce(
    (acc, l) => acc + (Number(l.received_qty) || 0),
    0,
  );
  const qtyPct =
    totalOrdered > 0
      ? Math.min(100, Math.round((totalReceived / totalOrdered) * 100))
      : 0;

  return (
    <div
      className="sticky top-0 z-20 -mx-4 mb-4 border-b border-info/30 bg-bg-raised/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6"
      role="region"
      aria-label="Purchase order progress"
      data-testid="receipt-po-ledger-header"
    >
      {/* Row 1: identity + actions */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2 py-1 text-sm font-medium text-accent"
          data-testid="receipt-po-ledger-po-chip"
        >
          <span className="font-mono">{poNumber}</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-3xs font-semibold uppercase",
              PO_STATUS_BADGE[status] ?? "bg-bg-subtle text-fg-muted",
            )}
          >
            {status}
          </span>
        </span>
        <span className="truncate text-sm font-medium text-fg">
          {supplierName}
        </span>
        {expectedReceiveDate ? (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-3xs font-medium",
              bucket.tier === "now"
                ? "bg-warning-softer text-warning-fg"
                : bucket.tier === "soon"
                  ? "bg-info-softer text-info-fg"
                  : "bg-bg-subtle text-fg-muted",
            )}
            title={`Expected: ${expectedReceiveDate}`}
          >
            expected {bucket.label}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href={`/purchase-orders/${encodeURIComponent(poId)}`}
            className="btn btn-ghost btn-sm transition-colors duration-150"
            data-testid="receipt-po-ledger-view-po"
          >
            {urlLocked ? "← Back to PO" : "View PO →"}
          </Link>
          {!urlLocked && onSwitch ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm transition-colors duration-150"
              onClick={onSwitch}
              data-testid="receipt-po-ledger-switch"
            >
              Switch
            </button>
          ) : null}
        </div>
      </div>

      {/* Row 2: progress bar + summary */}
      <div className="mt-2">
        {isLoading ? (
          <div
            className="h-2 w-full animate-pulse rounded-full bg-bg-subtle"
            aria-busy="true"
          />
        ) : active.length === 0 ? (
          <div className="text-xs text-fg-muted">
            No receivable lines on this PO.
          </div>
        ) : (
          <>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-bg-subtle"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={qtyPct}
              aria-label={`${qtyPct}% received by quantity`}
            >
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  qtyPct >= 100 ? "bg-success-fg" : "bg-accent",
                )}
                style={{ width: `${qtyPct}%` }}
              />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-3xs text-fg-muted">
              <span data-testid="receipt-po-ledger-lines-progress">
                <span className="font-semibold text-fg">
                  {closed}/{active.length}
                </span>{" "}
                line{active.length !== 1 ? "s" : ""} fully received
              </span>
              <span data-testid="receipt-po-ledger-qty-progress">
                <span className="font-semibold text-fg">{qtyPct}%</span>{" "}
                by qty
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
