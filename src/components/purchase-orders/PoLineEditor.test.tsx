// ---------------------------------------------------------------------------
// PoLineEditor + validatePoDraft unit tests — Tranche 027
// (procurement-shared-line-editor).
//
// Coverage:
//   Validation (mode-aware):
//     V1 — manual mode: empty reason → manual_reason error
//     V2 — manual mode: reason < 5 chars → manual_reason error
//     V3 — recommendation mode: empty reason → NO manual_reason error
//     V4 — missing supplier / expected date are flagged in both modes
//     V5 — line rules: no orderable, blank qty, qty <= 0
//     V6 — a fully valid manual draft yields no errors
//   Rendering (mode-aware):
//     R1 — manual mode renders the reason field
//     R2 — recommendation mode hides the reason field
//     R3 — add-line button fires onAddLine
//     R4 — picking an item fires onUpdateLine with the orderable_key
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SearchableSelectOption } from "@/components/fields/SearchableSelect";
import { PoLineEditor, type PoLineEditorProps } from "./PoLineEditor";
import {
  approvedSupplierItems,
  computeLinePriceInsight,
  costPerOrderUom,
  dedupeBySupplier,
  emptyLine,
  validatePoDraft,
  type OrderableRow,
  type PoDraft,
  type SupplierItemRow,
} from "./types";

afterEach(() => {
  cleanup();
});

// --- validatePoDraft -------------------------------------------------------

function baseDraft(overrides: Partial<PoDraft> = {}): PoDraft {
  return {
    supplierId: "sup_1",
    expectedDate: "2026-06-10",
    manualReason: "Restocking ahead of holiday",
    notes: "",
    lines: [{ orderable_key: "component:c_1", quantity: "10", uom: "UNIT" }],
    ...overrides,
  };
}

describe("validatePoDraft", () => {
  it("V1 manual mode flags an empty reason", () => {
    const errs = validatePoDraft(baseDraft({ manualReason: "" }), "manual");
    expect(errs.manual_reason).toBeTruthy();
  });

  it("V2 manual mode flags a reason shorter than 5 chars", () => {
    const errs = validatePoDraft(baseDraft({ manualReason: "ok" }), "manual");
    expect(errs.manual_reason).toMatch(/at least 5/i);
  });

  it("V3 recommendation mode does NOT require a reason", () => {
    const errs = validatePoDraft(
      baseDraft({ manualReason: "" }),
      "recommendation",
    );
    expect(errs.manual_reason).toBeUndefined();
  });

  it("V4 flags missing supplier and expected date in both modes", () => {
    for (const mode of ["manual", "recommendation"] as const) {
      const errs = validatePoDraft(
        baseDraft({ supplierId: "  ", expectedDate: "" }),
        mode,
      );
      expect(errs.supplier_id).toBeTruthy();
      expect(errs.expected_receive_date).toBeTruthy();
    }
  });

  it("V5 flags line problems: no orderable, blank qty, qty <= 0", () => {
    const noOrderable = validatePoDraft(
      baseDraft({ lines: [{ orderable_key: "", quantity: "5", uom: "UNIT" }] }),
      "manual",
    );
    expect(noOrderable.line_items?.[0]?.orderable_key).toBeTruthy();

    const blankQty = validatePoDraft(
      baseDraft({
        lines: [{ orderable_key: "component:c_1", quantity: "", uom: "UNIT" }],
      }),
      "manual",
    );
    expect(blankQty.line_items?.[0]?.quantity).toBeTruthy();

    const zeroQty = validatePoDraft(
      baseDraft({
        lines: [{ orderable_key: "component:c_1", quantity: "0", uom: "UNIT" }],
      }),
      "manual",
    );
    expect(zeroQty.line_items?.[0]?.quantity).toMatch(/greater than 0/i);
  });

  it("V6 a fully valid manual draft yields no errors", () => {
    expect(Object.keys(validatePoDraft(baseDraft(), "manual"))).toHaveLength(0);
  });
});

// --- PoLineEditor rendering ------------------------------------------------

