// BatchTuneDialog — meeting-cockpit tune dialog (2026-07-23 gate).
// Covers the liters-meter math, the DTO→dialog mapping, and the dialog's
// dirty/save gating for the base-batch pack-split path.

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

afterEach(cleanup);
import {
  BatchTuneDialog,
  packLiters,
  meterTone,
  tunableFromPlanRow,
  type TunableBatch,
} from "./BatchTuneDialog";
import type { ProductionPlanRow } from "../_lib/types";

describe("packLiters", () => {
  it("sums liters when every line has a known fill", () => {
    const r = packLiters([
      { qty: 365, fill_l_per_unit: 1 },
      { qty: 270, fill_l_per_unit: 0.5 },
    ]);
    expect(r.liters).toBe(500);
    expect(r.units).toBe(635);
  });

  it("degrades to units-only when any fill is unknown", () => {
    const r = packLiters([
      { qty: 100, fill_l_per_unit: 1 },
      { qty: 50, fill_l_per_unit: null },
    ]);
    expect(r.liters).toBeNull();
    expect(r.units).toBe(150);
  });

  it("treats non-finite quantities as zero units", () => {
    const r = packLiters([{ qty: NaN, fill_l_per_unit: 1 }]);
    expect(r.units).toBe(0);
    expect(r.liters).toBe(0);
  });
});

describe("meterTone", () => {
  it("is ok within ±2% of the batch", () => {
    expect(meterTone(500, 500)).toBe("ok");
    expect(meterTone(495, 500)).toBe("ok");
    expect(meterTone(508, 500)).toBe("ok");
  });
  it("flags under and over beyond the band", () => {
    expect(meterTone(450, 500)).toBe("under");
    expect(meterTone(560, 500)).toBe("over");
  });
});

function baseRow(overrides: Partial<ProductionPlanRow> = {}): ProductionPlanRow {
  return {
    plan_id: "p1",
    plan_date: "2026-08-02",
    plan_type: "production",
    item_id: null,
    item_name: null,
    item_supply_method: null,
    planned_qty: "500",
    uom: "L",
    status: "planned",
    rendered_state: "planned",
    base_bom_head_id: "BOM-BASE-DET-REG",
    is_base_batch: true,
    pack_manifest_count: 2,
    pack_manifest: [
      { item_id: "FG-DET-1L", item_name: "DETOX 1L", qty: "365", uom: "BOTTLE", fill_l_per_unit: "1" },
      { item_id: "FG-DET-500ML", item_name: "DETOX 0.5L", qty: "270", uom: "BOTTLE", fill_l_per_unit: "0.5" },
    ],
    is_user_modified: false,
    source_recommendation_id: null,
    source_run_id: null,
    source_run_status: null,
    source_recommendation_qty: null,
    bom_version_id_pinned: null,
    notes: null,
    cancel_reason: null,
    completed_actual: null,
    created_at: "2026-07-23T00:00:00Z",
    updated_at: "2026-07-23T00:00:00Z",
    ...overrides,
  } as ProductionPlanRow;
}

describe("tunableFromPlanRow", () => {
  it("maps a base-batch row: packs parsed, batch size from planned_qty, title from base id", () => {
    const t = tunableFromPlanRow(baseRow());
    expect(t.is_base_batch).toBe(true);
    expect(t.batch_size_l).toBe(500);
    expect(t.planned_qty).toBeNull();
    expect(t.packs).toHaveLength(2);
    expect(t.packs[0]).toMatchObject({ item_id: "FG-DET-1L", qty: 365, fill_l_per_unit: 1 });
    expect(t.title).toContain("DET");
  });

  it("maps an item row: planned_qty numeric, no packs", () => {
    const t = tunableFromPlanRow(
      baseRow({
        is_base_batch: false,
        base_bom_head_id: null,
        item_id: "FG-MAT-30G",
        item_name: "MATCHA 30G",
        planned_qty: "300",
        uom: "TIN",
        pack_manifest: [],
        pack_manifest_count: 0,
      }),
    );
    expect(t.is_base_batch).toBe(false);
    expect(t.planned_qty).toBe(300);
    expect(t.title).toBe("MATCHA 30G");
    expect(t.packs).toHaveLength(0);
  });
});

function renderDialog(batch: TunableBatch) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BatchTuneDialog batch={batch} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("BatchTuneDialog (base batch)", () => {
  const batch = tunableFromPlanRow(baseRow());

  it("renders every pack line with its quantity and a live liters meter", () => {
    renderDialog(batch);
    expect((screen.getByTestId("batch-tune-qty-FG-DET-1L") as HTMLInputElement).value).toBe("365");
    expect((screen.getByTestId("batch-tune-qty-FG-DET-500ML") as HTMLInputElement).value).toBe("270");
    expect(screen.getByTestId("batch-tune-meter").textContent).toContain("500 / 500 L");
  });

  it("keeps Save disabled until something changes, then enables it and updates the meter", () => {
    renderDialog(batch);
    const save = screen.getByTestId("batch-tune-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("batch-tune-qty-FG-DET-1L"), {
      target: { value: "265" },
    });
    expect(screen.getByTestId("batch-tune-meter").textContent).toContain("400 / 500 L");
    expect(save.disabled).toBe(false);
  });

  it("disables Save when a quantity is invalid", () => {
    renderDialog(batch);
    fireEvent.change(screen.getByTestId("batch-tune-qty-FG-DET-1L"), {
      target: { value: "0" },
    });
    expect((screen.getByTestId("batch-tune-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens the cancel panel from the danger zone", () => {
    renderDialog(batch);
    fireEvent.click(screen.getByTestId("batch-tune-cancel-open"));
    expect(screen.queryByTestId("batch-tune-cancel-panel")).not.toBeNull();
    expect(screen.queryByTestId("batch-tune-cancel-confirm")).not.toBeNull();
  });

  it("shows the draft notice only for draft rows", () => {
    renderDialog({ ...batch, status: "draft" });
    expect(screen.queryByTestId("batch-tune-draft-notice")).not.toBeNull();
  });
});
