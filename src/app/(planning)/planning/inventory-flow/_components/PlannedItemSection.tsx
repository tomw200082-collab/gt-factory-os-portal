"use client";

// ---------------------------------------------------------------------------
// PlannedItemSection — list of planned-production rows for a single item
// over a date range. Used on the /planning/inventory-flow/[itemId] drilldown
// page to satisfy contract §5.2 ("Planned production this day mini-section")
// and the dispatch's item-level-view requirement.
//
// Empty state: clean "No planned production for this item in this range."
// per dispatch hard rules — English/LTR, no Hebrew.
//
// Each row renders the headline planned_remaining_qty for the (item, date),
// linked to /planning/production-plan?date=<plan_date>&item_id=<item_id>
// per contract §5.2 ("View plan in production-plan board"). Highlight query
// param (GAP-IFPI-5) is unverified — link goes to the plain board with a
// date hint that the production-plan board can choose to honor.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { fmtAgo, fmtDateLong, fmtQty } from "../_lib/format";
import type { PlannedInflowRow } from "../_lib/plannedInflow";

interface PlannedItemSectionProps {
  itemId: string;
  itemName?: string | null;
  rows: PlannedInflowRow[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string | null;
}

export function PlannedItemSection({
  itemId,
  itemName,
  rows,
  isLoading,
  isError,
  errorMessage,
}: PlannedItemSectionProps) {
  // Filter to rows with actual planned-remaining qty so empty days don't
  // surface as zero rows in the list.
  const plannedRows = rows.filter((r) => r.planned_remaining_qty > 0);

  return (
    <section
      aria-labelledby="planned-item-section-heading"
      className="mt-6 rounded-md border border-info/30 bg-info-softer/30 p-4"
    >
      <header className="flex items-center justify-between gap-3 border-b border-info/20 pb-2">
        <div>
          <h2
            id="planned-item-section-heading"
            className="text-sm font-semibold text-info-fg"
          >
            Planned production
          </h2>
          <p className="mt-0.5 text-3xs text-fg-muted">
            Inventory not yet updated — these are scheduled productions. Stock
            changes only when reported via the production-actual form.
          </p>
        </div>
        <Badge tone="info" variant="soft" dotted>
          Planned · not posted
        </Badge>
      </header>

      <div className="mt-3">
        {isLoading ? (
          <LoadingState title="Loading planned production…" />
        ) : isError ? (
          <ErrorState
            title="Could not load planned production"
            description={errorMessage ?? "Try refreshing in a moment."}
          />
        ) : plannedRows.length === 0 ? (
          <EmptyState
            title="No planned production"
            description="No planned production for this item in this range."
          />
        ) : (
          <ul className="divide-y divide-info/15 rounded-sm border border-info/20 bg-bg-raised">
            {plannedRows.map((r) => (
              <li
                key={`${r.item_id}-${r.plan_date}`}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg-strong">
                    {fmtDateLong(r.plan_date)}
                  </div>
                  <div className="mt-0.5 text-3xs text-fg-muted">
                    {r.plan_count_remaining} plan
                    {r.plan_count_remaining === 1 ? "" : "s"}
                    {r.completed_qty_total > 0 ? (
                      <>
                        {" · "}
                        {fmtQty(r.completed_qty_total)} already reported
                      </>
                    ) : null}
                    {" · "}latest added {fmtAgo(r.latest_created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-info-fg">
                      {fmtQty(r.planned_remaining_qty)}
                    </div>
                    <div className="text-3xs uppercase tracking-sops text-fg-subtle">
                      {r.sales_uom ?? "units"}
                    </div>
                  </div>
                  <Link
                    href={`/planning/production-plan?date=${encodeURIComponent(r.plan_date)}&item_id=${encodeURIComponent(r.item_id)}`}
                    className="inline-flex items-center gap-0.5 text-3xs font-semibold uppercase tracking-sops text-accent hover:underline"
                    title={
                      itemName
                        ? `Open production-plan board for ${itemName}`
                        : "Open production-plan board"
                    }
                    data-testid="planned-item-section-open-plan"
                  >
                    Open plan
                    <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Item-id is rendered visually only as a fallback when itemName is missing,
          per Tom's "names not IDs in UI" rule. */}
      {!itemName ? (
        <p className="mt-2 text-3xs text-fg-faint">
          Item: <span className="font-mono">{itemId}</span>
        </p>
      ) : null}
    </section>
  );
}
