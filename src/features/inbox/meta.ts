// ---------------------------------------------------------------------------
// Inbox row metadata — category-aware projections used by the row UI.
//
// All maps here are display-only. Behavior (deep links, mutations) still
// lives on the row data itself.
// ---------------------------------------------------------------------------

import type { InboxRow, InboxSeverity } from "./types";

// Friendly Hebrew label for the category — what we show in the chip when we
// have a translation, instead of the raw snake_case category id. Falls back
// to the raw category if not mapped.
export const CATEGORY_FRIENDLY: Record<string, string> = {
  // LionWheel
  lionwheel_credit_needed: "זיכוי ל-LionWheel",
  lionwheel_unknown_sku: "SKU לא ממופה",
  lionwheel_stale: "LionWheel — סנכרון תקוע",
  lionwheel_auth_expired: "LionWheel — אימות פג",
  lionwheel_auth_failure: "LionWheel — כשל אימות",
  lionwheel_rate_limit_stuck: "LionWheel — rate-limit",
  lionwheel_schema_drift: "LionWheel — שינוי סכמה",
  lionwheel_capped_window_gap: "LionWheel — חלון מוגבל",
  lionwheel_payload_invalid_sku: "LionWheel — SKU בלתי תקין",
  lionwheel_payload_invalid_picked_quantity: "LionWheel — כמות בלתי תקינה",
  lionwheel_order_note: "LionWheel — הערת הזמנה",
  lw_pick_enrich_failed: "LionWheel — pick enrich נכשל",
  lw_pick_data_missing: "LionWheel — pick data חסר",

  // Shopify
  shopify_unmapped_item: "Shopify — מוצר לא ממופה",
  shopify_variant_not_found: "Shopify — variant חסר",
  shopify_stale: "Shopify — סנכרון תקוע",
  shopify_auth_failure: "Shopify — כשל אימות",
  shopify_rate_limit_stuck: "Shopify — rate-limit",
  shopify_api_version_drift: "Shopify — גרסת API",
  shopify_drift: "Shopify — drift מלאי",
  shopify_network_failure: "Shopify — תקלת רשת",

  // Green Invoice
  gi_unmapped_supplier: "GI — ספק לא ממופה",
  gi_expense_review: "GI — בדיקת חשבונית",
  gi_stale: "GI — סנכרון תקוע",
  gi_api_failure: "GI — תקלת API",
  gi_auth_failure: "GI — כשל אימות",
  gi_rate_limit_stuck: "GI — rate-limit",
  gi_mirror_insert_failed: "GI — mirror insert",
  gi_price_activation_failed: "GI — הפעלת מחיר נכשלה",
  gi_non_ils_currency: "GI — מטבע לא-ILS",
  gi_draft_created: "GI — טיוטה נוצרה",

  // Operational
  count_large_variance: "ספירה — סטייה גדולה",
  positive_adjustment: "התאמה חיובית",
  loss_above_threshold: "פחת מעל סף",
  inventory_movement_pending: "Stock movement — pending",
  po_line_over_receipt: "PO — קבלה עודפת",
  forecast_stale: "תחזית — מיושנת",
  rebuild_stale: "Rebuild — תקוע",
  export_stale: "Export — תקוע",
  supplier_price_anomaly: "מחיר ספק — חריג",
  alias_revoked_with_dependencies: "Alias בוטל עם תלויות",
  bom_version_published: "BOM — גרסה פורסמה",
};

// Decision categories — the ones where the action verb is "אשר/דחה" and the
// row carries real consequence. Used for visual emphasis (border weight,
// pin), not for routing.
export const DECISION_CATEGORIES = new Set([
  "lionwheel_credit_needed",
  "count_large_variance",
  "positive_adjustment",
  "loss_above_threshold",
  "inventory_movement_pending",
  "po_line_over_receipt",
  "shopify_variant_not_found",
]);

