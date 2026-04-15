// ---------------------------------------------------------------------------
// Canonical DTO contracts — reconciled against the locked SQL schema.
//
// Source of truth for every master-data DTO in this file:
//
//   C:/Users/tomw2/Projects/gt-factory-os/db/migrations/0001_domains_and_schemas.sql
//   C:/Users/tomw2/Projects/gt-factory-os/db/migrations/0002_masters.sql
//   C:/Users/tomw2/Projects/gt-factory-os/db/migrations/0003_bom_three_table.sql
//
// When the database schema changes, update this file in the same PR.
// Drift is a bug.
//
// Phase A reconciliation: 2026-04-15. Master-data DTOs in this file were
// rewritten to match the locked schema. Operator form drafts, submissions,
// forecasts, recommendations, exceptions, approvals, dashboards, and jobs
// are portal-side concerns and remain unchanged (they will be touched only
// when their respective backend contracts land in later tranches).
// ---------------------------------------------------------------------------

import type {
  AdjustmentDirection,
  AdjustmentReason,
  ApprovalKind,
  BomHeadStatus,
  BomKind,
  BomVersionStatus,
  ComponentRefType,
  ComponentStatus,
  ExceptionSeverity,
  ItemStatus,
  Role,
  SubmissionState,
  SupplierStatus,
  SupplyMethod,
  Uom,
  Urgency,
} from "./enums";

// ---------------------------------------------------------------------------
// AuditMeta — unchanged envelope used by all master-data DTOs.
// ---------------------------------------------------------------------------
export interface AuditMeta {
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
  version: number;
  active: boolean;
}

// ===========================================================================
// Master-data DTOs — reconciled to the locked SQL schema
// ===========================================================================

// ---------------------------------------------------------------------------
// ItemDto — from 0002_masters.sql items CREATE TABLE.
//
// Text PK (item_id) per locked decision 57 hybrid strategy. Two BOM head
// references (primary_bom_head_id and base_bom_head_id) per the locked
// architecture — a single item can point at both a primary (pack) BOM and
// a base-mix BOM. The single active_bom_id field from the previous draft
// did not accommodate this and has been removed.
//
// The previous draft had a `kind: ItemKind` field that conflated item,
// component, packaging and raw_material into a single axis. The locked
// schema has items and components as separate tables; item "kind" is
// expressed through supply_method and product_group, not through a
// unified ItemKind enum.
// ---------------------------------------------------------------------------
export interface ItemDto {
  item_id: string;
  item_name: string;
  family: string | null;
  pack_size: string | null;
  sales_uom: Uom | null;
  sweetness: string | null;

  supply_method: SupplyMethod;
  item_type: string | null;
  status: ItemStatus;

  barcode: string | null;
  legacy_sku: string | null;
  shelf_life_days: number | null;
  storage: string | null;
  case_pack: number | null;

  // Two BOM head references. BOUGHT_FINISHED items have both null.
  // MANUFACTURED items typically set primary_bom_head_id (and optionally
  // base_bom_head_id for the two-stage base+pack model). REPACK items
  // set primary_bom_head_id to their repack head.
  primary_bom_head_id: string | null;
  base_bom_head_id: string | null;
  base_fill_qty_per_unit: number | null;

  sub_type: string | null;
  product_group: string | null;
  notes: string | null;

  site_id: string;
  audit: AuditMeta;
}

// ---------------------------------------------------------------------------
// ComponentDto — from 0002_masters.sql components CREATE TABLE.
//
// Raw materials and packaging components. The previous draft had a local
// literal type `"component" | "raw_material" | "packaging"` that did not
// exist in the locked schema. The schema treats all three as components;
// subclassing is via component_class and component_group metadata, not via
// a typed discriminator.
// ---------------------------------------------------------------------------
export interface ComponentDto {
  component_id: string;
  component_name: string;
  component_class: string | null;
  component_group: string | null;
  status: ComponentStatus;

  inventory_uom: Uom | null;
  purchase_uom: Uom | null;
  bom_uom: Uom | null;
  purchase_to_inv_factor: number;

