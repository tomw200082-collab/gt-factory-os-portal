import { z } from "zod";
import { UOMS } from "@/lib/contracts/enums";

/**
 * Shared zod schemas for the Goods Receipt form.
 *
 * Extracted from the page file so the line validation and header
 * validation rules can be unit-tested directly by Vitest.
 *
 * Client-side rules enforced here:
 *
 *  - Each line must have a chosen item.
 *  - Each line quantity must be strictly positive (zero is not
 *    "no receipt", it's a validation error — zero-line means
 *    the operator didn't type a quantity at all).
 *  - At least one line is required on the receipt.
 *  - A supplier must be chosen. Unlinked (no-PO) receipts are still
 *    valid, but the supplier is authoritative regardless of PO.
 *  - `event_at` must be present. Backdating is allowed; the warning
 *    threshold is a separate policy concern and is not enforced in
 *    this schema.
 *
 * Server-side rules not enforced here (intentional): over-receipt
 * against PO remainder, attachment storage contract, backdate window,
 * and idempotency key dedup. All are TODO-WINDOW1.
 */
export const goodsReceiptLineSchema = z.object({
  item_id: z.string().min(1, "Choose an item"),
  item_name: z.string().optional(),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unit: z.enum(UOMS),
  notes: z.string().optional(),
});

export const goodsReceiptSchema = z.object({
  event_at: z.string().min(1, "Event time is required"),
  supplier_id: z.string().min(1, "Supplier is required"),
  po_id: z.string().optional(),
  lines: z.array(goodsReceiptLineSchema).min(1, "At least one line is required"),
  notes: z.string().optional(),
});

export type GoodsReceiptLineFormValues = z.infer<typeof goodsReceiptLineSchema>;
export type GoodsReceiptFormValues = z.infer<typeof goodsReceiptSchema>;
