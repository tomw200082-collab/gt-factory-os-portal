// ---------------------------------------------------------------------------
// Waste / Adjustment runtime contract — mirror of authoritative schema.
//
// Source of truth (DO NOT MODIFY HERE):
//   C:/Users/tomw2/Projects/gt-factory-os/api/src/waste-adjustments/schemas.ts
//
// Values, types, and nullability must match the API verbatim. Any drift
// is a bug — update both files in the same PR.
//
// Authored under W2 Mode B, scoped to WasteAdjustment only, after
// RUNTIME_READY(Waste) emission 2026-04-17.
// ---------------------------------------------------------------------------

import { z } from "zod";

// ===========================================================================
// Canonical reason code list (mirrors form_field_definitions.md §2.3 +
// api/src/waste-adjustments/schemas.ts WASTE_REASON_CODES)
// ===========================================================================
export const WASTE_REASON_CODES = [
  "breakage",
  "spoilage",
  "production_waste",
  "sampling",
  "theft_loss",
  "found_stock",
  "correction",
  "other",
] as const;
export type WasteReasonCode = (typeof WASTE_REASON_CODES)[number];

export const REASON_CODES_BY_DIRECTION: Record<
  "loss" | "positive",
  readonly WasteReasonCode[]
> = {
  loss: ["breakage", "spoilage", "production_waste", "sampling", "theft_loss", "correction", "other"],
  positive: ["found_stock", "correction", "other"],
};

export const REASON_CODES_REQUIRING_NOTES: readonly WasteReasonCode[] = [
  "theft_loss",
  "found_stock",
  "correction",
  "other",
];

// ===========================================================================
// Submit request (POST /api/v1/mutations/waste-adjustments)
// ===========================================================================
export const WasteAdjustmentRequestSchema = z.object({
  idempotency_key: z.string().min(1).max(255),
  event_at: z.string().datetime(),
  direction: z.enum(["loss", "positive"]),
  item_type: z.enum(["FG", "RM", "PKG"]),
  item_id: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  reason_code: z.string().min(1),
  notes: z.string().max(2000).nullable().optional(),
});

export type WasteAdjustmentRequest = z.infer<typeof WasteAdjustmentRequestSchema>;

// ===========================================================================
// Approve / Reject request envelopes
// ===========================================================================
export const WasteApprovalRequestSchema = z.object({
  idempotency_key: z.string().min(1).max(255),
  approval_notes: z.string().max(2000).nullable().optional(),
});

export const WasteRejectionRequestSchema = z.object({
  idempotency_key: z.string().min(1).max(255),
  rejection_reason: z.string().min(1).max(2000),
});

export type WasteApprovalRequest = z.infer<typeof WasteApprovalRequestSchema>;
export type WasteRejectionRequest = z.infer<typeof WasteRejectionRequestSchema>;

// ===========================================================================
// Response shapes
// ===========================================================================
export type ItemType = "FG" | "RM" | "PKG";
export type WasteApprovalReason = "positive_direction" | "loss_above_threshold";

// 201 Committed (auto-post, direction=loss only)
export interface WasteAdjustmentCommittedResponse {
  submission_id: string;
  status: "posted";
  event_at: string;
  posted_at: string;
  direction: "loss";
  item_type: ItemType;
  item_id: string;
  quantity: string; // precision-preserved
  unit: string;
  stock_ledger_movement_id: string;
  idempotent_replay: boolean;
}

// 202 Pending Approval
export interface WasteAdjustmentPendingResponse {
  submission_id: string;
  status: "pending";
  event_at: string;
  submitted_at: string;
  direction: "loss" | "positive";
  item_type: ItemType;
  item_id: string;
  quantity: string;
  unit: string;
  exception_id: string;
  approval_reason: WasteApprovalReason;
  idempotent_replay: boolean;
}

// 200 Approved
export interface WasteApprovalSuccessResponse {
  submission_id: string;
  status: "posted";
  posted_at: string;
  posted_by: string;
  stock_ledger_movement_id: string;
  exception_id: string;
  exception_status: "resolved";
  idempotent_replay: boolean;
}

// 200 Rejected
export interface WasteRejectionSuccessResponse {
  submission_id: string;
  status: "rejected";
  rejected_at: string;
  rejected_by: string;
  rejection_reason: string;
  exception_id: string;
  exception_status: "resolved";
  idempotent_replay: boolean;
}

// 409 Conflict
export type WasteConflictReason =
  | "ITEM_INACTIVE"
  | "UNIT_NOT_FOUND"
  | "ITEM_TYPE_MISMATCH"
  | "REASON_CODE_NOT_ALLOWED"
  | "COUNT_FREEZE_ACTIVE"
  | "THRESHOLD_NOT_CONFIGURED"
  | "NOT_PENDING"
  | "SELF_APPROVAL_FORBIDDEN"
  | "SUBMISSION_NOT_FOUND"
  | "IDEMPOTENCY_KEY_REUSED";

export interface WasteConflictResponse {
  reason_code: WasteConflictReason | string;
  detail: string;
  offending_field?: string;
  conflicting_keys?: Array<{
    site_id: string;
    item_type: string;
    item_id: string;
    batch_id_or_empty: string;
  }>;
}

// 422 Validation
export interface WasteValidationResponse {
  validation_errors: Array<{
    path: (string | number)[];
    code: string;
    message: string;
  }>;
}
