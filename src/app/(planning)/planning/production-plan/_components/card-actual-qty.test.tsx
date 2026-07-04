// Hero-quantity tests — verifies WHICH quantity the card shows as its
// dominant number.
//
// Contract (Tom, 2026-06-25): once a production plan has been reported, the
// card must show the quantity that was ACTUALLY produced, not the original
// plan. The plan survives as a small "vs planned" context line. Open
// (not-yet-reported) plans keep showing the planned target as the hero.

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductionJobCard } from "./ProductionJobCard";
import type { ProductionPlanRow, RenderedState } from "../_lib/types";

function row(overrides: Partial<ProductionPlanRow>): ProductionPlanRow {
  const rendered = (overrides.rendered_state ?? "planned") as RenderedState;
  return {
    plan_id: "p-1",
    plan_type: "production",
    plan_date: "2026-06-25",
    item_id: "FG-X",
    item_name: "Detox 1L",
    item_supply_method: "MANUFACTURED",
    planned_qty: "50",
    uom: "BAG",
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
    created_at: "2026-06-25T00:00:00Z",
    updated_at: "2026-06-25T00:00:00Z",
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

function doneRow(outputQty: string): ProductionPlanRow {
  const variance = (parseFloat(outputQty) - 50).toString();
  return row({
    rendered_state: "done",
    status: "completed",
    completed_submission_id: "s-1",
    completed_actual: {
      submission_id: "s-1",
      event_at: "2026-06-25T10:00:00Z",
      output_qty: outputQty,
      scrap_qty: "0",
      output_uom: "BAG",
      variance_qty: variance,
      variance_pct: ((parseFloat(variance) / 50) * 100).toString(),
    },
  });
}

function renderCard(plan: ProductionPlanRow) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProductionJobCard
        plan={plan}
        canAct
        isToday
        isPast={false}
        onEdit={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
        onAdjustRecipe={() => {}}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());

describe("ProductionJobCard hero quantity", () => {
  it("shows the PLANNED quantity as the hero on an unreported plan", () => {
    renderCard(row({ rendered_state: "planned", planned_qty: "50" }));
    expect(screen.getByTestId("plan-card-hero-qty").textContent).toContain("50");
    expect(screen.queryByTestId("plan-card-produced-label")).toBeNull();
  });

  it("shows the ACTUAL produced quantity as the hero once reported", () => {
    // Planned 50, produced 48 → hero must read 48, not 50.
    renderCard(doneRow("48"));
    const hero = screen.getByTestId("plan-card-hero-qty");
    expect(hero.textContent).toContain("48");
    expect(hero.textContent).not.toContain("50");
    // The "Produced" eyebrow makes the meaning explicit.
    expect(screen.queryByTestId("plan-card-produced-label")).not.toBeNull();
  });

  it("keeps the planned target visible as context after reporting", () => {
    renderCard(doneRow("48"));
    // Footer carries the original plan so the operator still sees the target.
    expect(screen.queryByText(/vs planned/i)).not.toBeNull();
    expect(screen.queryByText("50 BAG")).not.toBeNull();
  });

  it("shows an over-production actual (62 produced vs 50 planned)", () => {
    renderCard(doneRow("62"));
    expect(screen.getByTestId("plan-card-hero-qty").textContent).toContain("62");
  });

  it("reflects the actual produced quantity in the inventory-impact banner", async () => {
    renderCard(doneRow("48"));
    // Open the inventory-impact disclosure.
    screen.getByTestId("chip-impact-toggle").click();
    const panel = await screen.findByTestId("impact-panel");
    // The "+N of <item> to finished goods" banner must show actual (48), not 50.
    expect(within(panel).queryByText(/\+48 BAG/)).not.toBeNull();
  });
});
