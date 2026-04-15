import { describe, expect, it } from "vitest";
import { wasteAdjustmentSchema } from "@/features/ops/waste-adjustment-schema";

// Values reconciled for Phase A: uppercase UOM literals + text PK
// IDs matching the locked schema seed.
const base = {
  event_at: "2026-04-14T10:00",
  direction: "loss" as const,
  item_id: "RAW-RUM-WHITE",
  quantity: 1,
  unit: "L" as const,
  reason_code: "breakage" as const,
};

describe("wasteAdjustmentSchema — validation refine", () => {
  it("accepts a minimal valid loss with no notes", () => {
    const result = wasteAdjustmentSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects positive direction without notes", () => {
    const result = wasteAdjustmentSchema.safeParse({
      ...base,
      direction: "positive",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const notesIssue = result.error.issues.find(
        (i) => i.path.join(".") === "notes"
      );
      expect(notesIssue?.message).toBe(
        "Notes are required for positive corrections."
      );
    }
  });

  it("accepts positive direction when notes are provided", () => {
    const result = wasteAdjustmentSchema.safeParse({
      ...base,
      direction: "positive",
      reason_code: "found_stock",
      notes: "Found sealed case behind the cold-room rack.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects reason 'other' without notes", () => {
    const result = wasteAdjustmentSchema.safeParse({
      ...base,
      reason_code: "other",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const notesIssue = result.error.issues.find(
        (i) => i.path.join(".") === "notes"
      );
      expect(notesIssue?.message).toBe(
        "Notes are required when reason is 'other'."
      );
    }
  });

  it("accepts reason 'other' when notes are provided", () => {
    const result = wasteAdjustmentSchema.safeParse({
      ...base,
      reason_code: "other",
      notes: "Container returned half-full from promo event.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero quantity", () => {
    const result = wasteAdjustmentSchema.safeParse({ ...base, quantity: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = wasteAdjustmentSchema.safeParse({ ...base, quantity: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects missing item_id", () => {
    const result = wasteAdjustmentSchema.safeParse({ ...base, item_id: "" });
    expect(result.success).toBe(false);
  });

  it("produces BOTH notes errors when positive AND reason=other AND notes missing", () => {
    const result = wasteAdjustmentSchema.safeParse({
      ...base,
      direction: "positive",
      reason_code: "other",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const notesIssues = result.error.issues.filter(
        (i) => i.path.join(".") === "notes"
      );
      expect(notesIssues.length).toBe(2);
    }
  });
});
