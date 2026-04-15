// ---------------------------------------------------------------------------
// Canonical enum contracts — reconciled against the locked SQL schema.
//
// Source of truth for every constant in this file:
//
//   C:/Users/tomw2/Projects/gt-factory-os/db/migrations/0001_domains_and_schemas.sql
//   C:/Users/tomw2/Projects/gt-factory-os/db/migrations/0002_masters.sql
//   C:/Users/tomw2/Projects/gt-factory-os/db/migrations/0003_bom_three_table.sql
//
// When the database schema changes, update this file in the same PR.
// Drift between this file and the migrations is a bug; the forbidden-values
// regression test (Phase A T3) treats any stale literal as a CI failure.
//
// Phase A reconciliation: 2026-04-15. The previous draft of this file used
// pre-schema-lock values (ITEM_KINDS, "MAKE"/"BOUGHT", lowercase UOMs) that
// did not match the locked migrations. Those values are deleted here.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ROLES — unchanged. Locked decision 5.
// ---------------------------------------------------------------------------
export const ROLES = ["operator", "planner", "admin", "viewer"] as const;
export type Role = (typeof ROLES)[number];

// ---------------------------------------------------------------------------
// SUPPLY_METHODS — exact legacy enum from items.supply_method CHECK in
// 0002_masters.sql. MANUFACTURED = produced via BOM. BOUGHT_FINISHED =
// resold as-is. REPACK = produced by repackaging an input component.
//
// Locked decision 58: the legacy enum is preserved verbatim; do not
// normalize values or invent new ones (e.g. no "MAKE", no "BOUGHT" without
// the "_FINISHED" suffix).
// ---------------------------------------------------------------------------
export const SUPPLY_METHODS = [
  "MANUFACTURED",
  "BOUGHT_FINISHED",
  "REPACK",
] as const;
export type SupplyMethod = (typeof SUPPLY_METHODS)[number];

// ---------------------------------------------------------------------------
// ITEM_STATUSES — from items.status CHECK in 0002_masters.sql. PENDING is a
// legitimate intermediate state (DQ-008): items being prepared for planning
// but not yet active. Same enum applies to components.
// ---------------------------------------------------------------------------
export const ITEM_STATUSES = ["ACTIVE", "INACTIVE", "PENDING"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const COMPONENT_STATUSES = ["ACTIVE", "INACTIVE", "PENDING"] as const;
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// SUPPLIER_STATUSES — from suppliers.status CHECK in 0002_masters.sql.
// Deliberately does NOT include PENDING: suppliers are either operational
// (ACTIVE) or retired (INACTIVE). A supplier cannot be "half onboarded".
// ---------------------------------------------------------------------------
export const SUPPLIER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

// ---------------------------------------------------------------------------
// UOMS — from the uom table seed in 0001_domains_and_schemas.sql.
// Uppercase. Full set. BOTTLE and TIN are legitimate count UOMs used by
// items.sales_uom in the current fixtures (29 BOTTLE rows, 2 TIN rows).
// ---------------------------------------------------------------------------
export const UOMS = [
  "KG",
  "L",
  "UNIT",
  "G",
  "MG",
  "TON",
  "ML",
  "PCS",
  "BAG",
  "CASE",
  "BOX",
  "BOTTLE",
  "TIN",
] as const;
export type Uom = (typeof UOMS)[number];

// ---------------------------------------------------------------------------
// BOM_KINDS — from bom_head.bom_kind and bom_lines.bom_kind CHECK in
// 0003_bom_three_table.sql. The plan draft suggested
// ("BASE","PACK","FINAL") but the fixture reality (and the locked
// migration) uses REPACK instead of FINAL, matching the REPACK value in
// items.supply_method. Fixture reality wins.
// ---------------------------------------------------------------------------
export const BOM_KINDS = ["BASE", "PACK", "REPACK"] as const;
export type BomKind = (typeof BOM_KINDS)[number];

// ---------------------------------------------------------------------------
// BOM_VERSION_STATUSES — from bom_version.status CHECK in 0003. The state
// machine is strictly DRAFT -> ACTIVE -> ARCHIVED, enforced at the DB by
// trg_bom_version_status_transition. "retired" is NOT a legal value.
// ---------------------------------------------------------------------------
export const BOM_VERSION_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type BomVersionStatus = (typeof BOM_VERSION_STATUSES)[number];

// ---------------------------------------------------------------------------
// BOM_HEAD_STATUSES — from bom_head.status CHECK in 0003. PENDING exists
// for REPACK heads whose configuration is still open (e.g. BOM-REPACK-MAT-
// 100G with unresolved carton qty).
// ---------------------------------------------------------------------------
export const BOM_HEAD_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "PENDING",
  "ARCHIVED",
] as const;
export type BomHeadStatus = (typeof BOM_HEAD_STATUSES)[number];

// ---------------------------------------------------------------------------
// COMPONENT_REF_TYPES — from bom_lines.component_ref_type CHECK in 0003.
// These are workbook import provenance tags describing how each BOM line
// was resolved during the Tranche 1 seed extraction. Preserved verbatim so
// the audit trail back to the workbook remains intact.
// ---------------------------------------------------------------------------
export const COMPONENT_REF_TYPES = [
  "RAW_NAME",
  "BASE_BOM",
  "COMPONENT",
  "BOM",
] as const;
export type ComponentRefType = (typeof COMPONENT_REF_TYPES)[number];

// ---------------------------------------------------------------------------
// Operational / UI enums — unchanged by Phase A. These are portal-side
// concepts not defined by the database schema, so they stay as-is.
// ---------------------------------------------------------------------------

export const ADJUSTMENT_DIRECTIONS = ["loss", "positive"] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

export const ADJUSTMENT_REASONS = [
  "breakage",
  "spoilage",
  "spillage",
  "shrinkage",
  "found_stock",
  "admin_correction",
  "count_reconciliation",
  "other",
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const SUBMISSION_STATES = [
  "queued",
  "submitting",
  "committed",
  "pending_approval",
  "approved",
  "rejected",
  "failed_retriable",
  "failed_terminal",
  "discarded",
] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];

export const SCREEN_STATES = [
  "empty",
  "loading",
  "validation_error",
  "submission_pending",
  "success",
  "approval_required",
  "stale_conflict",
] as const;
export type ScreenState = (typeof SCREEN_STATES)[number];

export const EXCEPTION_SEVERITIES = ["info", "warning", "critical"] as const;
export type ExceptionSeverity = (typeof EXCEPTION_SEVERITIES)[number];

export const APPROVAL_KINDS = [
  "waste_adjustment",
  "physical_count_variance",
  "forecast_publish",
  "purchase_recommendation_bulk",
  "goods_receipt_exception",
] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export const URGENCIES = ["low", "normal", "high", "critical"] as const;
export type Urgency = (typeof URGENCIES)[number];
