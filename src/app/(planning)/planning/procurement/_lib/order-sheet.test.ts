import { describe, it, expect } from "vitest";
import { buildOrderSheetModel } from "./order-sheet";
import type {
  PurchaseSessionPo,
  PurchaseSessionLine,
  LineLabelSize,
} from "../../purchase-session/_lib/types";

function line(o: Partial<PurchaseSessionLine>): PurchaseSessionLine {
  return {
    session_po_line_id: o.session_po_line_id ?? "l1",
    component_id: o.component_id ?? "C1",
    item_id: o.item_id ?? null,
    line_label: o.line_label ?? "Component",
    recommended_qty: o.recommended_qty ?? 0,
    final_qty: o.final_qty ?? 1,
    uom: o.uom ?? "EACH",
    unit_cost: o.unit_cost ?? 0,
    line_cost: o.line_cost ?? 0,
    earliest_need_date: o.earliest_need_date ?? null,
    coverage_trace: o.coverage_trace ?? {},
    is_user_added: o.is_user_added ?? false,
    is_dropped: o.is_dropped ?? false,
    is_label: o.is_label,
    label_size: o.label_size,
    procurement_spec: o.procurement_spec,
    assets: o.assets,
  };
}

function po(lines: PurchaseSessionLine[], o: Partial<PurchaseSessionPo> = {}): PurchaseSessionPo {
  return {
    session_po_id: "po1",
    supplier_id: "SUP1",
    supplier_snapshot: o.supplier_snapshot ?? "ספק לדוגמה",
    tier: "must",
    status: "proposed",
    order_by_date: "2026-06-20",
    earliest_need_date: o.earliest_need_date ?? "2026-06-25",
    covered_through_date: null,
    currency: o.currency ?? "ILS",
    total_cost: o.total_cost ?? 0,
    order_document_text: null,
    po_id: null,
    blocking_issues: [],
    lines,
  };
}

const L270: LineLabelSize = { size_id: "l_270x90", width_mm: 270, height_mm: 90, label: 'מדבקה 270×90 מ"מ' };
const L150: LineLabelSize = { size_id: "l_150x60", width_mm: 150, height_mm: 60, label: 'מדבקה 150×60 מ"מ' };

describe("buildOrderSheetModel", () => {
  it("renders plain item lines with no labels", () => {
    const m = buildOrderSheetModel(
      po([line({ line_label: "עלי תה", final_qty: 5, uom: "KG" })], { total_cost: 1234.5 }),
    );
    expect(m.hasItems).toBe(true);
    expect(m.hasLabels).toBe(false);
    expect(m.items[0]).toMatchObject({ name: "עלי תה", qty: 5, uom: "KG" });
    expect(m.totalText).toBe('סך הכל משוער: 1,234.50 ₪');
  });

  it("uses supplier catalog wording and a spec hint", () => {
    const m = buildOrderSheetModel(
      po([
        line({
          line_label: "Bottle internal",
          final_qty: 3000,
          procurement_spec: {
            supplier_catalog_wording: "בקבוק PET 1 ליטר",
            material: "PET",
            finish: null,
            print: null,
            design: null,
            dimensions_mm: null,
            ordering_notes: null,
          },
        }),
      ]),
    );
    expect(m.items[0].name).toBe("בקבוק PET 1 ליטר");
    expect(m.items[0].specHint).toBe("חומר: PET");
  });

  it("groups labels by size: total + per-design breakdown", () => {
    const designs = ["American", "Detox", "Fresh", "Energy", "Calm"];
    const m = buildOrderSheetModel(
      po(
        designs.map((d, i) =>
          line({
            session_po_line_id: `lbl${i}`,
            line_label: `Label ${d} 1L`,
            final_qty: 2000,
            is_label: true,
            label_size: L270,
          }),
        ),
      ),
    );
    expect(m.hasLabels).toBe(true);
    expect(m.labelGroups).toHaveLength(1);
    expect(m.labelGroups[0]).toMatchObject({ sizeLabel: 'מדבקה 270×90 מ"מ', total: 10000 });
    expect(m.labelGroups[0].designs).toHaveLength(5);
    expect(m.missingPrintFiles).toBe(5);
  });

  it("multi-size grouping totals each size separately", () => {
    const m = buildOrderSheetModel(
      po([
        line({ session_po_line_id: "a", line_label: "American 1L", final_qty: 2000, is_label: true, label_size: L270 }),
        line({ session_po_line_id: "b", line_label: "Detox 1L", final_qty: 2000, is_label: true, label_size: L270 }),
        line({ session_po_line_id: "c", line_label: "Cosmo 300", final_qty: 1500, is_label: true, label_size: L150 }),
      ]),
    );
    expect(m.labelGroups.map((g) => [g.sizeId, g.total])).toEqual([
      ["l_270x90", 4000],
      ["l_150x60", 1500],
    ]);
  });

  it("captures print-file and photo names from assets", () => {
    const m = buildOrderSheetModel(
      po([
        line({
          line_label: "American 1L",
          final_qty: 2000,
          is_label: true,
          label_size: L270,
          assets: [
            { asset_type: "PRINT_FILE", file_name: "american_1l.pdf", dpi: 300 },
            { asset_type: "PHOTO", file_name: "american.jpg", dpi: null },
          ],
        }),
      ]),
    );
    expect(m.labelGroups[0].designs[0].printFile).toBe("american_1l.pdf");
    expect(m.labelGroups[0].designs[0].photo).toBe("american.jpg");
    expect(m.missingPrintFiles).toBe(0);
  });

  it("excludes dropped and zero-qty lines", () => {
    const m = buildOrderSheetModel(
      po([
        line({ line_label: "Kept", final_qty: 10 }),
        line({ line_label: "Dropped", final_qty: 10, is_dropped: true }),
        line({ line_label: "Zeroed", final_qty: 0 }),
      ]),
    );
    expect(m.items.map((i) => i.name)).toEqual(["Kept"]);
  });
});
