export const ROLES = ["operator", "planner", "admin", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ITEM_KINDS = [
  "finished_good",
  "component",
  "packaging",
  "raw_material",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const SUPPLY_METHODS = ["MAKE", "BOUGHT", "BOUGHT_FINISHED"] as const;
export type SupplyMethod = (typeof SUPPLY_METHODS)[number];

export const UOMS = [
  "kg",
  "g",
  "l",
  "ml",
  "each",
  "case",
  "box",
  "bottle",
] as const;
export type Uom = (typeof UOMS)[number];

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
