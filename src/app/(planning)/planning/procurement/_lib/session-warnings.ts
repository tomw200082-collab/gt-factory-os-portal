// ---------------------------------------------------------------------------
// Session-warning decoding — Tranche 132, extended Tranche 133.
//
// The engine's session warnings carry a machine-readable `lines` payload
// (target component/item ids, PO ids, quantities) that the portal previously
// threw away — it rendered only the English `detail` sentence as a full-width
// banner. This module decodes the payload three ways:
//
//   1. buildInboundIssueMap — target_id → open-PO issues, so the action list
//      can warn INLINE on the exact row being double-bought (e.g. "5 already
//      on order with no delivery date") instead of only globally.
//   2. warningChip — a compact Hebrew chip (label + tooltip + fix href) per
//      warning code for the freshness strip, replacing the banner stack.
//   3. (133) Every actionable chip now resolves a concrete `href` the
//      planner can click straight to the fix — not just a tooltip
//      explaining the problem. po_* codes → the PO detail page;
//      components_without_supplier → the affected master-data record
//      (component vs item, from 0286's is_item field — undefined on
//      pre-0286 sessions degrades to no link, never a guessed route).
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

/** /purchase-orders/[po_id] — the PO detail page where a planner sets the
 *  expected receive date, chases the supplier, or closes/cancels a line. */
export function poFixHref(poId: string | null): string | null {
  return poId ? `/purchase-orders/${poId}` : null;
}

/** The exact affected master-data record for a components_without_supplier
 *  line — components and bought-finished items live at different admin
 *  routes, so this needs 0286's is_item field. Returns null (no link,
 *  never a guess) when is_item is absent — pre-0286 sessions. */
export function unassignedFixHref(target: {
  targetId: string;
  isItem: boolean | null;
}): string | null {
  if (target.isItem == null) return null;
  return target.isItem
    ? `/admin/masters/items/${target.targetId}`
    : `/admin/masters/components/${target.targetId}`;
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

/** Fix-link target for a row's inbound issues — same worst-first priority
 *  as inboundIssueLabel, so the visible label and the link always agree. */
export function inboundIssuePrimaryHref(
  issues: readonly InboundIssue[],
): string | null {
  const noEta = issues.find((i) => i.kind === "no_eta");
  if (noEta) return poFixHref(noEta.poId);
  const overdue = issues.find((i) => i.kind === "overdue");
  if (overdue) return poFixHref(overdue.poId);
  return null;
}

/** Fuller tooltip for a row's inbound issues. */
export function inboundIssueTooltip(issues: readonly InboundIssue[]): string {
  return issues
    .map((i) => {
      const po = i.poId ?? "הזמנה";
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

export interface UnassignedTarget {
  targetId: string;
  isItem: boolean | null;
  label: string | null;
  qtyPurchase: number | null;
  uom: string | null;
  needDate: string | null;
}

/** components_without_supplier lines, in need-date order (matches the
 *  engine's own ordering). isItem is null on pre-0286 sessions. */
export function parseUnassignedTargets(
  w: PurchaseSessionWarning,
): UnassignedTarget[] {
  return warningLines(w)
    .map((l) => {
      const targetId = str(l.target_id);
      if (!targetId) return null;
      const isItem = typeof l.is_item === "boolean" ? l.is_item : null;
      return {
        targetId,
        isItem,
        label: str(l.label),
        qtyPurchase: num(l.qty_purchase),
        uom: str(l.uom),
        needDate: str(l.need_date),
      };
    })
    .filter((t): t is UnassignedTarget => t != null);
}

export interface WarningChip {
  code: string;
  label: string;
  tooltip: string;
  /** Where clicking the chip should take the planner to fix it. Null when
   *  there is nothing to navigate to (informational codes) or the payload
   *  doesn't carry enough to resolve a safe target (pre-migration sessions,
   *  a missing po_id/is_item) — never a guessed route. */
  href: string | null;
}

/** Compact Hebrew chip per session warning (for the freshness strip). Every
 *  actionable code resolves a concrete fix href (133) — the chip IS the fix
 *  link, same click-to-fix interaction as the row-level recount chip. */
export function warningChip(w: PurchaseSessionWarning): WarningChip {
  const n = warningLines(w).length;
  switch (w.code) {
    case "po_missing_expected_delivery": {
      const first = warningLines(w)[0];
      return {
        code: w.code,
        label: `${n || ""} בדרך ללא תאריך`.trim(),
        tooltip:
          "שורות רכש פתוחות בלי תאריך אספקה צפוי לא נספרות כמלאי נכנס — סכנת הזמנה כפולה. לחיצה פותחת את ההזמנה הראשונה שמושפעת; שאר השורות מסומנות ברשימה למטה.",
        href: poFixHref(first ? str(first.po_id) : null),
      };
    }
    case "po_overdue_receipt": {
      const first = warningLines(w)[0];
      return {
        code: w.code,
        label: `${n || ""} אספקות באיחור`.trim(),
        tooltip:
          "הזמנות פתוחות שעברו את מועד האספקה עדיין נספרות כמגיעות היום — כדאי לוודא מול הספק או לעדכן תאריך. לחיצה פותחת את ההזמנה הראשונה שבאיחור.",
        href: poFixHref(first ? str(first.po_id) : null),
      };
    }
    case "components_without_supplier": {
      const targets = parseUnassignedTargets(w);
      const first = targets[0] ?? null;
      const names = targets
        .slice(0, 3)
        .map((t) => t.label ?? t.targetId)
        .join(", ");
      return {
        code: w.code,
        label: `${n || ""} ללא ספק`.trim(),
        tooltip:
          `שורות שנדרשות אך לא שובצו לאף ספק — לא מופיעות ברשימה: ${names}${targets.length > 3 ? "…" : ""}. יש להשלים ספק ראשי בהגדרות הפריט.` +
          (first && first.isItem == null
            ? " (מושב ישן — פתחו מהגדרות הפריטים)"
            : ""),
        href: first ? unassignedFixHref(first) : null,
      };
    }
    case "stale_stock_input":
      return {
        code: w.code,
        // ux-release-gate COPY-008: distinct from the always-present drift
        // chip's "סטיית מלאי" — two near-identical orange chips otherwise.
        label: "קלט מלאי ישן",
        tooltip:
          (w.detail ||
            "קלט המלאי לסשן זה ישן — כמויות עלולות להיות לא מדויקות.") +
          " לחצו על 'רענון המלצות' כדי להריץ מושב עדכני.",
        // No href — the fix is the refresh action (IntegrityStrip's
        // onRefresh), not a navigation target.
        href: null,
      };
    case "no_orders_needed":
      return {
        code: w.code,
        label: "אין צורך בהזמנות",
        tooltip: w.detail,
        href: null,
      };
    default:
      // ux-release-gate COPY-003: never surface the raw backend code as a
      // user-facing label (the repo's established rule — see FLOW-016 in
      // purchase-session/_lib/api.ts's jsonOrThrow). Only reachable for a
      // warning code this switch hasn't been taught yet.
      return {
        code: w.code,
        label: "התראת מערכת",
        tooltip: w.detail || "פנו לתמיכה לפרטים.",
        href: null,
      };
  }
}
