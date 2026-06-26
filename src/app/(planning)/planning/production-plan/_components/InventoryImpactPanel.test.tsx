// InventoryImpactPanel — error/retry affordance (Tranche 090, INTER-011).
//
// When the BOM snapshot fetch fails, the panel must surface an in-place retry
// so the planner doesn't have to close and reopen the card to recover.

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InventoryImpactPanel } from "./InventoryImpactPanel";
import type { ProductionPlanRow } from "../_lib/types";

function row(overrides: Partial<ProductionPlanRow> = {}): ProductionPlanRow {
  return {
    plan_id: "p-1",
    plan_type: "production",
    plan_date: "2026-06-17",
    item_id: "FG-X",
    item_name: "Item X",
    item_supply_method: "MANUFACTURED",
    planned_qty: "100",
    uom: "BOTTLE",
    status: "planned",
    rendered_state: "planned",
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

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InventoryImpactPanel
        open
        plan={row()}
        cardTitle="Item X"
        heroQty={100}
        heroQtyStr="100"
        heroUom="BOTTLE"
      />
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());
beforeEach(() => vi.restoreAllMocks());

describe("InventoryImpactPanel retry (INTER-011)", () => {
  it("shows a retry affordance when the BOM fetch fails, and re-fetches on click", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => null } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    renderPanel();

    const retry = await screen.findByTestId("impact-bom-retry");
    expect(retry.textContent).toContain("Try again");

    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(retry);

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });
});
