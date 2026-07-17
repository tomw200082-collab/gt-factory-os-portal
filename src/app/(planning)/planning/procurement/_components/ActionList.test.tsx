// ---------------------------------------------------------------------------
// ActionList tests — Tranche 032, upgraded in Tranche 132 (decision-grade).
//
// ActionList is presentational given `pos` (+ optional `warnings`) + `today`,
// so these render it directly (no network) and assert the decision grouping
// and row affordances:
//   L1  — groups orders into must-today / can-wait / handled sections
//   L2  — a projected-stockout row carries the quantified "חוסר צפוי" badge
//   L3  — empty sections show the empty-state copy
//   L4  — with onOpen, the row action is a button that calls onOpen(po)
//   L5  — without onOpen, the row action falls back to a link
//   L6  — search matches by supplier AND by item (line label)
//   L7  — the decision summary always reflects the FULL session under filters
//   L8  — session warnings surface INLINE on the affected row (double-buy)
//   L9  — stale-count lines get a "לספור קודם" chip linking to the count page
//   L10 — the "דורש ספירה" bucket filter narrows to recount rows
//   L11 — proposed rows show no status badge; approved rows do
//   L13 — the inline inbound-issue chip is a real link to the affected PO
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionList } from "./ActionList";
import type {
  PurchaseSessionPo,
  PurchaseSessionWarning,
} from "../../purchase-session/_lib/types";

const TODAY = "2026-05-29";

afterEach(() => cleanup());

function stockoutTrace(overrides: Record<string, unknown> = {}) {
  return {
    on_hand_inv: 0,
    total_horizon_demand_inv: 100,
    avg_daily_demand_inv: 10,
    cover_days: 7,
    safety_floor_inv: 70,
    need_date: TODAY,
    projected_on_hand_at_need_inv: -5,
    consolidation_window_days: 21,
    window_demand_inv: 50,
    window_open_po_receipts_inv: 0,
    order_qty_inventory_uom: 60,
    purchase_to_inv_factor: 1,
    lead_time_days: 7,
    demand_model_version: "v2",
    ...overrides,
  };
}

function makePo(
  id: string,
  overrides: Partial<PurchaseSessionPo> = {},
): PurchaseSessionPo {
  return {
    session_po_id: id,
    supplier_id: `sup_${id}`,
    supplier_snapshot: `ספק ${id}`,
    tier: "must",
    status: "proposed",
    order_by_date: "2026-06-05",
    earliest_need_date: "2026-06-12",
    covered_through_date: null,
    currency: "ILS",
    total_cost: 100,
    order_document_text: null,
    po_id: null,
    blocking_issues: [],
    lines: [
      {
        session_po_line_id: `${id}_l1`,
        component_id: "c1",
        item_id: null,
        line_label: "רכיב",
        recommended_qty: 5,
        final_qty: 5,
        uom: "UNIT",
        unit_cost: 20,
        line_cost: 100,
        earliest_need_date: null,
        coverage_trace: null,
        is_user_added: false,
        is_dropped: false,
      },
    ],
    ...overrides,
  };
}

/** A PO whose single line projects a real stockout (trace math → must_today). */
function makeStockoutPo(
  id: string,
  overrides: Partial<PurchaseSessionPo> = {},
  traceOverrides: Record<string, unknown> = {},
  lineLabel = "רכיב אוזל",
): PurchaseSessionPo {
  const base = makePo(id, overrides);
  return {
    ...base,
    lines: [
      {
        ...base.lines[0],
        line_label: lineLabel,
        coverage_trace: stockoutTrace(traceOverrides),
      },
    ],
  };
}

const POS = [
  makePo("overdue", { order_by_date: "2026-05-26" }), // fallback → must_today
  makePo("future", { order_by_date: "2026-06-20" }), // fallback → can_wait
  makePo("done", { status: "placed", order_by_date: "2026-05-20" }), // handled
];

