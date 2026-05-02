"use client";

// ---------------------------------------------------------------------------
// PlannedItemSection — "Planned production this day" mini-section for the
// per-item detail page. Lists every (plan_date) row for the item over the
// horizon, with the canonical caveat at the top of the section per
// contract §5.2.
//
// Contract authority:
//   docs/integrations/inventory_flow_planned_inflow_overlay_contract.md
//   §5.2 (mini-section requirements + caveat row).
//
// Tom-locked dispatch invariants:
//   - Localization register = English/LTR.
//   - The caveat row text mirrors the Tom-locked footer phrasing (kept in
//     sync intentionally so operator sees the same disambiguator on every
//     surface).
//
// Reads via usePlannedInflow filtered by item_id; relies on the parent to
// pass the date horizon. Renders nothing when no rows for this item.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { fmtDateLong, fmtQty } from "../_lib/format";
import {
  usePlannedInflow,
  type PlannedInflowRow,
} from "../_lib/plannedInflow";
import { usePlannedOverlayEnabled } from "./PlannedOverlayToggle";

interface PlannedItemSectionProps {
  itemId: string;
  /** Inclusive ISO date YYYY-MM-DD. */
  from: string;
  /** Inclusive ISO date YYYY-MM-DD. */
  to: string;
  /** Optional UoM label fallback (when row.sales_uom is null). */
  uomFallback?: string | null;
}

export function PlannedItemSection({
  itemId,
  from,
  to,
  uomFallback,
}: PlannedItemSectionProps) {
  const overlayEnabled = usePlannedOverlayEnabled();
  const query = usePlannedInflow(
    { from, to, item_id: itemId },
    { enabled: overlayEnabled && Boolean(from && to) },
  );

  if (!overlayEnabled) return null;

  if (query.isError) {
    return (
      <section
        className="mt-6 rounded-md border border-info/30 bg-info-softer/60 p-3 text-2xs text-info-fg"
        data-testid="planned-item-section-error"
      >
        Planned production data unavailable — showing posted stock only.
      </section>
    );
  }

  const rowsAll = query.data?.rows ?? [];
  // Only surface rows with planned-remaining quantity (overlay semantics).
  const rows = rowsAll
    .filter((r: PlannedInflowRow) => r.planned_remaining_qty > 0)
    .sort((a, b) => a.plan_date.localeCompare(b.plan_date));

  if (query.isLoading && rows.length === 0) {
    return (
      <section
        className="mt-6 rounded-md border border-border/40 bg-bg-raised p-3 text-2xs text-fg-muted"
        data-testid="planned-item-section-loading"
      >
        Loading planned production…
      </section>
    );
  }

  if (rows.length === 0) {
    // Silent empty per §6.1 — no "0 planned" noise.
    return null;
  }

  return (
    <section
      className="mt-6 rounded-md border border-info/40 bg-info-softer/40"
      data-testid="planned-item-section"
    >
      <header className="border-b border-info/30 bg-info-softer/70 px-4 py-2">
        <div className="text-3xs font-semibold uppercase tracking-sops text-info-fg">
          Planned production this day · not yet posted to stock
        </div>
        {/* Canonical caveat row per §5.2. */}
        <p className="mt-1 text-2xs leading-relaxed text-info-fg/90">
          Planned production is not inventory. Inventory changes only after
          actual production is reported.
        </p>
      </header>
      <ul className="divide-y divide-info/20">
        {rows.map((r) => {
          const uomText = r.sales_uom ?? uomFallback ?? "";
          return (
            <li
              key={`${r.item_id}-${r.plan_date}`}
              className="flex items-center justify-between gap-3 px-4 py-3"
              data-testid="planned-item-section-row"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-fg-strong">
                  {fmtDateLong(r.plan_date)}
                </div>
                <div className="mt-0.5 text-3xs text-fg-muted">
                  {r.plan_count_remaining} pending plan
                  {r.plan_count_remaining === 1 ? "" : "s"}
                  {r.plan_count_completed > 0 ? (
                    <> · {r.plan_count_completed} done</>
                  ) : null}
                  {r.plan_count_cancelled > 0 ? (
                    <> · {r.plan_count_cancelled} cancelled</>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums text-info-fg">
                    +{fmtQty(r.planned_remaining_qty)}
                    {uomText ? ` ${uomText}` : ""}
                  </div>
                  <div className="text-3xs uppercase tracking-sops text-fg-subtle">
                    Planned · not posted
                  </div>
                </div>
                <Link
                  href={`/stock/production-actual?item_id=${encodeURIComponent(r.item_id)}`}
                  // Touch target ≥ 44px tall on mobile per dispatch
                  // validation gate 5 — interactive primary CTA.
                  className="inline-flex min-h-[44px] items-center rounded-sm border border-info/40 bg-bg-raised px-3 py-2 text-2xs font-semibold uppercase tracking-sops text-info-fg hover:bg-info-softer sm:min-h-0 sm:px-2 sm:py-1"
                  data-testid="planned-item-section-open-form"
                >
                  Open production form
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
