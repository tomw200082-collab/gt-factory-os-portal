// ---------------------------------------------------------------------------
// Goods Receipt runtime contract — mirror of authoritative schema.
//
// Source of truth (DO NOT MODIFY HERE):
//   C:/Users/tomw2/Projects/gt-factory-os/api/src/goods-receipts/schemas.ts
//
// Values, types, and nullability must match the API verbatim. Any drift
// is a bug — update both files in the same PR.
// ---------------------------------------------------------------------------

import { z } from "zod";

export const GoodsReceiptLineSchema = z.object({
  item_type: z.enum(["FG", "RM", "PKG"]),
  item_id: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  po_line_id: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const GoodsReceiptRequestSchema = z.object({
  idempotency_key: z.string().min(1).max(255),
  event_at: z.string().datetime(),
  supplier_id: z.string().min(1),
  po_id: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  lines: z.array(GoodsReceiptLineSchema).min(1),
});

export type GoodsReceiptLine = z.infer<typeof GoodsReceiptLineSchema>;
export type GoodsReceiptRequest = z.infer<typeof GoodsReceiptRequestSchema>;

export type ItemType = "FG" | "RM" | "PKG";

// quantity is STRING on response side (precision preserved). Never cast to Number.
export interface GoodsReceiptCommittedResponse {
  submission_id: string;
  status: "posted";
  event_at: string;
  posted_at: string;
  supplier_id: string;
  po_id: string | null;
  lines: Array<{
    line_id: string;
    item_type: ItemType;
    item_id: string;
    quantity: string;
    unit: string;
    stock_ledger_movement_id: string;
  }>;
  idempotent_replay: boolean;
}

export type ConflictReason =
  | "SUPPLIER_INACTIVE"
  | "ITEM_INACTIVE"
  | "UNIT_NOT_FOUND"
  | "ITEM_TYPE_MISMATCH";

export interface ConflictResponse {
  reason_code: ConflictReason | string;
  detail: string;
  offending_line_index?: number;
}

export interface ValidationResponse {
  validation_errors: Array<{
    path: (string | number)[];
    code: string;
    message: string;
  }>;
}
