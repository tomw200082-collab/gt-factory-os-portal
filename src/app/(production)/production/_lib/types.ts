// ---------------------------------------------------------------------------
// Production-runs contract — inlined TS interfaces.
//
// Mirror of api/src/production-runs/schemas.ts. Inlined per repo convention
// (the portal never imports from the backend tree; drift is a bug). Keep
// byte-aligned with upstream. Endpoints are proxied 1:1 by the route.ts files
// under src/app/api/production-runs/**.
//
// Forward-compat display fields (`floor_name`, `name_he`) are typed OPTIONAL:
// the tranche-142 floor-name / Hebrew-label backfill has not landed, so the
// backend does not send them yet. The UI reads `floor_name ?? item_name` and
// only renders the Hebrew secondary line when `name_he` is present, degrading
// cleanly to `item_name` alone today.
// ---------------------------------------------------------------------------

export type ProductionStage = "TANK" | "PACK" | "SINGLE";

export type ProductionRunStatus =
  | "PLANNED"
  | "PICKING"
  | "IN_PRODUCTION"
  | "REPORTED"
  | "CANCELLED";

export type PickSource = "base" | "pack";
export type PickItemType = "RM" | "PKG";

/** GET /api/production-runs/today?date= → one of `rows`. */
export interface ProductionRunTodayRow {
  run_id: string;
  plan_id: string | null;
  stage: ProductionStage;
  item_id: string;
  item_name: string;
  base_bom_head_id: string | null;
  target_qty: string; // NUMERIC as text — preserve precision
  uom: string;
  status: ProductionRunStatus;
  unplanned: boolean;
  order_index: number;
  // Forward-compat (tranche 142): the operator-facing floor name + Hebrew
  // secondary. Absent today; UI degrades to item_name.
  floor_name?: string | null;
  name_he?: string | null;
}

export interface ProductionRunsTodayResponse {
  date: string;
  count: number;
  rows: ProductionRunTodayRow[];
}

/** GET /api/production-runs/[run_id]/pick-list → one of `lines`. */
export interface PickListLine {
  component_id: string;
  component_name: string;
  // Tranche 143 (migration 0296): optional Latin-script display name for the
  // production floor (operator is a weak Hebrew/English reader). NULL = fall
  // back to component_name. Sent by the backend as of tranche 143.
  floor_name?: string | null;
  source: PickSource;
  item_type: PickItemType;
  required_qty: string; // NUMERIC as text
  uom: string;
  on_hand: string; // NUMERIC as text
  // Forward-compat: Hebrew secondary label for the material. Not sent by the
  // backend today (component_name already carries the Hebrew value); kept
  // optional in case a distinct name_he ever lands.
  name_he?: string | null;
}

export interface PickListResponse {
  run_id: string;
  plan_id: string | null;
  stage: ProductionStage;
  item_id: string;
  item_name: string;
  target_qty: string;
  uom: string;
  status: ProductionRunStatus;
  pack_bom_version_id: string | null;
  base_bom_version_id: string | null;
  lines: PickListLine[];
  // Forward-compat (tranche 142): floor name + Hebrew secondary for the item.
  floor_name?: string | null;
  name_he?: string | null;
}

export type PickState = "PICKED" | "EDITED" | "NOT_COLLECTED";

export interface PickConfirmPick {
  component_id: string;
  source: PickSource;
  picked_qty: number;
  state: PickState;
}

export interface PickConfirmBody {
  idempotency_key: string;
  event_at: string;
  pack_bom_version_id?: string | null;
  base_bom_version_id?: string | null;
  picks: PickConfirmPick[];
}

export interface PickConfirmSignal {
  component_id: string;
  kind: "shortage" | "excess";
  [k: string]: unknown;
}

export interface PickConfirmResponse {
  run_id: string;
  submission_id: string;
  status: "posted";
  run_status: ProductionRunStatus;
  linked_plan_id: string | null;
  consumed: unknown[];
  shortfalls: unknown[];
  signals: PickConfirmSignal[];
  idempotent_replay: boolean;
}

/** 409 body shape shared by pick-confirm + material-delta. */
export interface PickConflict {
  reason_code: string;
  detail?: string;
  offending_field?: string;
}

export interface MaterialDeltaBody {
  idempotency_key: string;
  event_at: string;
  component_id: string;
  source: PickSource;
  direction: "consume" | "return";
  qty: number;
  notes?: string | null;
}

export interface CreateUnplannedRunBody {
  item_id: string;
  target_qty: number;
  uom: string;
  stage?: ProductionStage;
  notes?: string | null;
}

export interface CreateUnplannedRunResponse {
  run_id: string;
  stage: ProductionStage;
  item_id: string;
  target_qty: string;
  uom: string;
  status: ProductionRunStatus;
  unplanned: true;
}

/** Minimal item row for the unplanned-run picker (GET /api/items). */
export interface PickerItemRow {
  item_id: string;
  item_name: string;
  sku: string | null;
  status: string;
  supply_method: string;
  sales_uom: string | null;
}