const ORDERABLES: OrderableRow[] = [
  {
    kind: "component",
    id: "c_1",
    label: "Cardboard box",
    meta: "c_1",
    default_uom: "UNIT",
  },
  {
    kind: "item",
    id: "i_1",
    label: "Finished widget",
    meta: "SKU-1",
    default_uom: "UNIT",
  },
];

const ORDERABLE_OPTIONS: SearchableSelectOption[] = ORDERABLES.map((r) => ({
  value: `${r.kind}:${r.id}`,
  label: r.label,
  meta: r.meta,
  group: r.kind === "item" ? "Finished goods" : "Components",
}));

const SUPPLIER_OPTIONS: SearchableSelectOption[] = [
  { value: "sup_1", label: "Acme Supplies", meta: "sup_1" },
  { value: "sup_2", label: "Bolt Trading", meta: "sup_2" },
];

// --- Tranche 047 (D1) — supplier-item fixtures ------------------------------

function makeSi(over: Partial<SupplierItemRow> = {}): SupplierItemRow {
  return {
    supplier_item_id: "si_1",
    supplier_id: "sup_1",
    component_id: "c_1",
    item_id: null,
    is_primary: false,
    order_uom: "CARTON",
    inventory_uom: "UNIT",
    pack_conversion: "12",
    lead_time_days: 7,
    moq: "24",
    approval_status: "approved",
    std_cost_per_inv_uom: "2.5",
    ...over,
  };
}

const TWO_SUPPLIERS: SupplierItemRow[] = [
  makeSi({ supplier_item_id: "si_1", supplier_id: "sup_1", is_primary: true }),
  makeSi({
    supplier_item_id: "si_2",
    supplier_id: "sup_2",
    lead_time_days: 3,
    std_cost_per_inv_uom: "3",
    moq: "10",
  }),
];

function renderEditor(
  overrides: Partial<PoLineEditorProps> = {},
): PoLineEditorProps {
  const props: PoLineEditorProps = {
    mode: "manual",
    supplierId: "",
    expectedDate: "2026-06-10",
    manualReason: "",
    notes: "",
    lines: [emptyLine()],
    onSupplierChange: vi.fn(),
    onExpectedDateChange: vi.fn(),
    onManualReasonChange: vi.fn(),
    onNotesChange: vi.fn(),
    onAddLine: vi.fn(),
    onRemoveLine: vi.fn(),
    onUpdateLine: vi.fn(),
    errors: {},
    disabled: false,
    supplierOptions: SUPPLIER_OPTIONS,
    orderableOptions: ORDERABLE_OPTIONS,
    orderableByKey: new Map(ORDERABLES.map((r) => [`${r.kind}:${r.id}`, r])),
    suppliersLoading: false,
    itemsLoading: false,
    componentsLoading: false,
    ...overrides,
  };
  render(<PoLineEditor {...props} />);
  return props;
}

describe("PoLineEditor", () => {
  it("R1 renders the reason field in manual mode", () => {
    renderEditor({ mode: "manual" });
    expect(screen.getByTestId("po-new-reason")).toBeTruthy();
  });

  it("R2 hides the reason field in recommendation mode", () => {
    renderEditor({ mode: "recommendation" });
    expect(screen.queryByTestId("po-new-reason")).toBeNull();
  });

  it("R3 add-line button fires onAddLine", async () => {
    const user = userEvent.setup();
    const props = renderEditor();
    await user.click(screen.getByTestId("po-new-add-line"));
    expect(props.onAddLine).toHaveBeenCalledTimes(1);
  });

  it("R4 changing quantity fires onUpdateLine for that line", async () => {
    const user = userEvent.setup();
    const props = renderEditor();
    await user.type(screen.getByTestId("po-new-line-qty-0"), "7");
    expect(props.onUpdateLine).toHaveBeenCalledWith(0, { quantity: "7" });
  });
});

// --- Tranche 047 (D1/D2) — supplier comparison ------------------------------

