import { describe, expect, it } from "vitest";
import {
  goodsReceiptLineSchema,
  goodsReceiptSchema,
} from "@/features/ops/goods-receipt-schema";

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
