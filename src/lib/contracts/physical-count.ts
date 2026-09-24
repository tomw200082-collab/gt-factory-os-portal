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
