// ---------------------------------------------------------------------------
// Hebrew label maps for blocker rows.
//
// Backend never returns Hebrew. W2 maps stable English keys → Hebrew here.
// If the W1 schema gains a new BlockerLabelKey or FixActionLabelKey value,
// these maps would silently fall through to the raw key — that is by design;
// see assertExhaustiveLabelMaps() below for the build-time exhaustiveness
// check.
// ---------------------------------------------------------------------------

import type {
  BlockerCategory,
  BlockerLabelKey,
  BlockerSeverity,
  FixActionLabelKey,
} from "./types";
import {
  BLOCKER_CATEGORY_VALUES,
  BLOCKER_LABEL_KEY_VALUES,
  FIX_ACTION_LABEL_KEY_VALUES,
} from "./types";

// blocker_label (English key → Hebrew operational label)
// Tom-locked verbatim 2026-04-27.
export const BLOCKER_LABEL_HE: Record<BlockerLabelKey, string> = {
  MISSING_SUPPLIER_MAPPING: "אין ספק מוגדר לפריט",
  MISSING_BOM: "חסר BOM פעיל",
  PO_SUBSTRATE_ABSENT: "לא ניתן לבדוק הזמנות פתוחות",
  BELOW_TRIGGER_THRESHOLD: "המלצה קטנה מסף ההפעלה",
};

// fix_action_label (English key → Hebrew CTA copy)
// Tom-locked verbatim 2026-04-27.
export const FIX_ACTION_LABEL_HE: Record<FixActionLabelKey, string> = {
  configure_supplier: "הגדר ספק",
  configure_bom: "הגדר BOM",
  check_po_substrate: "פנה למפתח",
  review_trigger_threshold: "בדוק סף הפעלה",
};

// category → Hebrew (parallel to BLOCKER_LABEL_HE, used for filter chips)
export const BLOCKER_CATEGORY_HE: Record<BlockerCategory, string> = {
  missing_supplier_mapping: "אין ספק מוגדר לפריט",
  missing_bom: "חסר BOM פעיל",
  po_substrate_absent_supply_not_netted: "לא ניתן לבדוק הזמנות פתוחות",
  recommendation_below_trigger_threshold: "המלצה קטנה מסף ההפעלה",
};

// severity (raw DB value → tone string consumed by Badge / cn lookups)
export type SeverityTone = "danger" | "warning" | "info";
export const SEVERITY_TONE: Record<BlockerSeverity, SeverityTone> = {
  fail_hard: "danger",
  warning: "warning",
  info: "info",
};

// severity (raw DB value → Hebrew label for badge text)
export const SEVERITY_LABEL_HE: Record<BlockerSeverity, string> = {
  fail_hard: "קריטי",
  warning: "אזהרה",
  info: "מידע",
};

// severity sort rank (low rank surfaces first; matches backend sort)
export const SEVERITY_RANK: Record<BlockerSeverity, number> = {
  fail_hard: 0,
  warning: 1,
  info: 2,
};

// ---------------------------------------------------------------------------
// Build-time exhaustiveness checks.
//
// If W1 adds a BlockerLabelKey or FixActionLabelKey value not present in our
// maps, this file would still compile but the new value would render as a raw
// English key in the UI. The TypeScript Record<...> type DOES catch missing
// keys at compile time. This block is a belt-and-braces runtime check only
// run during development.
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV !== "production") {
  const labelKeysCovered = new Set(Object.keys(BLOCKER_LABEL_HE));
  for (const k of BLOCKER_LABEL_KEY_VALUES) {
    if (!labelKeysCovered.has(k)) {
      // eslint-disable-next-line no-console
      console.warn(`[planning/blockers] missing Hebrew label for blocker_label key '${k}'`);
    }
  }
  const fixKeysCovered = new Set(Object.keys(FIX_ACTION_LABEL_HE));
  for (const k of FIX_ACTION_LABEL_KEY_VALUES) {
    if (!fixKeysCovered.has(k)) {
      // eslint-disable-next-line no-console
      console.warn(`[planning/blockers] missing Hebrew label for fix_action_label key '${k}'`);
    }
  }
  const categoryKeysCovered = new Set(Object.keys(BLOCKER_CATEGORY_HE));
  for (const k of BLOCKER_CATEGORY_VALUES) {
    if (!categoryKeysCovered.has(k)) {
      // eslint-disable-next-line no-console
      console.warn(`[planning/blockers] missing Hebrew label for category '${k}'`);
    }
  }
}