describe("supplier-item helpers (T047)", () => {
  it("H1 costPerOrderUom = std_cost_per_inv_uom × pack_conversion", () => {
    expect(costPerOrderUom(makeSi())).toBe(30); // 2.5 × 12
    expect(costPerOrderUom(makeSi({ std_cost_per_inv_uom: null }))).toBeNull();
    expect(
      costPerOrderUom(makeSi({ pack_conversion: "not-a-number" })),
    ).toBeNull();
  });

  it("H2 approvedSupplierItems keeps only approval_status='approved'", () => {
    const rows = [makeSi(), makeSi({ approval_status: "pending" })];
    expect(approvedSupplierItems(rows)).toHaveLength(1);
  });

  it("H3 dedupeBySupplier keeps one row per supplier, primary first", () => {
    const rows = [
      makeSi({ supplier_item_id: "a", supplier_id: "sup_1" }),
      makeSi({ supplier_item_id: "b", supplier_id: "sup_1", is_primary: true }),
      makeSi({ supplier_item_id: "c", supplier_id: "sup_2" }),
    ];
    const out = dedupeBySupplier(rows);
    expect(out).toHaveLength(2);
    expect(out[0].supplier_item_id).toBe("b");
  });
});

// --- Price/cost accuracy — line price insight -------------------------------

describe("computeLinePriceInsight", () => {
  it("P1 line total uses the entered price when given", () => {
    const i = computeLinePriceInsight("10", "5", 4);
    expect(i.lineTotal).toBe(50);
    expect(i.effectiveSource).toBe("entered");
  });

  it("P2 falls back to the catalog cost when no price is entered", () => {
    const i = computeLinePriceInsight("10", "", 4);
    expect(i.lineTotal).toBe(40);
    expect(i.effectiveSource).toBe("catalog");
    expect(i.variancePct).toBeNull();
  });

  it("P3 no line total without a positive quantity", () => {
    expect(computeLinePriceInsight("0", "5", 4).lineTotal).toBeNull();
    expect(computeLinePriceInsight("", "5", 4).lineTotal).toBeNull();
  });

  it("P4 small deltas stay quiet (none)", () => {
    expect(computeLinePriceInsight("1", "4.1", 4).varianceLevel).toBe("none");
  });

  it("P5 a normal increase reads as info", () => {
    const i = computeLinePriceInsight("1", "4.8", 4); // +20%
    expect(i.varianceLevel).toBe("info");
    expect(Math.round((i.variancePct ?? 0) * 100)).toBe(20);
  });

  it("P6 a large delta reads as warn", () => {
    expect(computeLinePriceInsight("1", "6", 4).varianceLevel).toBe("warn"); // +50%
  });

  it("P7 a 10× fat-finger reads as high", () => {
    const i = computeLinePriceInsight("1", "125", 12.5); // +900%
    expect(i.varianceLevel).toBe("high");
  });

  it("P8 no variance when there is no catalog cost to compare", () => {
    const i = computeLinePriceInsight("1", "5", null);
    expect(i.variancePct).toBeNull();
    expect(i.varianceLevel).toBe("none");
    expect(i.lineTotal).toBe(5);
  });
});

describe("PoLineEditor price insight rendering", () => {
  const SI = new Map([
    ["component:c_1", [TWO_SUPPLIERS[0]]], // sup_1 catalog = 2.5 × 12 = ₪30/CARTON
  ]);

  it("PR1 shows a line total once qty + price are present", () => {
    renderEditor({
      supplierId: "sup_1",
      lines: [{ orderable_key: "component:c_1", quantity: "2", uom: "UNIT" }],
      supplierItemsByOrderable: SI,
    });
    expect(
      screen.getByTestId("po-new-line-price-insight-0").textContent,
    ).toContain("Line total");
  });

  it("PR2 flags a fat-finger price as a high-severity variance", () => {
    renderEditor({
      supplierId: "sup_1",
      lines: [
        {
          orderable_key: "component:c_1",
          quantity: "2",
          uom: "UNIT",
          unit_price_net: "300", // 10× the ₪30 catalog cost
        },
      ],
      supplierItemsByOrderable: SI,
    });
    const chip = screen.getByTestId("po-new-line-price-variance-0");
    expect(chip.getAttribute("data-variance-level")).toBe("high");
    expect(chip.textContent).toContain("vs catalog");
  });

  it("PR3 no variance chip when the entered price matches the catalog", () => {
    renderEditor({
      supplierId: "sup_1",
      lines: [
        {
          orderable_key: "component:c_1",
          quantity: "2",
          uom: "UNIT",
          unit_price_net: "30",
        },
      ],
      supplierItemsByOrderable: SI,
    });
    expect(screen.queryByTestId("po-new-line-price-variance-0")).toBeNull();
  });
});

