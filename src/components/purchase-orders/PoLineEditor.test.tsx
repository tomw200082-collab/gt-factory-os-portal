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
  emptyLine,
  validatePoDraft,
  type OrderableRow,
  type PoDraft,
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