  planning_policy_code: string | null;
  primary_supplier_id: string | null;

  lead_time_days: number | null;
  moq_purchase_uom: number | null;
  order_multiple_purchase_uom: number | null;

  std_cost_per_purchase_uom: number | null;
  std_cost_per_inv_uom: number | null;

  criticality: string | null;
  planned_flag: boolean;
  notes: string | null;

  site_id: string;
  audit: AuditMeta;
}

// ---------------------------------------------------------------------------
// SupplierDto — from 0002_masters.sql suppliers CREATE TABLE.
//
// Text PK (supplier_id) per locked decision 57. Official name is required;
// short name is optional. Hebrew is permitted in data fields (names,
// contacts, payment terms, addresses) per locked decision 6.
// ---------------------------------------------------------------------------
export interface SupplierDto {
  supplier_id: string;
  supplier_name_official: string;
  supplier_name_short: string | null;
  status: SupplierStatus;
  supplier_type: string | null;

  primary_contact_name: string | null;
  primary_contact_phone: string | null;

  currency: string | null;
  payment_terms: string | null;
  default_lead_time_days: number | null;
  default_moq: number | null;

  approval_status: string | null;
  notes: string | null;

  site_id: string;
  audit: AuditMeta;
}

// ---------------------------------------------------------------------------
// SupplierItemDto — polymorphic supplier × (component OR BOUGHT_FINISHED
// item) mapping from 0002_masters.sql supplier_items CREATE TABLE.
//
// Exactly one of component_id / item_id is set per row. The XOR invariant
// is enforced at the DB by:
//   - CHECK (num_nonnulls(component_id, item_id) = 1)
//   - trg_supplier_items_validate_item_target (rejects item_id targets
//     with supply_method IN ('MANUFACTURED','REPACK'))
// At most one row per target may have is_primary = true (partial unique
// indexes uniq_supplier_items_component_primary /
// uniq_supplier_items_item_primary). Flipping the primary must use the
// atomic demote-then-promote ordering, not a single update.
//
// pack_conversion is authoritative for supplier-specific UOM conversion
// (locked decision 12). components.purchase_to_inv_factor is a default
// only.
//
// Multi-currency pricing columns (native_currency, native_price,
// fx_rate_used, fx_rate_date, normalized_ils_price) are DEFERRED to the
// later 0004_price_history.sql migration and are not on this DTO yet.
// ---------------------------------------------------------------------------
export interface SupplierItemDto {
  supplier_item_id: string;
  supplier_id: string;

  // XOR: exactly one of these is non-null per row.
  component_id: string | null;
  item_id: string | null;

  relationship: string | null;
  is_primary: boolean;

  order_uom: Uom | null;
  inventory_uom: Uom | null;
  pack_conversion: number;

  lead_time_days: number | null;
  moq: number | null;
  payment_terms: string | null;

  safety_days: number;
  approval_status: string | null;
  source_basis: string | null;
  notes: string | null;

  site_id: string;
  audit: AuditMeta;
}

// ---------------------------------------------------------------------------
// PlanningPolicyDto — from 0002_masters.sql planning_policy CREATE TABLE.
//
// Key-value tunables, text-valued. The previous draft had an id field and
// a typed value union; the locked schema is simpler — key is the PK and
// value is a plain text string with optional uom + description metadata.
// Interpretation is per-key, not per-DTO-shape.
// ---------------------------------------------------------------------------
export interface PlanningPolicyDto {
  key: string;
  value: string;
  uom: string | null;
  description: string | null;
  updated_at: string;
}

// ===========================================================================
// BOM model — three-table, from 0003_bom_three_table.sql
// ===========================================================================

