// PlacementRow tests — tranche 086 Part A.
//
// Guards the money path: a PO is NOT placed until a payment term is chosen and
// every open line carries a positive price. (The backend has its own 10/10
// place-contract tests; this pins the client-side guard + line rendering.)

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

  it("loads the quantity field pre-filled with ordered_qty and sends an edited value as a line_qty_override", async () => {
    let placeBody: unknown = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/purchase-order-lines")) {
          return new Response(JSON.stringify(LINES), { status: 200 });
        }
        if (url.includes("/place")) {
          placeBody = init?.body ? JSON.parse(String(init.body)) : null;
          return new Response(JSON.stringify({ row: {} }), { status: 200 });
        }
        return new Response(JSON.stringify({ row: {} }), { status: 200 });
      },
    );

    renderRow();
    await userEvent.click(screen.getByTestId("placement-row-toggle-po1"));

    const qtyInput = (await screen.findByTestId(
      "placement-qty-l1",
    )) as HTMLInputElement;
    // Pre-loaded for editing with the line's ordered_qty (was static text).
    expect(qtyInput.value).toBe("5");

    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, "8");

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
    await userEvent.click(submitBtn);
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "בצע הזמנה" }),
    );

    await waitFor(() => expect(placeBody).not.toBeNull());
    expect(
      (
        placeBody as {
          line_qty_overrides?: { po_line_id: string; ordered_qty: number }[];
        }
      ).line_qty_overrides,
    ).toEqual([{ po_line_id: "l1", ordered_qty: 8 }]);
  });

  it("blocks placing when the quantity is cleared to zero/invalid", async () => {
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

    const qtyInput = (await screen.findByTestId(
      "placement-qty-l1",
    )) as HTMLInputElement;
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, "0");

    const priceInput = await screen.findByTestId("placement-price-l1");
    await userEvent.type(priceInput, "12.5");
    const termSelect = screen.getByTestId(
      "placement-terms-po1",
    ) as HTMLSelectElement;
    await userEvent.selectOptions(termSelect, termSelect.options[1].value);

    const submitBtn = screen.getByTestId(
      "placement-submit-po1",
    ) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });
});
