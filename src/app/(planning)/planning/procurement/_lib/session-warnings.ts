// ---------------------------------------------------------------------------
// Session-warning decoding — Tranche 132.
//
// The engine's session warnings carry a machine-readable `lines` payload
// (target component/item ids, PO ids, quantities) that the portal previously
// threw away — it rendered only the English `detail` sentence as a full-width
// banner. This module decodes the payload two ways:
//
//   1. buildInboundIssueMap — target_id → open-PO issues, so the action list
//      can warn INLINE on the exact row being double-bought (e.g. "5 already
//      on order with no delivery date") instead of only globally.
//   2. warningChip — a compact Hebrew chip (label + tooltip) per warning code
//      for the freshness strip, replacing the banner stack.
//
// Pure and defensive: unknown codes/shapes degrade to a generic chip, never
// throw.
// ---------------------------------------------------------------------------

import type { PurchaseSessionWarning } from "../../purchase-session/_lib/types";

export type InboundIssueKind = "no_eta" | "overdue";

export interface InboundIssue {
  kind: InboundIssueKind;
  poId: string | null;
  openQty: number | null;
  daysOverdue: number | null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function warningLines(w: PurchaseSessionWarning): Record<string, unknown>[] {
  const lines = (w as { lines?: unknown }).lines;
  if (!Array.isArray(lines)) return [];
  return lines.filter(
    (l): l is Record<string, unknown> =>
      l != null && typeof l === "object" && !Array.isArray(l),
  );
}

/** target_id (component or item id) → the open-PO issues that make its
 *  recommendation suspect. */
export function buildInboundIssueMap(
  warnings: readonly PurchaseSessionWarning[],
): Map<string, InboundIssue[]> {
  const map = new Map<string, InboundIssue[]>();
  for (const w of warnings) {
    const kind: InboundIssueKind | null =
      w.code === "po_missing_expected_delivery"
        ? "no_eta"
        : w.code === "po_overdue_receipt"
          ? "overdue"
          : null;
    if (!kind) continue;
    for (const line of warningLines(w)) {
      const target = str(line.target_id);
      if (!target) continue;
      const issue: InboundIssue = {
        kind,
        poId: str(line.po_id),
        openQty: num(line.open_qty),
        daysOverdue: num(line.days_overdue),
      };
      const existing = map.get(target);
      if (existing) existing.push(issue);
      else map.set(target, [issue]);
    }
  }
  return map;
}

/** One-line Hebrew label for a row's inbound issues (worst first). */
export function inboundIssueLabel(issues: readonly InboundIssue[]): string {
  const noEta = issues.filter((i) => i.kind === "no_eta");
  if (noEta.length > 0) {
    const qty = noEta[0].openQty;
    return qty != null ? `בדרך ${qty} ללא תאריך` : "בדרך ללא תאריך";
  }
  const overdue = issues.find((i) => i.kind === "overdue");
  if (overdue) {
    return overdue.daysOverdue != null
      ? `אספקה באיחור ${overdue.daysOverdue} ימ׳`
      : "אספקה באיחור";
  }
  return "אספקה פתוחה";
}

/** Fuller tooltip for a row's inbound issues. */
export function inboundIssueTooltip(issues: readonly InboundIssue[]): string {
  return issues
    .map((i) => {
      const po = i.poId ?? "PO";
      if (i.kind === "no_eta") {
        const qty = i.openQty != null ? `${i.openQty} פתוחים` : "כמות פתוחה";
        return `${po}: ${qty} ללא תאריך אספקה — לא נספרו כמלאי נכנס. ודאו תאריך לפני שמזמינים שוב.`;
      }
      const late =
        i.daysOverdue != null ? `${i.daysOverdue} ימים אחרי המועד` : "באיחור";
      const qty = i.openQty != null ? `${i.openQty} פתוחים` : "כמות פתוחה";
      return `${po}: ${qty}, ${late} — התחזית עדיין סופרת אותם כמגיעים היום.`;
    })
    .join("\n");
}

export interface WarningChip {
  code: string;
  label: string;
  tooltip: string;
}

/** Compact Hebrew chip per session warning (for the freshness strip). */
export function warningChip(w: PurchaseSessionWarning): WarningChip {
  const n = warningLines(w).length;
  switch (w.code) {
    case "po_missing_expected_delivery":
      return {
        code: w.code,
        label: `${n || ""} בדרך ללא תאריך`.trim(),
        tooltip:
          "שורות רכש פתוחות בלי תאריך אספקה צפוי לא נספרות כמלאי נכנס — סכנת הזמנה כפולה. השורות הרלוונטיות מסומנות ברשימה.",
      };
    case "po_overdue_receipt":
      return {
        code: w.code,
        label: `${n || ""} אספקות באיחור`.trim(),
        tooltip:
          "הזמנות פתוחות שעברו את מועד האספקה עדיין נספרות כמגיעות היום — כדאי לוודא מול הספק או לעדכן תאריך.",
      };
    case "components_without_supplier":
      return {
        code: w.code,
        label: `${n || ""} ללא ספק`.trim(),
        tooltip:
          "שורות שנדרשות אך לא שובצו לאף ספק — לא מופיעות ברשימה. יש להשלים ספק ראשי בנתוני האב.",
      };
    case "stale_stock_input":
      return {
        code: w.code,
        label: "סטיית אימות מלאי",
        tooltip: w.detail,
      };
    case "no_orders_needed":
      return {
        code: w.code,
        label: "אין צורך בהזמנות",
        tooltip: w.detail,
      };
    default:
      return { code: w.code, label: w.code, tooltip: w.detail };
  }
}