// ---------------------------------------------------------------------------
// BomHeadDto — from bom_head CREATE TABLE in 0003.
//
// Text PK (legacy workbook IDs like BOM-BASE-AME-REG preserved). A head
// is a distinct BOM; multiple heads can target the same item via
// items.primary_bom_head_id and items.base_bom_head_id. The previous
// draft had `item_id` here (1:1 item->bom) which was wrong — the
// direction is items -> bom_head, not bom_head -> item, and a single
// item can have two heads.
//
// Versions are NOT embedded in this DTO. They are a separate list fetched
// on demand via a `list_versions` repository call.
// ---------------------------------------------------------------------------
export interface BomHeadDto {
  bom_head_id: string;
  bom_kind: BomKind;
  display_family: string | null;
  sweetness: string | null;
  pack_size: string | null;

  parent_ref_type: string | null;
  parent_ref_id: string | null;
  parent_name: string | null;

  linked_base_bom_head_id: string | null;

  final_bom_output_qty: number;
  final_bom_output_uom: Uom;

  active_version_id: string | null;

  status: BomHeadStatus;
  review_flag: string | null;
  owner_notes: string | null;

  site_id: string;
  audit: AuditMeta;
}

// ---------------------------------------------------------------------------
// BomVersionDto — from bom_version CREATE TABLE in 0003.
//
// UUID PK (hybrid strategy). Lifecycle strictly
// DRAFT -> ACTIVE -> ARCHIVED, enforced at the DB by
// trg_bom_version_status_transition. The previous draft used lowercase
// "draft" | "active" | "retired" — wrong case and wrong terminal value;
// "retired" is not a legal state in the locked schema.
//
// At most one ACTIVE version per head is enforced by the partial unique
// index uniq_bom_version_one_active_per_head. Flipping the active
// version must use demote-then-promote ordering in a single transaction.
//
// version_label (text) replaces the previous draft's version_number
// (int). Workbook import used V1_IMPORT / V4_COST_FILE labels, and the
// locked schema preserves those as-is.
// ---------------------------------------------------------------------------
export interface BomVersionDto {
  bom_version_id: string;
  bom_head_id: string;
  version_label: string;
  status: BomVersionStatus;

  created_by_user_id: string | null;
  created_at: string;
  activated_at: string | null;
  archived_at: string | null;

  content_hash: string | null;
  min_run_l: number | null;
  buffer_pct: number | null;

  source_basis: string | null;
  notes: string | null;

  site_id: string;
}

// ---------------------------------------------------------------------------
// BomLineDto — from bom_lines CREATE TABLE in 0003.
//
// UUID PK. Replaces the previous draft's quantity_per / scrap_factor /
// sort_order triple with the locked schema's shape:
//   - final_component_qty replaces quantity_per
//   - line_no replaces sort_order
//   - qty_per_l_output is a nullable planning-time ratio (computed by the
//     planning engine, not imported); intentionally NOT generated in
//     Phase A because the formula depends on head.final_bom_output_qty
//     and is deferred to Tranche 5
//   - component_ref_type preserves workbook import provenance
//   - bom_kind mirrors the parent head (denormalized for fast filtering)
//
// The previous draft's scrap_factor column has no equivalent in the
// locked schema and is dropped; if factory scrap needs to be modeled
// later it will land through a different mechanism (waste/adjustment
// ledger), not via a column on the BOM line.
// ---------------------------------------------------------------------------
export interface BomLineDto {
  line_id: string;
  bom_version_id: string;
  bom_head_id: string | null;
  line_no: number;

  bom_kind: BomKind;
  component_ref_type: ComponentRefType;

  final_component_id: string | null;
  final_component_name: string | null;
  final_component_qty: number | null;
  component_uom: Uom | null;

  status: "ACTIVE" | "INACTIVE" | "PENDING";
  scaling_method: string;

  qty_per_l_output: number | null;

  std_cost_per_uom: number | null;
  line_std_cost: number | null;

  notes: string | null;

  site_id: string;
}

// ===========================================================================
// Operational / UI DTOs — unchanged by Phase A
// ===========================================================================
// These are portal-side concerns (operator drafts, submissions,
// forecasts, recommendations, exceptions, approvals, dashboards, jobs,
// users) that are not defined by the current Tranche 1 migrations. They
// will be touched in later tranches when their respective backend
// contracts land. Phase A deliberately does not reshape them to avoid
// conflating "align master data with the locked schema" with "design
// future operational DTOs".
// ===========================================================================

