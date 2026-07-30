// PlacementRow tests — tranche 086 Part A.
//
// Guards the money path: a PO is NOT placed until a payment term is chosen and
// every open line carries a positive price. (The backend has its own 10/10
// place-contract tests; this pins the client-side guard + line rendering.)

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
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
  supplier_phone: "050-999 8888",
  candidate_suppliers: [
    {
      supplier_id: "sup1",
      supplier_name: "אקמה",
      phone: "050-999 8888",
      is_primary: false,
      is_current: true,
      unit_cost: 0,
      lead_time_days: null,
      moq: null,
    },
    {
      supplier_id: "sup2",
      supplier_name: "ספק חלופי",
      phone: "050-777 6666",
      is_primary: false,
      is_current: false,
      unit_cost: 0,
      lead_time_days: null,
      moq: null,
    },
  ],
  status: "APPROVED_TO_ORDER",
  expected_receive_date: "2026-06-30",
  currency: "ILS",
  total_net: "0",
  scheduled_order_date: "2026-06-25",
  latest_safe_order_date: "2026-06-25",
  planned_receive_date: "2026-06-30",
  as_of_date: "2026-06-25",
  due_state: "today",
  risk_state: "ok",
  priority_bucket: 2,
  line_count: 1,
  total_ordered_qty: "5",
  total_received_qty: "0",
  total_open_qty: "5",
  updated_at: "2026-06-25T08:00:00.000Z",
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

// Tranche 150: two lines, so a whole-line split still leaves something to
// place (one line + "not supplied" would be a discard, not a partial).
const LINES_TWO = {
  rows: [
    LINES.rows[0],
    {
      po_line_id: "l2",
      line_number: 2,
      component_name: "רכיב ב",
      item_name: null,
      component_id: "c2",
      item_id: null,
      ordered_qty: "8",
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
  if (!vi.isMockFunction(globalThis.fetch)) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/purchase-order-lines")) {
        return new Response(JSON.stringify(LINES), { status: 200 });
      }
      return new Response(JSON.stringify({ row: {} }), { status: 200 });
    });
  }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PlacementRow po={PO} />
    </QueryClientProvider>,
  );
}

