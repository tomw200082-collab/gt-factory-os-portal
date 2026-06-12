// ---------------------------------------------------------------------------
// Week rollups (Tranche 061) — the numbers behind The Week panel.
//
// Tom's three questions, answered from data the dashboard already fetches:
//   1. How much money goes out THIS WEEK on RM+PKG procurement (per the
//      planning-driven purchase session)?  → toOrderIls (proposed+approved)
//   2. What was decided but never recorded as a purchase order?
//      → approvedNotPlaced (status "approved": supplier order agreed, no PO)
//   3. What ordered goods are still waiting to arrive? → the page's poStats
//      (open POs) — rendered beside these in the same panel.
//
// ILS guard (DASH-T4 discipline): sums include ILS rows only; foreign-
// currency rows are counted and surfaced, never silently mixed into a
// ₪-labelled figure.
// ---------------------------------------------------------------------------

export interface WeekSessionPoLite {
  status: string;
  currency: string;
  total_cost: number;
}

export interface WeekProcurement {
  /** ₪ still to be spent: proposed + approved (not yet placed). */
  toOrderIls: number;
  toOrderCount: number;
  /** Decided with the supplier but not recorded as a PO yet. */
  approvedNotPlacedIls: number;
  approvedNotPlacedCount: number;
  /** Already placed this session (PO records exist). */
  placedIls: number;
  placedCount: number;
  /** Non-ILS rows excluded from the sums above. */
  foreignCount: number;
}

function isIls(currency: string | null | undefined): boolean {
  return !currency || currency === "ILS";
}

export function weekProcurement(pos: WeekSessionPoLite[]): WeekProcurement {
  const out: WeekProcurement = {
    toOrderIls: 0,
    toOrderCount: 0,
    approvedNotPlacedIls: 0,
    approvedNotPlacedCount: 0,
    placedIls: 0,
    placedCount: 0,
    foreignCount: 0,
  };
  for (const po of pos) {
    const open = po.status === "proposed" || po.status === "approved";
    const placed = po.status === "placed";
    if (!open && !placed) continue; // skipped / unknown — not money in motion
    if (!isIls(po.currency)) {
      out.foreignCount += 1;
      continue;
    }
    if (open) {
      out.toOrderCount += 1;
      out.toOrderIls += po.total_cost;
      if (po.status === "approved") {
        out.approvedNotPlacedCount += 1;
        out.approvedNotPlacedIls += po.total_cost;
      }
    } else {
      out.placedCount += 1;
      out.placedIls += po.total_cost;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Week production progress — run counts, never mixed-UOM quantity sums.
// ---------------------------------------------------------------------------

export interface WeekPlanRowLite {
  status?: string | null;
  planned_qty: number;
  completed_qty: number;
}

export interface WeekProduction {
  totalRuns: number;
  doneRuns: number;
}

export function weekProduction(rows: WeekPlanRowLite[]): WeekProduction {
  const live = rows.filter((r) => r.status !== "CANCELLED");
  const done = live.filter((r) => r.planned_qty > 0 && r.completed_qty >= r.planned_qty);
  return { totalRuns: live.length, doneRuns: done.length };
}