describe("ActionList", () => {
  it("L1 groups orders into the three decision sections", () => {
    render(<ActionList pos={POS} today={TODAY} />);
    expect(
      screen.getByRole("heading", { name: "חייב לצאת היום" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "יכול לחכות" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "טופל" })).toBeTruthy();
    expect(screen.getByTestId("procurement-row-overdue")).toBeTruthy();
    expect(screen.getByTestId("procurement-row-future")).toBeTruthy();
    expect(screen.getByTestId("procurement-row-done")).toBeTruthy();
  });

  it("L2 a projected stockout carries the quantified shortage badge", () => {
    render(
      <ActionList pos={[makeStockoutPo("short")]} today={TODAY} />,
    );
    const row = screen.getByTestId("procurement-row-short");
    expect(within(row).getByText(/חוסר צפוי ~7 ימים/)).toBeTruthy();
    expect(
      within(row).getByTestId("procurement-whynow-short").textContent,
    ).toContain("רכיב אוזל");
  });

  it("L3 shows empty-state copy for sections with no orders", () => {
    render(
      <ActionList
        pos={[makePo("only", { order_by_date: "2026-05-26" })]}
        today={TODAY}
      />,
    );
    // only must_today populated → can_wait + handled empty
    expect(screen.getByTestId("procurement-empty-can_wait")).toBeTruthy();
    expect(screen.getByTestId("procurement-empty-handled")).toBeTruthy();
    expect(screen.queryByTestId("procurement-empty-must_today")).toBeNull();
  });

  it("L4 with onOpen, the row action calls onOpen(po)", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ActionList pos={POS} today={TODAY} onOpen={onOpen} />);
    await user.click(screen.getByTestId("procurement-open-overdue"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].session_po_id).toBe("overdue");
  });

  it("L5 without onOpen, the row action is a link", () => {
    render(<ActionList pos={POS} today={TODAY} />);
    const open = screen.getByTestId("procurement-open-future");
    expect(open.tagName).toBe("A");
    expect(open.getAttribute("href")).toBe("/planning/procurement");
  });

  it("L6 search narrows by supplier AND by item name", async () => {
    const user = userEvent.setup();
    const withItem = makeStockoutPo(
      "item-po",
      { supplier_snapshot: "ספק פירות" },
      {},
      "Lime Puree",
    );
    render(<ActionList pos={[...POS, withItem]} today={TODAY} />);

    // by supplier
    await user.type(screen.getByTestId("procurement-filter-search"), "overdue");
    expect(screen.getByTestId("procurement-row-overdue")).toBeTruthy();
    expect(screen.queryByTestId("procurement-row-future")).toBeNull();

    // by item (line label)
    await user.clear(screen.getByTestId("procurement-filter-search"));
    await user.type(screen.getByTestId("procurement-filter-search"), "lime");
    expect(screen.getByTestId("procurement-row-item-po")).toBeTruthy();
    expect(screen.queryByTestId("procurement-row-overdue")).toBeNull();
  });

  it("L7 the decision summary always reflects the FULL session, even while a filter narrows the list", async () => {
    const user = userEvent.setup();
    const extra = makePo("overdue2", {
      order_by_date: "2026-05-25",
      supplier_snapshot: "ספק אחר",
      total_cost: 250,
    });
    render(<ActionList pos={[...POS, extra]} today={TODAY} />);
    expect(
      screen.getByTestId("procurement-at-risk-summary").textContent,
    ).toContain("2 חייב");

    await user.type(screen.getByTestId("procurement-filter-search"), "ספק אחר");
    expect(screen.queryByTestId("procurement-row-overdue")).toBeNull();
    expect(screen.getByTestId("procurement-row-overdue2")).toBeTruthy();
    expect(
      screen.getByTestId("procurement-at-risk-summary").textContent,
    ).toContain("2 חייב");
  });

  it("L8 an open-PO warning surfaces inline on the affected row", () => {
    const warnings: PurchaseSessionWarning[] = [
      {
        code: "po_missing_expected_delivery",
        detail: "1 open PO line(s) …",
        lines: [
          {
            po_id: "PO-2026-00263",
            target_id: "c1",
            is_item: false,
            open_qty: 5,
            line_status: "PARTIAL",
          },
        ],
      },
    ];
    const affected = makeStockoutPo("dbl"); // line targets component c1
    const unaffected = makeStockoutPo("clean");
    unaffected.lines[0].component_id = "c-unrelated";
    render(
      <ActionList
        pos={[affected, unaffected]}
        warnings={warnings}
        today={TODAY}
      />,
    );
    const row = screen.getByTestId("procurement-row-dbl");
    expect(within(row).getByText(/בדרך 5 ללא תאריך/)).toBeTruthy();
    // Unaffected rows stay clean.
    const cleanRow = screen.getByTestId("procurement-row-clean");
    expect(within(cleanRow).queryByText(/בדרך/)).toBeNull();
  });

  it("L9 a stale-count line gets a recount chip linking to the counting page", () => {
    render(
      <ActionList
        pos={[
          makeStockoutPo("stale", {}, {
            trace_version: 3,
            lt_source: "component_master",
            last_count_age_days: 45,
          }),
        ]}
        today={TODAY}
      />,
    );
    const chip = screen.getByTestId("procurement-recount-stale");
    expect(chip.getAttribute("href")).toBe("/stock/physical-count");
    expect(chip.textContent).toContain("לספור קודם");
    expect(chip.textContent).toContain("45");
    // ux-release-gate A11Y-002: the rationale rides on the link's accessible
    // name (the link is the tab stop), not on a non-focused inner span.
    expect(chip.getAttribute("aria-label")).toContain("לספור קודם");
    expect(chip.getAttribute("aria-label")).toContain("45");
    // Session-level recount summary counts it too.
    expect(
      screen.getByTestId("procurement-recount-summary").textContent,
    ).toContain("1");
  });

  it("L12 filtering to no matches announces the empty result via an aria-live region (ux-release-gate A11Y-005)", async () => {
    const user = userEvent.setup();
    render(<ActionList pos={POS} today={TODAY} />);
    const status = document.querySelector('[role="status"][aria-live="polite"]');
    expect(status).not.toBeNull();
    // Nothing announced until a filter is active.
    expect(status?.textContent).toBe("");
    await user.type(
      screen.getByTestId("procurement-filter-search"),
      "לא-קיים-בכלל",
    );
    expect(status?.textContent).toContain("אין הזמנות התואמות");
  });

  it("L10 the bucket filter can narrow to recount-needed rows only", async () => {
    const user = userEvent.setup();
    render(
      <ActionList
        pos={[
          makeStockoutPo("needs-count", {}, {
            trace_version: 3,
            lt_source: "component_master",
            last_count_age_days: null,
          }),
          makeStockoutPo("counted", {}, {
            trace_version: 3,
            lt_source: "component_master",
            last_count_age_days: 2,
          }),
        ]}
        today={TODAY}
      />,
    );
    await user.selectOptions(
      screen.getByTestId("procurement-filter-bucket"),
      "recount",
    );
    expect(screen.getByTestId("procurement-row-needs-count")).toBeTruthy();
    expect(screen.queryByTestId("procurement-row-counted")).toBeNull();
  });

  it("L11 proposed rows carry no status badge; approved rows do", () => {
    render(
      <ActionList
        pos={[
          makePo("plain"),
          makePo("appr", { status: "approved", order_by_date: "2026-06-20" }),
        ]}
        today={TODAY}
      />,
    );
    const plain = screen.getByTestId("procurement-row-plain");
    expect(within(plain).queryByText("מוצע")).toBeNull();
    const appr = screen.getByTestId("procurement-row-appr");
    expect(within(appr).getByText("אושר — מוכן לשליחה")).toBeTruthy();
  });

  it("L13 the inline inbound-issue chip is a real link to the affected PO (133)", () => {
    const warnings: PurchaseSessionWarning[] = [
      {
        code: "po_missing_expected_delivery",
        detail: "1 open PO line(s) …",
        lines: [
          {
            po_id: "PO-2026-00263",
            target_id: "c1",
            is_item: false,
            open_qty: 5,
            line_status: "PARTIAL",
          },
        ],
      },
    ];
    render(
      <ActionList
        pos={[makeStockoutPo("dbl")]}
        warnings={warnings}
        today={TODAY}
      />,
    );
    const chip = screen.getByTestId("procurement-inbound-dbl");
    expect(chip.tagName).toBe("A");
    expect(chip.getAttribute("href")).toBe("/purchase-orders/PO-2026-00263");
    expect(chip.textContent).toContain("בדרך 5 ללא תאריך");
  });
});