export interface UserDto {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  active: boolean;
  last_login_at?: string;
}

export interface GoodsReceiptLineDto {
  id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit: Uom;
  po_line_id?: string;
  notes?: string;
}

export interface GoodsReceiptDraftDto {
  idempotency_key: string;
  event_at: string;
  supplier_id?: string;
  supplier_name?: string;
  po_id?: string;
  po_number?: string;
  lines: GoodsReceiptLineDto[];
  notes?: string;
}

export interface WasteAdjustmentDraftDto {
  idempotency_key: string;
  event_at: string;
  direction: AdjustmentDirection;
  item_id?: string;
  item_name?: string;
  quantity: number;
  unit: Uom;
  reason_code?: AdjustmentReason;
  notes?: string;
}

export interface PhysicalCountDraftDto {
  idempotency_key: string;
  event_at: string;
  item_id?: string;
  item_name?: string;
  counted_quantity: number;
  unit: Uom;
  session_id?: string;
  notes?: string;
}

export interface SubmissionDto {
  id: string;
  form_type:
    | "goods_receipt"
    | "waste_adjustment"
    | "physical_count"
    | "production_actual"
    | "purchase_order";
  summary: string;
  state: SubmissionState;
  created_at: string;
  event_at: string;
  idempotency_key: string;
  payload_preview: Record<string, unknown>;
}

export interface ForecastCellDto {
  item_id: string;
  bucket: string;
  value: number;
}

export interface ForecastVersionDto {
  id: string;
  status: "draft" | "published" | "retired";
  version_number: number;
  horizon_weeks: number;
  bucket_granularity: "month" | "week";
  buckets: string[];
  rows: Array<{
    item_id: string;
    sku: string;
    name: string;
    family: string;
    cells: Record<string, number>;
  }>;
  audit: AuditMeta;
}

export interface PurchaseRecommendationDto {
  id: string;
  planning_run_id: string;
  supplier_id: string;
  supplier_name: string;
  component_id: string;
  component_name: string;
  recommended_quantity: number;
  unit: Uom;
  target_receive_date: string;
  urgency: Urgency;
  reason: string;
  on_hand: number;
  open_po_quantity: number;
  projected_stockout_at?: string;
  state: "pending" | "approved" | "rejected" | "held";
}

export interface ExceptionDto {
  id: string;
  source: string;
  severity: ExceptionSeverity;
  title: string;
  detail: string;
  created_at: string;
  status: "open" | "acknowledged" | "resolved";
  recommended_action?: string;
}

export interface ApprovalDto {
  id: string;
  kind: ApprovalKind;
  submitter: string;
  submitter_role: Role;
  created_at: string;
  summary: string;
  trigger_reason: string;
  payload_preview: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
}

export interface DashboardTileDto {
  stock_health: {
    total_items: number;
    in_shortage: number;
    in_overstock: number;
    healthy: number;
  };
  shortage_risk: Array<{
    item_id: string;
    item_name: string;
    days_to_stockout: number;
    on_hand: number;
    unit: Uom;
  }>;
  planning_run: {
    last_run_at: string;
    recommendation_count: number;
    flagged_count: number;
  };
  exceptions_summary: Record<ExceptionSeverity, number>;
  freshness: {
    ledger_last_post_at: string;
    lionwheel_last_sync_at: string;
    shopify_last_sync_at: string;
    greeninvoice_last_pull_at: string;
  };
  readiness: {
    ledger_integrity: "ok" | "warn" | "fail";
    projection_lag_seconds: number;
    jobs_health: "ok" | "warn" | "fail";
  };
}

export interface JobRunDto {
  id: string;
  job_id: string;
  job_name: string;
  schedule: string;
  last_run_at?: string;
  last_status: "ok" | "warn" | "fail" | "never_run";
  next_run_at?: string;
  last_error?: string;
  enabled: boolean;
}
