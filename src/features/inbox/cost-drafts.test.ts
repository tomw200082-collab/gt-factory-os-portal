import { describe, expect, it } from "vitest";
import { toCostDraftInboxRow, type CostDraftRow } from "./client";

function draft(overrides: Partial<CostDraftRow> = {}): CostDraftRow {
  return {
    supplier_cost_draft_id: "11111111-1111-1111-1111-111111111111",
    supplier_item_id: "22222222-2222-2222-2222-222222222222",
    supplier_id: "sup-1",
    supplier_name: "ספק בע״מ",
    component_id: "comp-1",
    item_id: null,
    target_name: "סוכר חום",
    suggested_cost_ils: "12.50",
    current_supplier_cost: "10.00",
    current_effective_cost: "10.00",
    source_invoice_id: "inv-1",
    source_invoice_date: "2026-06-20",
    status: "pending",
    created_at: "2026-06-20T08:00:00.000Z",
    ...overrides,
  };
}

describe("toCostDraftInboxRow", () => {
  it("maps a pending draft to an approval:cost_draft inbox row", () => {
    const row = toCostDraftInboxRow(draft());
    expect(row.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(row.type).toBe("approval:cost_draft");
    expect(row.category).toBe("cost_draft_pending");
    expect(row.severity).toBe("warning");
    expect(row.created_at).toBe("2026-06-20T08:00:00.000Z");
    expect(row.component_id).toBe("comp-1");
    expect(row.item_id).toBeNull();
    expect(row.deep_link).toBe("/admin/cost-drafts");
    expect(row.inline_actions).toEqual([]);
  });

  it("summary carries the target name and supplier", () => {
    const row = toCostDraftInboxRow(draft());
    expect(row.summary).toContain("סוכר חום");
    expect(row.summary).toContain("ספק בע״מ");
  });

  it("falls back to component/item id when target_name is null", () => {
    const row = toCostDraftInboxRow(
      draft({ target_name: null, component_id: "comp-X" }),
    );
    expect(row.summary).toContain("comp-X");
  });

  it("omits the supplier tail when supplier_name is null", () => {
    const row = toCostDraftInboxRow(draft({ supplier_name: null }));
    expect(row.summary).not.toContain("—");
  });

  it("carries the full draft on raw for the inline card", () => {
    const d = draft();
    const row = toCostDraftInboxRow(d);
    expect(row.raw).toBe(d);
  });
});
