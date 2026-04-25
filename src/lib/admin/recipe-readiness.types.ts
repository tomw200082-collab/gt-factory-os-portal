// src/lib/admin/recipe-readiness.types.ts
// Public types for the readiness pure-function layer. Consumed by the
// readiness functions, by the Recipe-Health card, and by the line editor.
// No imports of React, no async, no fetch.

export type LinePipColor = "green" | "yellow" | "red";

// Structured categories so callers (e.g. computeTrackHealth) can count
// per-category occurrences without parsing the human reason strings.
export type LineWarningCategory =
  | "missing-supplier"
  | "no-active-price"
  | "stale-price"
  | "strong-stale-price";

export type LineBlockerCategory = "invalid-qty" | "inactive-component";

export interface LinePipState {
  color: LinePipColor;
  reasons: string[]; // human-readable Hebrew. Empty when color is green.
  warningCategories: LineWarningCategory[]; // empty unless yellow
  blockerCategories: LineBlockerCategory[]; // empty unless red
  isHardBlock: boolean; // true ⇔ color === "red"
}

export type TrackHealthColor = "green" | "yellow" | "red";

export interface TrackHealth {
  color: TrackHealthColor;
  hasActiveVersion: boolean;
  lineCount: number;
  warnings: string[]; // per-category summaries, e.g. ["2 חומרים חסרי ספק ראשי", "1 חומר עם מחיר ישן"]
  blockers: string[]; // empty unless color is "red"
}

export type RecipeHealthColor = "green" | "yellow" | "red";

export interface RecipeHealthState {
  color: RecipeHealthColor;
  // Top-line label derived from color; UI uses this verbatim.
  // green:  "מוכן לייצור"
  // yellow: "מוכן לייצור עם אזהרות"
  // red:    "לא ניתן לפרסם"
  label: string;
  warnings: string[];
  blockers: string[];
  // Whether the *Recipe-Health-card-level* state permits publish — i.e.
  // false iff color === "red". Backend hard-blockers (EMPTY_VERSION,
  // PLANNING_RUN_IN_FLIGHT, …) are surfaced separately at publish time
  // by the publish-preview integration; this layer doesn't see them.
  publishPermitted: boolean;
}

// One referenced raw/pack item, used by readiness panel and line pip.
export interface ComponentReadiness {
  component_id: string;
  component_name: string;
  component_status: "ACTIVE" | "INACTIVE";
  primary_supplier_id: string | null;
  primary_supplier_name: string | null;
  active_price_value: string | null;       // null when no active price record
  active_price_updated_at: string | null;  // ISO timestamp; null when no record
}