describe("PoLineEditor supplier comparison strip (T047)", () => {
  const LINE = { orderable_key: "component:c_1", quantity: "10", uom: "UNIT" as const };

  it("S1 renders the strip for a multi-supplier line, primary pre-selected", () => {
    renderEditor({
      supplierId: "sup_1",
      lines: [LINE],
      supplierItemsByOrderable: new Map([["component:c_1", TWO_SUPPLIERS]]),
    });
    expect(screen.getByTestId("po-new-line-suppliers-0")).toBeTruthy();
    const primaryChip = screen.getByTestId("po-new-line-supplier-chip-0-si_1");
    const otherChip = screen.getByTestId("po-new-line-supplier-chip-0-si_2");
    expect(primaryChip.getAttribute("aria-checked")).toBe("true");
    expect(otherChip.getAttribute("aria-checked")).toBe("false");
    // Chip caption: name · ₪cost-per-order-uom · Xd lead · MOQ Y
    expect(otherChip.textContent).toContain("Bolt Trading");
    expect(otherChip.textContent).toContain("₪36"); // 3 × 12
    expect(otherChip.textContent).toContain("3d lead");
    expect(otherChip.textContent).toContain("MOQ 10");
  });

  it("S2 selecting a chip pins the line's supplier_item_id", async () => {
    const user = userEvent.setup();
    const props = renderEditor({
      supplierId: "sup_1",
      lines: [LINE],
      supplierItemsByOrderable: new Map([["component:c_1", TWO_SUPPLIERS]]),
    });
    await user.click(screen.getByTestId("po-new-line-supplier-chip-0-si_2"));
    expect(props.onUpdateLine).toHaveBeenCalledWith(0, {
      supplier_item_id: "si_2",
    });
  });

  it("S3 no strip for a single-supplier line", () => {
    renderEditor({
      supplierId: "sup_1",
      lines: [LINE],
      supplierItemsByOrderable: new Map([
        ["component:c_1", [TWO_SUPPLIERS[0]]],
      ]),
    });
    expect(screen.queryByTestId("po-new-line-suppliers-0")).toBeNull();
  });

  it("S4 warns when the header supplier has no approved mapping", () => {
    renderEditor({
      supplierId: "sup_2",
      lines: [LINE],
      supplierItemsByOrderable: new Map([
        ["component:c_1", [TWO_SUPPLIERS[0]]], // only sup_1 approved
      ]),
    });
    const warning = screen.getByTestId("po-new-line-no-mapping-0");
    expect(warning.textContent).toContain("Bolt Trading");
    expect(warning.textContent).toContain("has no mapping for this item");
  });

  it("S5 no warning while supplier items are not yet resolved", () => {
    renderEditor({
      supplierId: "sup_2",
      lines: [LINE],
      supplierItemsByOrderable: new Map(), // not fetched yet
    });
    expect(screen.queryByTestId("po-new-line-no-mapping-0")).toBeNull();
  });

  it("S6 MOQ hint under qty + catalog price placeholder", () => {
    renderEditor({
      supplierId: "sup_1",
      lines: [LINE],
      supplierItemsByOrderable: new Map([
        ["component:c_1", [TWO_SUPPLIERS[0]]],
      ]),
    });
    expect(screen.getByTestId("po-new-line-moq-0").textContent).toContain(
      "MOQ 24 CARTON",
    );
    const price = screen.getByTestId(
      "po-new-line-price-0",
    ) as HTMLInputElement;
    expect(price.placeholder).toContain("₪30");
    expect(price.placeholder).toContain("CARTON");
  });

  it("S7 renders the expected-date lead-time hint when provided", () => {
    renderEditor({ expectedDateHint: "based on 7-day lead time" });
    expect(
      screen.getByTestId("po-new-expected-date-hint").textContent,
    ).toContain("based on 7-day lead time");
  });
});
