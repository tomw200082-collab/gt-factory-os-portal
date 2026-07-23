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

// Short weekday name for a YYYY-MM-DD ISO date. Returns "" if invalid.
// Used in card pills to ground "in 3 days" with the actual day-of-week.
export function weekdayShort(isoDate: string | null): string {
  if (!isoDate) return "";
  try {
    const d = new Date(`${isoDate}T00:00:00Z`);
    return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  } catch {
    return "";
  }
}

// Human label for the expected_receive_date bucket.
export function expectedBucketLabel(isoDate: string | null): {
  // Short form for chips ("today", "in 3d").
  label: string;
  // Long form for callouts ("today · Mon", "in 3d · Thu").
  // Always >= label in width; consumers pick which fits.
  longLabel: string;
  // Visual urgency tier: "now" = today or overdue, "soon" = this week, "later" = beyond, "unknown" = no date.
  tier: "now" | "soon" | "later" | "unknown";
  // Overdue is a sub-tier of "now" — call it out explicitly so callers
  // can paint it distinctly from same-day arrivals.
  overdue: boolean;
} {
  const d = daysFromToday(isoDate);
  const wd = weekdayShort(isoDate);
  const withDay = (s: string) => (wd ? `${s} · ${wd}` : s);
  if (d === null)
    return {
      label: "no date set",
      longLabel: "no date set",
      tier: "unknown",
      overdue: false,
    };
  if (d < 0) {
    const s = `overdue · ${-d}d`;
    return { label: s, longLabel: withDay(s), tier: "now", overdue: true };
  }
  if (d === 0) {
    return {
      label: "today",
      longLabel: withDay("today"),
      tier: "now",
      overdue: false,
    };
  }
  if (d === 1) {
    return {
      label: "tomorrow",
      longLabel: withDay("tomorrow"),
      tier: "soon",
      overdue: false,
    };
  }
  if (d <= 7) {
    const s = `in ${d}d`;
    return { label: s, longLabel: withDay(s), tier: "soon", overdue: false };
  }
  const s = `in ${d}d`;
  return { label: s, longLabel: withDay(s), tier: "later", overdue: false };
}

// ---------------------------------------------------------------------------
// Tranche 137 — short-receipt summary builder.
//
// Symmetric counterpart to the over-receipt check that already lived inline
// in page.tsx (quantity > open_qty). A "short" line is matched to a PO line
// and posts less than the remaining open_qty — an expected, allowed outcome
// (the PO line stays OPEN/PARTIAL for the rest), not an exception. Extracted
// as a pure function (mirrors expectedBucketLabel above) so the pre-submit
// summary and the success-panel delta can share one tested calculation.
// ---------------------------------------------------------------------------
export interface ShortReceiptLineInput {
  po_line_id: string;
  quantity: string;
  unit: string;
  label: string;
}

export interface ShortReceiptLine {
  idx: number;
  label: string;
  unit: string;
  shortBy: number;
}

export function computeShortReceiptLines(
  lines: ShortReceiptLineInput[],
  poLines: PoLineOption[],
): ShortReceiptLine[] {
  const out: ShortReceiptLine[] = [];
  lines.forEach((l, idx) => {
    if (!l.po_line_id) return;
    const pl = poLines.find((p) => p.po_line_id === l.po_line_id);
    if (!pl) return;
    const q = Number(l.quantity) || 0;
    const open = Number(pl.open_qty) || 0;
    if (q > 0 && q < open) {
      out.push({
        idx,
        label: l.label || pl.component_name || pl.item_name || `Line ${pl.line_number}`,
        unit: l.unit,
        shortBy: open - q,
      });
    }
  });
  return out;
}
