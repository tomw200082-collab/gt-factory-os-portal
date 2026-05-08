// ---------------------------------------------------------------------------
// English label maps for blocker rows.
//
// Backend never returns user-facing copy. W2 maps stable English keys →
// English operator-facing labels here.
//
// Hebrew labels were superseded 2026-05-08 by Tom written approval in the
// FLOW-003 decision packet (Section Q). The Tom-lock from 2026-04-27 on
// Hebrew strings is no longer in effect; all blocker UI is English/LTR per
// the planning UX full-pass handoff (DEC-1).
//
// If the W1 schema gains a new BlockerLabelKey or FixActionLabelKey value,
// these maps would silently fall through to the raw key — that is by design;
// see the runtime exhaustiveness check below.
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

// blocker_label (English key → English operational label)
export const BLOCKER_LABEL: Record<BlockerLabelKey, string> = {
  MISSING_SUPPLIER_MAPPING: "No supplier mapped to this item",
  MISSING_BOM: "No active BOM",
  PO_SUBSTRATE_ABSENT: "Missing substrate PO — not netted",
  BELOW_TRIGGER_THRESHOLD: "Recommendation below trigger threshold",
};

// fix_action_label (English key → English fix-action description)
//
// FLOW-003 (Tom decision 2026-05-08, Option D): the `check_po_substrate`
// label renders as a static informational label, NOT a button or link. The
// planner has no in-app action available; a system fix is required.
export const FIX_ACTION_LABEL: Record<FixActionLabelKey, string> = {
  configure_supplier: "Configure supplier",
  configure_bom: "Configure BOM",
  check_po_substrate: "Pending fix — developer action required",
  review_trigger_threshold: "Review trigger threshold",
};

// category → English (parallel to BLOCKER_LABEL, used for filter chips)
export const BLOCKER_CATEGORY_LABEL: Record<BlockerCategory, string> = {
  missing_supplier_mapping: "No supplier mapped to this item",
  missing_bom: "No active BOM",
  po_substrate_absent_supply_not_netted: "Missing substrate PO — not netted",
  recommendation_below_trigger_threshold: "Recommendation below trigger threshold",
};

// severity (raw DB value → tone string consumed by Badge / cn lookups)
//
// U7: success=resolved, warning=high, danger=critical, muted/info=low/info.
// `fail_hard` (DB-level critical) maps to `danger`; `warning` maps to
// `warning`; `info` maps to `info`.
export type SeverityTone = "danger" | "warning" | "info";
export const SEVERITY_TONE: Record<BlockerSeverity, SeverityTone> = {
  fail_hard: "danger",
  warning: "warning",
  info: "info",
};

// severity (raw DB value → English label for badge text)
export const SEVERITY_LABEL: Record<BlockerSeverity, string> = {
  fail_hard: "Critical",
  warning: "Warning",
  info: "Info",
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
  const labelKeysCovered = new Set(Object.keys(BLOCKER_LABEL));
  for (const k of BLOCKER_LABEL_KEY_VALUES) {
    if (!labelKeysCovered.has(k)) {
      // eslint-disable-next-line no-console
      console.warn(`[planning/blockers] missing English label for blocker_label key '${k}'`);
    }
  }
  const fixKeysCovered = new Set(Object.keys(FIX_ACTION_LABEL));
  for (const k of FIX_ACTION_LABEL_KEY_VALUES) {
    if (!fixKeysCovered.has(k)) {
      // eslint-disable-next-line no-console
      console.warn(`[planning/blockers] missing English label for fix_action_label key '${k}'`);
    }
  }
  const categoryKeysCovered = new Set(Object.keys(BLOCKER_CATEGORY_LABEL));
  for (const k of BLOCKER_CATEGORY_VALUES) {
    if (!categoryKeysCovered.has(k)) {
      // eslint-disable-next-line no-console
      console.warn(`[planning/blockers] missing English label for category '${k}'`);
    }
  }
}
