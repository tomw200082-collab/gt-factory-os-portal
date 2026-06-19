// ---------------------------------------------------------------------------
// PO cost summary — pure rollup for the PO detail "Lines" tab (Tranche 072).
//
// Price/cost accuracy: gives an at-a-glance read of how much money the PO has
// committed (ordered), how much has actually arrived (received), and how much
// is still outstanding (open) — all derived from line rows already fetched, no
// backend call. Cancelled lines never contribute. When no line carries a price
// the summary reports hasPrices=false so the UI can stay silent rather than
// show a misleading ₪0.00.
// ---------------------------------------------------------------------------

export interface PoLineCostInput {
  ordered_qty: string;
  received_qty: string;
  open_qty: string;
  unit_price_net: string;
  line_total_net: string;
  line_status: string;
}

export interface PoCostSummary {
  /** Σ line_total_net over non-cancelled lines (the committed order value). */
  orderedValue: number;
  /** Σ received_qty × unit_price_net (value actually received). */
  receivedValue: number;
  /** Σ open_qty × unit_price_net (value still outstanding). */
  openValue: number;
  /** received / ordered, 0..1 (0 when ordered value is 0). */
  receivedFraction: number;
  /** True when at least one non-cancelled line carries a positive price. */
  hasPrices: boolean;
}

function num(raw: string | null | undefined): number {
  const n = Number((raw ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

export function summarizePoLineCosts(
  lines: readonly PoLineCostInput[],
): PoCostSummary {
  let orderedValue = 0;
  let receivedValue = 0;
  let openValue = 0;
  let hasPrices = false;

  for (const l of lines) {
    if (l.line_status === "CANCELLED") continue;
    const price = num(l.unit_price_net);
    if (price > 0) hasPrices = true;
    orderedValue += num(l.line_total_net);
    receivedValue += num(l.received_qty) * price;
    openValue += num(l.open_qty) * price;
  }

  const receivedFraction =
    orderedValue > 0 ? Math.min(1, receivedValue / orderedValue) : 0;

  return {
    orderedValue,
    receivedValue,
    openValue,
    receivedFraction,
    hasPrices,
  };
}
