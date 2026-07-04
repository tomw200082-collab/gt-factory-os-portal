// Overdue-badge regression test.
//
// Bug (found 2026-07-04): the badge fired on any firmed, non-draft card that
// wasn't literally today (isLive && !isDraft && !isToday) — so a firmed batch
// dated days in the FUTURE showed "Overdue" too. Fixed to require isPast
// (the same isPast the day lane already computes from plan_date < today).

import { describe, expect, it, vi, afterEach } from "vitest";
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

describe("ProductionJobCard overdue badge", () => {
  it("does NOT show Overdue on a firmed card dated in the future", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({ rendered_state: "planned", plan_date: "2026-07-12" })}
        canAct
        isToday={false}
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.queryByText("Overdue")).toBeNull();
  });

  it("does NOT show Overdue on today's firmed card", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({ rendered_state: "planned" })}
        canAct
        isToday
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.queryByText("Overdue")).toBeNull();
  });

  it("shows Overdue on a firmed card whose date has actually passed", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({ rendered_state: "planned", plan_date: "2026-06-01" })}
        canAct
        isToday={false}
        isPast
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.queryByText("Overdue")).not.toBeNull();
  });

  it("does NOT show Overdue on a past-dated draft card", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({ rendered_state: "planned", status: "draft", plan_date: "2026-06-01" })}
        canAct
        isToday={false}
        isPast
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.queryByText("Overdue")).toBeNull();
  });
});
