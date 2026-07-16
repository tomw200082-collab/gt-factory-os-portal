// PlacementRow tests — tranche 086 Part A.
//
// Guards the money path: a PO is NOT placed until a payment term is chosen and
// every open line carries a positive price. (The backend has its own 10/10
// place-contract tests; this pins the client-side guard + line rendering.)

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PlacementRow } from "./PlacementRow";
import type { QueuePo } from "../_lib/api";

const PO: QueuePo = {
  po_id: "po1",
  po_number: "PO-2026-00001",
  supplier_id: "sup1",
  supplier_name: "אקמה",
  status: "APPROVED_TO_ORDER",
  expected_receive_date: "2026-06-30",
  currency: "ILS",
  total_net: "0",
  order_by_date: "2026-06-25",
  tier: "must",
  order_document_text: null,
};

const LINES = {
  rows: [
    {
      po_line_id: "l1",
      line_number: 1,
      component_name: "רכיב א",
      item_name: null,
      component_id: "c1",
      item_id: null,
      ordered_qty: "5",
      uom: "UNIT",
      line_status: "OPEN",
      unit_price_net: null,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderRow() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PlacementRow po={PO} />
    </QueryClientProvider>,
  );
}

describe("PlacementRow", () => {
  it("blocks placing without a payment term — submit stays disabled with an explanatory title (DR-018 INTER-003)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/purchase-order-lines")) {
          return new Response(JSON.stringify(LINES), { status: 200 });
        }
        // The place endpoint must NOT be reached in this test.
        return new Response(JSON.stringify({ row: {} }), { status: 200 });
      });

    renderRow();
    await userEvent.click(screen.getByTestId("placement-row-toggle-po1"));

    // Lines arrived → a price input is shown.
    const priceInput = await screen.findByTestId("placement-price-l1");
    expect(priceInput).toBeTruthy();

    // Before a price is entered, the submit button is already disabled.
    const submitBtn = screen.getByTestId(
      "placement-submit-po1",
    ) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    // Enter a price but choose NO term — still disabled, with a Hebrew
    // tooltip explaining why (INTER-003: this used to be clickable and only
    // validated post-click).
    await userEvent.type(priceInput, "12.5");
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.getAttribute("title")).toContain("מחיר");
    expect(submitBtn.getAttribute("title")).toContain("תנאי תשלום");

    // A disabled button does not fire clicks — the place mutation endpoint
    // must never be reached from this state.
    await userEvent.click(submitBtn);
    const placeCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/place"),
    );
    expect(placeCalls.length).toBe(0);
  });

  it("enables the submit button once every line has a price and a term is chosen", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/purchase-order-lines")) {
          return new Response(JSON.stringify(LINES), { status: 200 });
        }
        return new Response(JSON.stringify({ row: {} }), { status: 200 });
      },
    );

    renderRow();
    await userEvent.click(screen.getByTestId("placement-row-toggle-po1"));
    const priceInput = await screen.findByTestId("placement-price-l1");
    await userEvent.type(priceInput, "12.5");

    const termSelect = screen.getByTestId(
      "placement-terms-po1",
    ) as HTMLSelectElement;
    await userEvent.selectOptions(termSelect, termSelect.options[1].value);

    const submitBtn = screen.getByTestId(
      "placement-submit-po1",
    ) as HTMLButtonElement;
    await waitFor(() => expect(submitBtn.disabled).toBe(false));
  });

  it("cancel-with-reason: discard stays disabled until a reason is chosen (Tom-directed 2026-07-16)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        new Response(JSON.stringify({ rows: [] }), { status: 200 }),
      );

    renderRow();

    // Open the cancel panel from the header (no need to expand the lines).
    await userEvent.click(screen.getByTestId("placement-cancel-toggle-po1"));

    const cancelBtn = screen.getByTestId(
      "placement-cancel-submit-po1",
    ) as HTMLButtonElement;
    // No reason yet → disabled with an explanatory title.
    expect(cancelBtn.disabled).toBe(true);
    expect(cancelBtn.getAttribute("title")).toContain("סיבת");

    // A disabled discard button must not reach the cancel endpoint.
    await userEvent.click(cancelBtn);
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes("/cancel"))
        .length,
    ).toBe(0);

    // Choose a preset reason → discard enables.
    const reasonSelect = screen.getByTestId(
      "placement-cancel-reason-po1",
    ) as HTMLSelectElement;
    await userEvent.selectOptions(reasonSelect, "כפילות");
    await waitFor(() => expect(cancelBtn.disabled).toBe(false));
  });
});
