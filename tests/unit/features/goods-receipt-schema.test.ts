import { describe, expect, it } from "vitest";
import {
  goodsReceiptLineSchema,
  goodsReceiptSchema,
} from "@/features/ops/goods-receipt-schema";
import { GoodsReceiptRequestSchema } from "@/lib/contracts/goods-receipts";

// Values reconciled for Phase A: uppercase UOM literals + text PK IDs
// matching the locked schema seed (see src/lib/fixtures/*).
const validLine = {
  item_id: "RAW-RUM-WHITE",
  item_name: "White rum 37.5%",
  quantity: 12,
  unit: "L" as const,
};

const validReceipt = {
  event_at: "2026-04-14T10:00",
  supplier_id: "SUP-SHI",
  lines: [validLine],
};

describe("goodsReceiptLineSchema — line validation", () => {
  it("accepts a minimal valid line", () => {
    expect(goodsReceiptLineSchema.safeParse(validLine).success).toBe(true);
  });

  it("rejects a line with zero quantity", () => {
    const r = goodsReceiptLineSchema.safeParse({ ...validLine, quantity: 0 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Quantity must be positive");
    }
  });

  it("rejects a line with negative quantity", () => {
    expect(
      goodsReceiptLineSchema.safeParse({ ...validLine, quantity: -1 }).success
    ).toBe(false);
  });

  it("rejects a line with blank item_id", () => {
    const r = goodsReceiptLineSchema.safeParse({ ...validLine, item_id: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe("Choose an item");
    }
  });
});

describe("GoodsReceiptRequestSchema — final_delivery API contract", () => {
  const apiReceipt = {
    idempotency_key: "gr-final-delivery-test",
    event_at: "2026-04-14T10:00:00.000Z",
    supplier_id: "SUP-SHI",
    po_id: "PO-2026-00001",
    lines: [
      {
        item_type: "RM" as const,
        item_id: "RAW-RUM-WHITE",
        quantity: 40,
        unit: "L",
        po_line_id: "11111111-1111-4111-8111-111111111111",
      },
    ],
  };

  it("accepts keeping a partial PO open by omitting final_delivery", () => {
    expect(GoodsReceiptRequestSchema.safeParse(apiReceipt).success).toBe(true);
  });

  it("accepts explicitly closing the remaining PO balance short", () => {
    const r = GoodsReceiptRequestSchema.safeParse({
      ...apiReceipt,
      final_delivery: {
        close_remaining_short: true,
        reason_code: "PACK_SIZE_ROUNDING",
      },
    });
    expect(r.success).toBe(true);
  });

  it("requires a note when final_delivery reason is OTHER", () => {
    const r = GoodsReceiptRequestSchema.safeParse({
      ...apiReceipt,
      final_delivery: {
        close_remaining_short: true,
        reason_code: "OTHER",
      },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(["final_delivery", "note"]);
    }
  });
});

describe("goodsReceiptSchema — header + lines", () => {
  it("accepts a minimal valid receipt with a single line", () => {
    expect(goodsReceiptSchema.safeParse(validReceipt).success).toBe(true);
  });

  it("accepts a multi-line receipt", () => {
    const r = goodsReceiptSchema.safeParse({
      ...validReceipt,
      lines: [
        validLine,
        { ...validLine, item_id: "RAW-LIME-JUICE", quantity: 5 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a receipt with zero lines", () => {
    const r = goodsReceiptSchema.safeParse({ ...validReceipt, lines: [] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe(
        "At least one line is required"
      );
    }
  });

  it("rejects a receipt with no supplier_id", () => {
    const r = goodsReceiptSchema.safeParse({ ...validReceipt, supplier_id: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a receipt with no event_at", () => {
    const r = goodsReceiptSchema.safeParse({ ...validReceipt, event_at: "" });
    expect(r.success).toBe(false);
  });

  it("propagates line-level errors from inside the lines array", () => {
    const r = goodsReceiptSchema.safeParse({
      ...validReceipt,
      lines: [{ ...validLine, quantity: 0 }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const lineIssue = r.error.issues.find(
        (i) => i.path.join(".") === "lines.0.quantity"
      );
      expect(lineIssue?.message).toBe("Quantity must be positive");
    }
  });
});
