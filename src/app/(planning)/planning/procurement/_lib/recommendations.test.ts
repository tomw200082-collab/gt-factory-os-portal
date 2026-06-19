// fetchApprovedPurchaseRecs — Tranche 072 filtering logic.
//
// Locks the rule that Procurement only ever offers to convert PURCHASE
// recommendations that are APPROVED and not yet converted, sourced from the
// latest completed run.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchApprovedPurchaseRecs } from "./recommendations";

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchSequence(
  responses: Array<{ ok?: boolean; status?: number; json: unknown }>,
): void {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const r = responses[Math.min(i, responses.length - 1)];
      i += 1;
      return {
        ok: r.ok ?? true,
        status: r.status ?? 200,
        json: async () => r.json,
        text: async () => JSON.stringify(r.json),
      } as Response;
    }),
  );
}

function rec(overrides: Record<string, unknown>) {
  return {
    recommendation_id: "r",
    recommendation_type: "purchase",
    recommendation_status: "approved",
    item_id: "i",
    item_name: "Item",
    recommended_qty: "1",
    uom: "L",
    supplier_name: null,
    order_by_date: null,
    due_date: null,
    converted_to_po_id: null,
    ...overrides,
  };
}

describe("fetchApprovedPurchaseRecs", () => {
  it("returns only approved, unconverted, purchase recs from the latest run", async () => {
    mockFetchSequence([
      { json: { rows: [{ run_id: "RUN-1" }] } },
      {
        json: {
          rows: [
            rec({ recommendation_id: "r1", item_name: "Mojito mix" }),
            rec({ recommendation_id: "r2", converted_to_po_id: "PO-9" }), // already a PO
            rec({ recommendation_id: "r3", recommendation_status: "pending_approval" }),
            rec({ recommendation_id: "r4", recommendation_type: "production" }),
          ],
        },
      },
    ]);
    const recs = await fetchApprovedPurchaseRecs();
    expect(recs.map((r) => r.recommendation_id)).toEqual(["r1"]);
    expect(recs[0].item_name).toBe("Mojito mix");
  });

  it("returns [] when there is no completed run", async () => {
    mockFetchSequence([{ json: { rows: [] } }]);
    expect(await fetchApprovedPurchaseRecs()).toEqual([]);
  });

  it("returns [] on 404 at the runs step", async () => {
    mockFetchSequence([{ ok: false, status: 404, json: {} }]);
    expect(await fetchApprovedPurchaseRecs()).toEqual([]);
  });

  it("returns [] on 404 at the recommendations step", async () => {
    mockFetchSequence([
      { json: { rows: [{ run_id: "RUN-1" }] } },
      { ok: false, status: 404, json: {} },
    ]);
    expect(await fetchApprovedPurchaseRecs()).toEqual([]);
  });
});
