// ---------------------------------------------------------------------------
// Shared types for the Goods Receipt UX components.
//
// Tranche 020 (receipt smart-picker + PO ledger).
//
// These mirror the subset of the upstream API shape that the three
// components in this directory need. They are intentionally narrow:
// each component takes pre-shaped data so the parent page owns all
// fetching and state.
// ---------------------------------------------------------------------------

export interface PoOption {
  po_id: string;
  po_number: string;
  supplier_id: string;
  status: string;
  expected_receive_date: string | null;
}

export interface PoLineOption {
  po_line_id: string;
  line_number: number;
  component_id: string | null;
  component_name: string | null;
  item_id: string | null;
  item_name: string | null;
  ordered_qty: string;
  uom: string;
  received_qty: string;
  open_qty: string;
  line_status: string;
}

export interface SupplierOption {
  supplier_id: string;
  supplier_name_official: string;
}

// Track which entry path the operator is on.
//  - "undecided": initial landing — Smart Picker visible, form hidden.
//  - "po":        PO-attached receipt — Ledger Header visible, line
//                 match cards active.
//  - "manual":    free-form receipt — no PO, optional SKU-based PO
//                 suggestion shown after item pick.
export type ReceiptTrack = "undecided" | "po" | "manual";

// Friendly status badge classes per PO status.
export const PO_STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-success-softer text-success-fg",
  PARTIAL: "bg-warning-softer text-warning-fg",
  RECEIVED: "bg-bg-subtle text-fg-muted",
  CANCELLED: "bg-bg-subtle text-fg-muted",
};

// Days from today (UTC-naive ISO date string compare) — used by the
// "expected today / this week" bucket on the landing picker. We compare
// YYYY-MM-DD strings lexicographically to avoid TZ surprises (PO
// expected_receive_date is a DATE, not a TIMESTAMP).
export function daysFromToday(isoDate: string | null): number | null {
  if (!isoDate) return null;
  try {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const a = new Date(`${todayStr}T00:00:00Z`).getTime();
    const b = new Date(`${isoDate}T00:00:00Z`).getTime();
    return Math.round((b - a) / 86_400_000);
  } catch {
    return null;
  }
}

// Human label for the expected_receive_date bucket.
export function expectedBucketLabel(isoDate: string | null): {
  label: string;
  // Visual urgency tier: "now" = today or overdue, "soon" = this week, "later" = beyond, "unknown" = no date.
  tier: "now" | "soon" | "later" | "unknown";
} {
  const d = daysFromToday(isoDate);
  if (d === null) return { label: "no date set", tier: "unknown" };
  if (d < 0) return { label: `overdue · ${-d}d`, tier: "now" };
  if (d === 0) return { label: "today", tier: "now" };
  if (d === 1) return { label: "tomorrow", tier: "soon" };
  if (d <= 7) return { label: `in ${d} days`, tier: "soon" };
  return { label: `in ${d} days`, tier: "later" };
}
