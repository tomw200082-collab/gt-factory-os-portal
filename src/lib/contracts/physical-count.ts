// ---------------------------------------------------------------------------
// Physical Count runtime contract — mirror of authoritative schema.
//
// Source of truth (DO NOT MODIFY HERE):
//   C:/Users/tomw2/Projects/gt-factory-os/api/src/physical-counts/schemas.ts
//
// Values, types, and nullability must match the API verbatim. Any drift
// is a bug — update both files in the same PR.
//
// Authored under W2 Mode B, scoped to PhysicalCount only, after
// RUNTIME_READY(PhysicalCount) emission 2026-04-17T19:21:41Z.
// Contract: docs/physical_count_runtime_contract.md §1.1–1.9, §2.1–2.6.
// ---------------------------------------------------------------------------

import { z } from "zod";

// ===========================================================================
// Item type domain (contract §1.2)
// ===========================================================================
export const PHYSICAL_COUNT_ITEM_TYPES = ["FG", "RM", "PKG"] as const;
export type PhysicalCountItemType = (typeof PHYSICAL_COUNT_ITEM_TYPES)[number];

// ===========================================================================
// Open-count query params (GET /api/v1/queries/physical-counts/open)
// Mirrors: PhysicalCountOpenQuerySchema
// ===========================================================================
export const PhysicalCountOpenQuerySchema = z.object({
  item_type: z.enum(PHYSICAL_COUNT_ITEM_TYPES),
  item_id: z.string().min(1),
});
export type PhysicalCountOpenQuery = z.infer<
  typeof PhysicalCountOpenQuerySchema
>;

// Open-count 200 response shape (contract §1.2). snapshot_quantity
// is NEVER returned pre-submit — blind count invariant (I10).
export interface PhysicalCountOpenResponse {
  snapshot_id: string;
  item_type: PhysicalCountItemType;
  item_id: string;
  item_display_name: string;
  unit_default: string;
  opened_at: string;
  idempotent_open: boolean;
}

// ===========================================================================
// Submit envelope (POST /api/v1/mutations/physical-counts)
// Mirrors: PhysicalCountSubmitSchema
// ===========================================================================
export const PhysicalCountSubmitSchema = z.object({
  idempotency_key: z.string().min(1).max(255),
  snapshot_id: z.string().uuid(),
  event_at: z.string().datetime(),
  counted_quantity: z.number().nonnegative(),
  unit: z.string().min(1),
  notes: z.string().max(2000).nullable().optional(),
});
export type PhysicalCountSubmit = z.infer<typeof PhysicalCountSubmitSchema>;

// 201 Committed — auto-post path (|computed_delta| within threshold OR
// both-zero zero-snapshot). Contract §1.4.
// Note: quantity-like fields arrive as strings from the API (numeric
// precision preservation); NOT coerced to number client-side.
export interface PhysicalCountCommittedResponse {
  submission_id: string;
  status: "posted";
  event_at: string;
  posted_at: string;
  item_type: PhysicalCountItemType;
  item_id: string;
  counted_quantity: string;
  unit: string;
  snapshot_quantity: string;
  computed_delta: string;
  new_anchor_applied: true;
  anchor_source: "COUNT_AUTO";
  idempotent_replay: boolean;
}

// 202 Pending Approval — threshold exceeded OR zero-snapshot with
// non-zero count. Contract §1.4.
export interface PhysicalCountPendingResponse {
  submission_id: string;
  status: "pending";
  event_at: string;
  submitted_at: string;
  item_type: PhysicalCountItemType;
  item_id: string;
  counted_quantity: string;
  unit: string;
  snapshot_quantity: string;
  computed_delta: string;
  exception_id: string;
  approval_reason: "count_variance_exceeds_threshold";
  new_anchor_applied: false;
  idempotent_replay: boolean;
}

// ===========================================================================
// Approve / Reject / Cancel envelopes (contract §1.7, §1.9)
// ===========================================================================
export const PhysicalCountApprovalRequestSchema = z.object({
  idempotency_key: z.string().min(1).max(255),
  approval_notes: z.string().max(2000).nullable().optional(),
});

export const PhysicalCountRejectionRequestSchema = z.object({
  idempotency_key: z.string().min(1).max(255),
  rejection_reason: z.string().min(1).max(2000),
});

export const PhysicalCountCancelRequestSchema = z.object({
  idempotency_key: z.string().min(1).max(255),
});

export type PhysicalCountApprovalRequest = z.infer<
  typeof PhysicalCountApprovalRequestSchema
>;
export type PhysicalCountRejectionRequest = z.infer<
  typeof PhysicalCountRejectionRequestSchema
>;
export type PhysicalCountCancelRequest = z.infer<
  typeof PhysicalCountCancelRequestSchema
>;

// 200 Approved (contract §1.8)
export interface PhysicalCountApprovalSuccessResponse {
  submission_id: string;
  status: "posted";
  posted_at: string;
  posted_by: string;
  new_anchor_applied: true;
  anchor_source: "COUNT_APPROVAL";
  exception_id: string;
  exception_status: "resolved";
  idempotent_replay: boolean;
}

// 200 Rejected (contract §1.8)
export interface PhysicalCountRejectionSuccessResponse {
  submission_id: string;
  status: "rejected";
  rejected_at: string;
  rejected_by: string;
  rejection_reason: string;
  new_anchor_applied: false;
  exception_id: string;
  exception_status: "resolved";
  idempotent_replay: boolean;
}

// 200 Cancelled (contract §1.9) — pure freeze-state release, no posting
export interface PhysicalCountCancelSuccessResponse {
  snapshot_id: string;
  cancelled_at: string;
  released: true;
}

// ===========================================================================
// Conflict shapes (contract §1.2 409, §1.4 409, §1.8 409, §1.9 409)
// ===========================================================================
export type PhysicalCountConflictReason =
  | "ITEM_INACTIVE"
  | "UNIT_NOT_FOUND"
  | "UNIT_INCOMPATIBLE"
  | "ITEM_TYPE_MISMATCH"
  | "COUNT_ALREADY_OPEN"
  | "COUNT_FREEZE_ACTIVE"
  | "SNAPSHOT_NOT_FOUND"
  | "SNAPSHOT_EXPIRED"
  | "SNAPSHOT_OWNER_MISMATCH"
  | "SNAPSHOT_ALREADY_CONSUMED"
  | "THRESHOLD_NOT_CONFIGURED"
  | "NOT_PENDING"
  | "SELF_APPROVAL_FORBIDDEN"
  | "SUBMISSION_NOT_FOUND"
  | "IDEMPOTENCY_KEY_REUSED";

export interface PhysicalCountConflictResponse {
  reason_code: PhysicalCountConflictReason | string;
  detail: string;
  offending_field?: string;
}

// 422 Validation (contract §1.4)
export interface PhysicalCountValidationResponse {
  validation_errors: Array<{
    path: (string | number)[];
    code: string;
    message: string;
  }>;
}