describe("PlacementRow", () => {
  it("exposes the supplier as a labelled attribute with a click-to-call link in the expanded panel (tranche 140)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify(LINES), { status: 200 });
    });
    renderRow();
    await userEvent.click(screen.getByTestId("placement-row-toggle-po1"));
    await screen.findByTestId("placement-price-l1");
    const call = screen.getByRole("link", { name: /התקשר/ });
    expect(call.getAttribute("href")).toBe("tel:0509998888");
  });

  it("switches the whole PO to another candidate supplier (tranche 140)", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/purchase-order-lines")) {
          return new Response(JSON.stringify(LINES), { status: 200 });
        }
        return new Response(JSON.stringify({ row: {} }), { status: 200 });
      });

    renderRow();
    await userEvent.click(screen.getByTestId("placement-row-toggle-po1"));
    await screen.findByTestId("placement-price-l1");

    await userEvent.click(screen.getByRole("button", { name: /החלף ספק/ }));
    // The alternative supplier is offered.
    expect(screen.getByText("ספק חלופי")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /העבר לספק/ }));

    const switchCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/switch-supplier"),
    );
    expect(switchCalls.length).toBe(1);
    const body = JSON.parse(String((switchCalls[0][1] as RequestInit).body));
    expect(body.target_supplier_id).toBe("sup2");
  });

  it("blocks placing without a payment term — submit stays blocked and says why (DR-018 INTER-003, A11Y-101)", async () => {
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

    // Before a price is entered, the submit button is already blocked.
    // ux-release-gate 2026-07-30 A11Y-101: the block is `aria-disabled`, not
    // `disabled` — a `disabled` button leaves the tab sequence, so the one
    // sentence explaining what is missing became unreachable by keyboard and
    // screen reader. The button stays focusable; a click guard does the work.
    const submitBtn = screen.getByTestId(
      "placement-submit-po1",
    ) as HTMLButtonElement;
    expect(submitBtn.getAttribute("aria-disabled")).toBe("true");
    expect(submitBtn.disabled).toBe(false);

    // Enter a price but choose NO term — still blocked, with the reason in
    // both the tooltip and on-screen text (INTER-003: this used to be
    // clickable and only validated post-click).
    await userEvent.type(priceInput, "12.5");
    expect(submitBtn.getAttribute("aria-disabled")).toBe("true");
    expect(submitBtn.getAttribute("title")).toContain("מחיר");
    expect(submitBtn.getAttribute("title")).toContain("תנאי תשלום");
    const blocked = screen.getByTestId("placement-blocked-po1");
    expect(blocked.textContent).toContain("תנאי תשלום");
    expect(submitBtn.getAttribute("aria-describedby")).toBe(
      "placement-blocked-po1",
    );

    // The click guard replaces `disabled`: the place endpoint must never be
    // reached from this state.
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
    await waitFor(() =>
      expect(submitBtn.getAttribute("aria-disabled")).toBeNull(),
    );
    expect(screen.queryByTestId("placement-blocked-po1")).toBeNull();
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

  it("expand and cancel panels are mutually exclusive (ux-release-gate 2026-07-21 INT-102)", async () => {
    renderRow();
    const expandToggle = screen.getByTestId("placement-row-toggle-po1");
    const cancelToggle = screen.getByTestId("placement-cancel-toggle-po1");

    await userEvent.click(expandToggle);
    expect(expandToggle.getAttribute("aria-expanded")).toBe("true");

    // Opening cancel closes expand — "בצע הזמנה" and "בטל הזמנה" must never
    // be presented stacked in the same row.
    await userEvent.click(cancelToggle);
    expect(cancelToggle.getAttribute("aria-expanded")).toBe("true");
    expect(expandToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("placement-cancel-panel-po1")).not.toBeNull();

    // And opening expand closes cancel.
    await userEvent.click(expandToggle);
    expect(expandToggle.getAttribute("aria-expanded")).toBe("true");
    expect(cancelToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("placement-cancel-panel-po1")).toBeNull();
  });
  // -------------------------------------------------------------------------
  // Tranche 150 — partial placement (backend 0298)
  // -------------------------------------------------------------------------
  async function openWithLines(payload: unknown) {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/purchase-order-lines")) {
          return new Response(JSON.stringify(payload), { status: 200 });
        }
        return new Response(
          JSON.stringify({ po_id: "po1", po_number: "PO-2026-00001", status: "OPEN", split_po_id: "PO-2026-00042" }),
          { status: 200 },
        );
      });
    renderRow();
    await userEvent.click(screen.getByTestId("placement-row-toggle-po1"));
    await screen.findByTestId("placement-price-l1");
    return fetchMock;
  }

  it("defaults every line to fully supplied — no split panel, and the action stays 'בצע הזמנה'", async () => {
    await openWithLines(LINES);
    expect(screen.queryByTestId("placement-split-panel")).toBeNull();
    // ux-release-gate 2026-07-30 A11Y-102: the supply outcome is a native
    // radio group, not three `aria-pressed` toggles — a screen reader must
    // hear that picking one clears the others.
    const full = screen.getByTestId(
      "placement-supply-input-full-l1",
    ) as HTMLInputElement;
    expect(full.type).toBe("radio");
    expect(full.checked).toBe(true);
    expect(
      (screen.getByTestId("placement-supply-input-none-l1") as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(screen.getByTestId("placement-submit-po1").textContent).toContain("בצע הזמנה");
  });

  // Tranche 156 (Tom, 2026-07-30): "there must be an option to cancel, and to
  // enter an order of more than what was set — up to 15% more."
  it("accepts a quantity above the approved amount, up to +15%, as a qty override not a split", async () => {
    const fetchMock = await openWithLines(LINES); // l1 ordered_qty = 5
    await userEvent.type(screen.getByTestId("placement-price-l1"), "10");
    await userEvent.selectOptions(screen.getByTestId("placement-terms-po1"), "EOM_30");
    await userEvent.click(screen.getByTestId("placement-supply-partial-l1"));

    const supplied = screen.getByTestId("placement-supplied-l1");
    await userEvent.clear(supplied);
    await userEvent.type(supplied, "5.75"); // exactly +15% of 5

    // Over-supply is not a split — nothing goes to a sibling PO, so no reason
    // is required and placement is not blocked.
    expect(screen.queryByTestId("placement-split-panel")).toBeNull();
    expect(screen.queryByTestId("placement-supplied-error-l1")).toBeNull();
    const submit = screen.getByTestId("placement-submit-po1") as HTMLButtonElement;
    await waitFor(() => expect(submit.getAttribute("aria-disabled")).toBeNull());

    await userEvent.click(submit);
    const dialog = await screen.findByRole("alertdialog");
    // DR-019 discipline: the raised quantity must be disclosed before commit.
    expect(dialog.textContent).toContain("מעל הכמות שאושרה");
    await userEvent.click(within(dialog).getByRole("button", { name: "בצע הזמנה" }));

    const placeCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/place"),
    );
    await waitFor(() => expect(placeCalls.length).toBe(1));
    const body = JSON.parse(String((placeCalls[0][1] as RequestInit).body));
    expect(body.line_qty_overrides).toEqual([
      { po_line_id: "l1", ordered_qty: 5.75 },
    ]);
    expect(body.unplaced_lines).toBeUndefined();
    expect(body.split_reason).toBeUndefined();
  });

  it("refuses a quantity more than 15% above the approved amount and points at the planner", async () => {
    await openWithLines(LINES);
    await userEvent.type(screen.getByTestId("placement-price-l1"), "10");
    await userEvent.selectOptions(screen.getByTestId("placement-terms-po1"), "EOM_30");
    await userEvent.click(screen.getByTestId("placement-supply-partial-l1"));

    const supplied = screen.getByTestId("placement-supplied-l1");
    await userEvent.clear(supplied);
    await userEvent.type(supplied, "6"); // +20% — past the ceiling

    const err = screen.getByTestId("placement-supplied-error-l1");
    expect(err.textContent).toContain("15%");
    expect(err.textContent).toContain("מנהל התכנון");
    const submit = screen.getByTestId("placement-submit-po1") as HTMLButtonElement;
    await waitFor(() =>
      expect(submit.getAttribute("aria-disabled")).toBe("true"),
    );
  });

  it("still splits the remainder when the supplier confirmed less than approved", async () => {
    await openWithLines(LINES);
    await userEvent.type(screen.getByTestId("placement-price-l1"), "10");
    await userEvent.selectOptions(screen.getByTestId("placement-terms-po1"), "EOM_30");
    await userEvent.click(screen.getByTestId("placement-supply-partial-l1"));
    const supplied = screen.getByTestId("placement-supplied-l1");
    await userEvent.clear(supplied);
    await userEvent.type(supplied, "3");
    // The under-supply path is untouched by the +15% change.
    expect(screen.queryByTestId("placement-split-panel")).not.toBeNull();
  });

  it("names the third supply outcome 'לא יסופק' — the order was placed, this line just is not coming (COPY-105)", async () => {
    await openWithLines(LINES);
    const group = screen.getByRole("group", { name: /מה סופק עבור רכיב א/ });
    expect(within(group).getByText("לא יסופק")).toBeTruthy();
    expect(within(group).queryByText("לא הוזמן")).toBeNull();
  });

  it("a partial quantity opens the split panel and blocks placing until a reason is chosen", async () => {
    await openWithLines(LINES);
    await userEvent.type(screen.getByTestId("placement-price-l1"), "10");
    await userEvent.selectOptions(screen.getByTestId("placement-terms-po1"), "EOM_30");

    // Supplier only had 3 of the 5.
    await userEvent.click(screen.getByTestId("placement-supply-partial-l1"));
    const suppliedInput = screen.getByTestId("placement-supplied-l1");
    await userEvent.clear(suppliedInput);
    await userEvent.type(suppliedInput, "3");

    expect(screen.queryByTestId("placement-split-panel")).not.toBeNull();
    const submit = screen.getByTestId("placement-submit-po1") as HTMLButtonElement;
    await waitFor(() =>
      expect(submit.getAttribute("aria-disabled")).toBe("true"),
    );
    expect(submit.getAttribute("title")).toContain("סיבה");

    await userEvent.selectOptions(
      screen.getByTestId("placement-split-reason"),
      "אין במלאי אצל הספק",
    );
    await waitFor(() =>
      expect(submit.getAttribute("aria-disabled")).toBeNull(),
    );
    // The action renames itself so it can never be mistaken for a full order.
    expect(submit.textContent).toContain("בצע חלקית");
  });

  // Tranche 156 replaced the old rule (0 < q < ordered) with (0 < q ≤ ordered
  // × 1.15), so a quantity equal to the approved amount is now simply valid —
  // it just means the supplier delivered exactly what was approved.
  it("accepts a quantity equal to the approved amount without splitting or overriding", async () => {
    const fetchMock = await openWithLines(LINES);
    await userEvent.type(screen.getByTestId("placement-price-l1"), "10");
    await userEvent.selectOptions(screen.getByTestId("placement-terms-po1"), "EOM_30");
    await userEvent.click(screen.getByTestId("placement-supply-partial-l1"));

    const suppliedInput = screen.getByTestId("placement-supplied-l1");
    await userEvent.clear(suppliedInput);
    await userEvent.type(suppliedInput, "5"); // == ordered_qty

    expect(screen.queryByTestId("placement-supplied-error-l1")).toBeNull();
    expect(screen.queryByTestId("placement-split-panel")).toBeNull();
    const submit = screen.getByTestId("placement-submit-po1") as HTMLButtonElement;
    await waitFor(() => expect(submit.getAttribute("aria-disabled")).toBeNull());

    await userEvent.click(submit);
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "בצע הזמנה" }));
    const placeCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/place"),
    );
    await waitFor(() => expect(placeCalls.length).toBe(1));
    const body = JSON.parse(String((placeCalls[0][1] as RequestInit).body));
    expect(body.unplaced_lines).toBeUndefined();
    expect(body.line_qty_overrides).toBeUndefined();
  });

  it("rejects a zero quantity and associates the error with the field (A11Y-103)", async () => {
    await openWithLines(LINES);
    await userEvent.type(screen.getByTestId("placement-price-l1"), "10");
    await userEvent.selectOptions(screen.getByTestId("placement-terms-po1"), "EOM_30");
    await userEvent.click(screen.getByTestId("placement-supply-partial-l1"));

    const suppliedInput = screen.getByTestId("placement-supplied-l1");
    await userEvent.clear(suppliedInput);
    await userEvent.type(suppliedInput, "0");

    expect(screen.queryByTestId("placement-supplied-error-l1")).not.toBeNull();
    const submit = screen.getByTestId("placement-submit-po1") as HTMLButtonElement;
    await waitFor(() =>
      expect(submit.getAttribute("aria-disabled")).toBe("true"),
    );
    expect(
      screen
        .getByTestId("placement-supplied-l1")
        .getAttribute("aria-describedby"),
    ).toBe("placement-supplied-error-l1");
  });

  it("refuses a placement where nothing is supplied and points at the discard path (backend NOTHING_PLACED)", async () => {
    const fetchMock = await openWithLines(LINES);
    await userEvent.type(screen.getByTestId("placement-price-l1"), "10");
    await userEvent.selectOptions(screen.getByTestId("placement-terms-po1"), "EOM_30");
    await userEvent.click(screen.getByTestId("placement-supply-none-l1"));

    expect(screen.queryByTestId("placement-nothing-placed")).not.toBeNull();
    const submit = screen.getByTestId("placement-submit-po1") as HTMLButtonElement;
    await waitFor(() =>
      expect(submit.getAttribute("aria-disabled")).toBe("true"),
    );
    expect(submit.getAttribute("title")).toContain("בטל עם סיבה");

    // And it must never reach the place endpoint.
    await userEvent.click(submit);
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes("/place")).length,
    ).toBe(0);
  });

  it("sends unplaced_lines + split_reason, and omits both on a full placement", async () => {
    const fetchMock = await openWithLines(LINES_TWO);
    await userEvent.type(screen.getByTestId("placement-price-l1"), "10");
    await userEvent.type(screen.getByTestId("placement-price-l2"), "20");
    await userEvent.selectOptions(screen.getByTestId("placement-terms-po1"), "EOM_30");

    // Line 2 not supplied at all → whole line splits off; line 1 still placed.
    await userEvent.click(screen.getByTestId("placement-supply-none-l2"));
    await userEvent.selectOptions(
      screen.getByTestId("placement-split-reason"),
      "אין במלאי אצל הספק",
    );

    await userEvent.click(screen.getByTestId("placement-submit-po1"));
    // Confirm the itemised dialog.
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "בצע חלקית" }));

    const placeCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/place"),
    );
    await waitFor(() => expect(placeCalls.length).toBe(1));
    const body = JSON.parse(String((placeCalls[0][1] as RequestInit).body));
    expect(body.unplaced_lines).toEqual([{ po_line_id: "l2", unplaced_qty: 8 }]);
    expect(body.split_reason).toBe("אין במלאי אצל הספק");
    // The placed side keeps its own line untouched.
    expect(body.line_prices).toEqual(
      expect.arrayContaining([{ po_line_id: "l1", unit_price_net: 10 }]),
    );
  });

  // -------------------------------------------------------------------------
  // Tranche 154 — clarity rebuild (ux-release-gate 2026-07-30)
  // -------------------------------------------------------------------------

  function renderPo(overrides: Partial<QueuePo>) {
    if (!vi.isMockFunction(globalThis.fetch)) {
      vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
        new Response(JSON.stringify(LINES), { status: 200 }),
      );
    }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <PlacementRow po={{ ...PO, ...overrides }} />
      </QueryClientProvider>,
    );
  }

  it("collapsed row never repeats the supplier name — it belongs to the group heading (P0 VIS-101)", () => {
    renderPo({});
    // The name that used to print twice per row (group heading + row label,
    // same size and weight, ~10px apart) appears zero times in the row itself.
    expect(screen.queryByText("אקמה")).toBeNull();
    // What the row leads with instead: state, then identity.
    expect(screen.getByTestId("placement-status-chip-po1").textContent).toContain(
      "לביצוע היום",
    );
    expect(screen.getByText("PO-2026-00001")).toBeTruthy();
  });

  it("renders dates the Israeli way, not ISO (COPY-103)", () => {
    // The fixture's order date and planning deadline are the same day, so this
    // value legitimately appears more than once in the row.
    renderPo({ scheduled_order_date: "2026-06-25" });
    expect(screen.getAllByText("25/06/2026").length).toBeGreaterThan(0);
    expect(screen.getByText("30/06/2026")).toBeTruthy(); // planned arrival
    expect(screen.queryByText("2026-06-25")).toBeNull();
    expect(screen.queryByText("2026-06-30")).toBeNull();
  });

  it("does not auto-open the schedule panel, and tells the row what its next step is (VIS-109, FLOW-112)", () => {
    renderPo({ due_state: "needs_schedule", scheduled_order_date: null });
    // Auto-opening this panel for every unscheduled order pushed the rest of
    // the queue below the fold on a phone.
    expect(screen.queryByTestId("placement-schedule-panel-po1")).toBeNull();
    expect(screen.getByTestId("placement-schedule-toggle-po1").getAttribute("aria-expanded")).toBe(
      "false",
    );
    // The row says which of its three buttons is the one to press.
    expect(screen.getByTestId("placement-row-hint-po1").textContent).toContain(
      "שנה מועד",
    );
    expect(screen.getByTestId("placement-status-chip-po1").textContent).toContain(
      "חסר תאריך ביצוע",
    );
  });

  it("blocks saving a date past the planning deadline until a reason is written, before the click (INTER-104)", async () => {
    renderPo({});
    await userEvent.click(screen.getByTestId("placement-schedule-toggle-po1"));

    const dateInput = screen.getByTestId("placement-schedule-date-po1");
    fireEvent.change(dateInput, { target: { value: "2026-06-30" } });

    const save = screen.getByTestId(
      "placement-schedule-submit-po1",
    ) as HTMLButtonElement;
    // The late-reason requirement used to fire only after the click.
    await waitFor(() => expect(save.disabled).toBe(true));
    expect(save.getAttribute("title")).toContain("הסבר");

    fireEvent.change(screen.getByTestId("placement-schedule-risk-note-po1"), {
      target: { value: "הספק סוגר מחר" },
    });
    await waitFor(() => expect(save.disabled).toBe(false));
  });

  it("keeps the planner's jargon off the schedule panel (COPY-102, COPY-104, COPY-106, COPY-107)", async () => {
    renderPo({});
    await userEvent.click(screen.getByTestId("placement-schedule-toggle-po1"));
    for (const jargon of [
      "מידע נעול מהשרת",
      "הגעה מתוכננת פנימית",
      "סיבת סיכון",
      "סיבת חריגה מתאריך בטוח",
    ]) {
      expect(screen.queryByText(new RegExp(jargon))).toBeNull();
    }
    expect(screen.getByText(/המועד האחרון להזמנה לפי התכנון/)).toBeTruthy();
  });
});
