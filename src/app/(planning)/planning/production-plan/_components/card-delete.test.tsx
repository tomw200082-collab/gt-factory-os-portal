// Card delete-affordance tests — verifies WHICH states expose a delete button.
//
// Delete is available to planner/admin (canAct) on any not-yet-produced row
// (rendered_state 'planned' or 'cancelled'); never on 'done' rows; never when
// the viewer can't act. Covers both ProductionJobCard and ProductionNoteCard.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductionJobCard } from "./ProductionJobCard";
import { ProductionNoteCard } from "./ProductionNoteCard";
import type { ProductionPlanRow, RenderedState } from "../_lib/types";

function row(overrides: Partial<ProductionPlanRow>): ProductionPlanRow {
  const rendered = (overrides.rendered_state ?? "planned") as RenderedState;
  return {
    plan_id: "p-1",
    plan_type: "production",
    plan_date: "2026-06-17",
    item_id: "FG-X",
    item_name: "Item X",
    item_supply_method: "MANUFACTURED",
    planned_qty: "100",
    uom: "BOTTLE",
    status: rendered === "cancelled" ? "cancelled" : "planned",
    rendered_state: rendered,
    base_bom_head_id: null,
    is_base_batch: false,
    pack_manifest_count: 0,
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

describe("ProductionJobCard delete affordance", () => {
  it("shows delete on a planned card and fires onDelete with the plan", () => {
    const plan = row({ rendered_state: "planned" });
    const onDelete = vi.fn();
    renderWithQuery(
      <ProductionJobCard
        plan={plan}
        canAct
        isToday
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={onDelete}
        onAdjustRecipe={noop}
      />,
    );
    const btn = screen.getByTestId("plan-row-delete");
    fireEvent.click(btn);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(plan);
  });

  it("shows delete on a cancelled card", () => {
    const plan = row({ rendered_state: "cancelled", cancel_reason: "x" });
    const onDelete = vi.fn();
    renderWithQuery(
      <ProductionJobCard
        plan={plan}
        canAct
        isToday={false}
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={onDelete}
        onAdjustRecipe={noop}
      />,
    );
    fireEvent.click(screen.getByTestId("plan-row-delete"));
    expect(onDelete).toHaveBeenCalledWith(plan);
  });

  it("does NOT show delete on a done card", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({ rendered_state: "done", completed_submission_id: "s-1" })}
        canAct
        isToday={false}
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.queryByTestId("plan-row-delete")).toBeNull();
  });

  it("does NOT show delete on an in_production row (renders 'planned')", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({ rendered_state: "planned", status: "in_production" })}
        canAct
        isToday
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.queryByTestId("plan-row-delete")).toBeNull();
  });

  it("does NOT show delete on a completed base-batch row (status completed, renders 'planned')", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({ rendered_state: "planned", status: "completed", is_base_batch: true, item_id: null, item_name: null, planned_qty: null, uom: null, base_bom_head_id: "BOM-BASE-X", pack_manifest_count: 2 })}
        canAct
        isToday
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.queryByTestId("plan-row-delete")).toBeNull();
  });

  it("does NOT show delete when the user cannot act", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({ rendered_state: "planned" })}
        canAct={false}
        isToday
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.queryByTestId("plan-row-delete")).toBeNull();
  });
});

describe("ProductionNoteCard delete affordance", () => {
  it("shows delete on a planned note", () => {
    const plan = row({ plan_type: "note", rendered_state: "planned", notes: "hi" });
    const onDelete = vi.fn();
    render(
      <ProductionNoteCard plan={plan} canAct onEdit={noop} onCancel={noop} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByTestId("note-card-delete"));
    expect(onDelete).toHaveBeenCalledWith(plan);
  });

  it("shows delete on a cancelled note", () => {
    const plan = row({ plan_type: "note", rendered_state: "cancelled", notes: "hi", cancel_reason: "x" });
    const onDelete = vi.fn();
    render(
      <ProductionNoteCard plan={plan} canAct onEdit={noop} onCancel={noop} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByTestId("note-card-delete"));
    expect(onDelete).toHaveBeenCalledWith(plan);
  });

  it("does NOT show delete on a cancelled note when the user cannot act", () => {
    render(
      <ProductionNoteCard
        plan={row({ plan_type: "note", rendered_state: "cancelled", notes: "hi" })}
        canAct={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
      />,
    );
    expect(screen.queryByTestId("note-card-delete")).toBeNull();
  });
});