// To-Do categories — work that needs to happen but isn't a yes/no decision.
export const TODO_CATEGORIES = new Set([
  "shopify_unmapped_item",
  "lionwheel_unknown_sku",
  "gi_unmapped_supplier",
  "gi_expense_review",
]);

// Warning categories — system-health & connectivity. Acknowledge-only most
// of the time.
export const WARNING_CATEGORIES = new Set([
  "gi_stale",
  "lionwheel_stale",
  "shopify_stale",
  "forecast_stale",
  "rebuild_stale",
  "export_stale",
  "supplier_price_anomaly",
  "gi_price_activation_failed",
  "gi_api_failure",
  "gi_auth_failure",
  "gi_rate_limit_stuck",
  "gi_mirror_insert_failed",
  "lionwheel_auth_expired",
  "lionwheel_auth_failure",
  "lionwheel_rate_limit_stuck",
  "lionwheel_schema_drift",
  "lw_pick_enrich_failed",
  "shopify_auth_failure",
  "shopify_rate_limit_stuck",
  "shopify_api_version_drift",
  "shopify_drift",
  "shopify_network_failure",
  "alias_revoked_with_dependencies",
]);

// Categories Tom flagged as "high attention" — these get a star/pin glyph
// and float above same-severity peers when sort is severity_then_age.
export const PINNED_CATEGORIES = new Set([
  "lionwheel_credit_needed",
  "supplier_price_anomaly",
  "po_line_over_receipt",
]);

export type RowFamily = "decision" | "todo" | "warning" | "info" | "approval";

export function rowFamily(row: InboxRow): RowFamily {
  if (row.type.startsWith("approval:")) return "approval";
  if (DECISION_CATEGORIES.has(row.category)) return "decision";
  if (TODO_CATEGORIES.has(row.category)) return "todo";
  if (WARNING_CATEGORIES.has(row.category)) return "warning";
  return "info";
}

// ---------------------------------------------------------------------------
// Inbox lane — the top-level split that drives the default "all" view.
//
//   actionable    — decisions, to-dos, and approvals. The operator can and
//                   should act on these; they fill the working inbox.
//   system_health — integration / sync / auth warnings. Usually self-recovers
//                   or is an admin/IT concern, not an operator decision.
//   diagnostics   — informational and audit-only records. Nothing to resolve.
//
// system_health + diagnostics are folded into the collapsed
// "System & diagnostics" section so the working inbox carries only
// operator-actionable rows. An unknown / new category falls through
// rowFamily() to "info" → diagnostics, i.e. it stays out of the working
// inbox until it is explicitly classified as a decision or to-do — the
// noise-free default Tom asked for.
// ---------------------------------------------------------------------------
export type InboxLane = "actionable" | "system_health" | "diagnostics";

export function rowLane(row: InboxRow): InboxLane {
  const family = rowFamily(row);
  if (family === "warning") return "system_health";
  if (family === "info") return "diagnostics";
  return "actionable";
}

export function categoryFriendly(category: string): string {
  return CATEGORY_FRIENDLY[category] ?? category;
}

export function searchBag(row: InboxRow): string {
  return [
    row.summary,
    row.category,
    categoryFriendly(row.category),
    row.item_id ?? "",
    row.component_id ?? "",
    row.type,
  ]
    .join(" ")
    .toLowerCase();
}

// Tone classes for severity, used in multiple places.
export const SEV_RING: Record<InboxSeverity, string> = {
  critical: "ring-danger/40",
  warning: "ring-warning/40",
  info: "ring-info/40",
};

export const SEV_DOT: Record<InboxSeverity, string> = {
  critical: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
};

export const SEV_TEXT: Record<InboxSeverity, string> = {
  critical: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

// Severity weight ladder — stroke widths, padding, shadow intensity.
export function severityIconStroke(sev: InboxSeverity): number {
  if (sev === "critical") return 2.5;
  if (sev === "warning") return 2.25;
  return 2;
}
