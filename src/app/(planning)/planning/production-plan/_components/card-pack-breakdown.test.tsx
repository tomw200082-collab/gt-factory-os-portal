// Base-batch pack-breakdown regression test (Tom 2026-07-04).
//
// A base-batch card used to collapse to "Base batch · N SKUs" with no way
// to see which products were actually in the batch without opening the
// production report. The card now lists each pack_manifest line (item
// name + qty) directly.

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductionJobCard } from "./ProductionJobCard";
import type { ProductionPlanRow, RenderedState } from "../_lib/types";

function row(overrides: Partial<ProductionPlanRow>): ProductionPlanRow {
  const rendered = (overrides.rendered_state ?? "planned") as RenderedState;
  return {
    plan_id: "p-1",
    plan_type: "production",
    plan_date: "2026-06-17",
    item_id: null,
    item_name: null,
    item_supply_method: null,
    planned_qty: "500",
    uom: "L",
    status: rendered === "cancelled" ? "cancelled" : "planned",
    rendered_state: rendered,
    base_bom_head_id: "BOM-BASE-DET-REG",
    is_base_batch: true,
    pack_manifest_count: 2,
    pack_manifest: [],
    source_recommendation_id: null,
    source_run_id: null,
    source_run_status: null,
    source_recommendation_qty: null,
    bom_version_id_pinned: null,
    bom_version_label: null,
    notes: null,
    created_by_user_id: "u-1",
    created_by_snapshot: "Tester",
    created_at: "2026-06-17T00:00:00Z",
    updated_at: "2026-06-17T00:00:00Z",
    updated_by_user_id: null,
    updated_by_snapshot: null,
    cancelled_at: null,
    cancelled_by_user_id: null,
    cancel_reason: null,
    completed_submission_id: null,
    completed_actual: null,
    ...overrides,
  };
}

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const noop = () => {};

afterEach(() => cleanup());

describe("ProductionJobCard pack breakdown", () => {
  it("lists each product name and qty for a base-batch card", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({
          pack_manifest: [
            { item_id: "FG-DET-1L", item_name: "DETOX 1L", qty: "363", uom: "BOTTLE" },
            { item_id: "FG-DET-500ML", item_name: "DETOX 0.5L", qty: "275", uom: "BOTTLE" },
          ],
        })}
        canAct
        isToday={false}
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    const list = screen.getByTestId("plan-card-pack-breakdown");
    expect(list.textContent).toContain("DETOX 1L");
    expect(list.textContent).toContain("363");
    expect(list.textContent).toContain("DETOX 0.5L");
    expect(list.textContent).toContain("275");
  });

  it("falls back to the item_id when a line has no resolved name", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({
          pack_manifest: [{ item_id: "FG-MYSTERY", item_name: null, qty: "10", uom: null }],
        })}
        canAct
        isToday={false}
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.getByTestId("plan-card-pack-breakdown").textContent).toContain("FG-MYSTERY");
  });

  it("renders nothing when pack_manifest is empty or absent (older API deploys)", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({ pack_manifest: [] })}
        canAct
        isToday={false}
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.queryByTestId("plan-card-pack-breakdown")).toBeNull();
  });

  it("does not render a breakdown for a non-base-batch (single-item) card", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({
          is_base_batch: false,
          base_bom_head_id: null,
          item_id: "FG-DET-1L",
          item_name: "DETOX 1L",
          pack_manifest: [{ item_id: "FG-DET-1L", item_name: "DETOX 1L", qty: "363", uom: "BOTTLE" }],
        })}
        canAct
        isToday={false}
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.queryByTestId("plan-card-pack-breakdown")).toBeNull();
  });
});
