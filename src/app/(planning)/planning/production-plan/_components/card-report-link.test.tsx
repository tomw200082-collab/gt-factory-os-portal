// Base-batch report-link regression test.
//
// Historically the "Open Production Report" link deep-linked into the old
// /stock/production-actual form with from_plan_id/item_id/suggested_qty
// query params (a base-batch row has item_id = null, so a naive link would
// have pre-filled the wrong quantity and no product).
//
// Tranche 143 cut this link over to a plain "/production" — the Today list —
// which meant a plan card could not actually reach a report: the list is
// today-only, so a past plan dead-ended, and even today's plan made the
// operator hunt for the right run.
//
// Tranche 147 re-attaches the context the link needs. The href carries the
// plan's own date (past days included) plus its plan_id and report=1, so
// /production scopes to that plan and forwards a single-run plan straight to
// its pre-filled report form.

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
    base_bom_head_id: "BOM-BASE",
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

function reportHref(plan: ProductionPlanRow, isToday = false): string {
  renderWithQuery(
    <ProductionJobCard
      plan={plan}
      canAct
      isToday={isToday}
      isPast={false}
      onEdit={noop}
      onCancel={noop}
      onDelete={noop}
      onAdjustRecipe={noop}
    />,
  );
  return screen.getByTestId("plan-row-report").getAttribute("href") ?? "";
}

afterEach(() => cleanup());

describe("ProductionJobCard production-report link", () => {
  it("base-batch card carries the plan's date, plan_id and report intent", () => {
    const href = reportHref(row({ is_base_batch: true, item_id: null }));
    expect(href).toBe("/production?date=2026-06-17&plan=p-1&report=1");
  });

  it("uses the PLAN's date, not today — a past plan must still be reportable", () => {
    const href = reportHref(
      row({ plan_id: "p-past", plan_date: "2026-05-04", is_base_batch: false, item_id: "FG-1" }),
    );
    expect(href).toContain("date=2026-05-04");
    expect(href).toContain("plan=p-past");
  });

  it("does not depend on isToday — the same href reports today or after the fact", () => {
    const plan = row({ is_base_batch: false, item_id: "FG-1", item_name: "DETOX 1L" });
    const asToday = reportHref(plan, true);
    cleanup(); // reportHref renders; a second render would double the testid
    expect(reportHref(plan, false)).toBe(asToday);
  });

  it("base-batch report CTA reads 'Report products' (plural, multi-SKU)", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({ is_base_batch: true, item_id: null })}
        canAct
        isToday
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.getByTestId("plan-row-report").textContent).toContain(
      "Report products",
    );
  });

  it("single-item card links to its own plan, scoped and asking for the report", () => {
    const href = reportHref(
      row({
        is_base_batch: false,
        base_bom_head_id: null,
        item_id: "FG-DET-1L",
        item_name: "DETOX 1L",
        planned_qty: "363",
        pack_manifest: [],
      }),
    );
    expect(href).toBe("/production?date=2026-06-17&plan=p-1&report=1");
  });

  it("single-item CTA label reflects today vs past", () => {
    renderWithQuery(
      <ProductionJobCard
        plan={row({
          is_base_batch: false,
          base_bom_head_id: null,
          item_id: "FG-DET-1L",
          item_name: "DETOX 1L",
        })}
        canAct
        isToday
        isPast={false}
        onEdit={noop}
        onCancel={noop}
        onDelete={noop}
        onAdjustRecipe={noop}
      />,
    );
    expect(screen.getByTestId("plan-row-report").textContent).toContain(
      "Report production",
    );
  });
});
