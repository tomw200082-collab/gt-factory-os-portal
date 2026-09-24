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

export const FinalDeliverySchema = z
  .object({
    close_remaining_short: z.literal(true),
    reason_code: z.enum([
      "PACK_SIZE_ROUNDING",
      "SUPPLIER_SHORT_DELIVERY",
      "AGREED_FINAL_QUANTITY",
      "OTHER",
    ]),
    note: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.reason_code !== "OTHER" || !!v.note?.trim(), {
    path: ["note"],
    message: "note is required when reason_code is OTHER",
  });

export const GoodsReceiptRequestSchema = z.object({
  idempotency_key: z.string().min(1).max(255),
  event_at: z.string().datetime(),
  supplier_id: z.string().min(1),
  po_id: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  lines: z.array(GoodsReceiptLineSchema).min(1),
  final_delivery: FinalDeliverySchema.optional(),
});

export type ItemType = "FG" | "RM" | "PKG";

export type ConflictReason =
  | "SUPPLIER_INACTIVE"
  | "ITEM_INACTIVE"
  | "UNIT_NOT_FOUND"
  | "ITEM_TYPE_MISMATCH";
