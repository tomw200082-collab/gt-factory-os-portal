// ---------------------------------------------------------------------------
// ActionList tests — Tranche 032 (procurement-test-coverage).
//
// ActionList is presentational given `pos` + `today`, so these render it
// directly (no network) and assert the decision grouping and row affordances:
//   L1 — groups orders into must-today / can-wait / handled sections
//   L2 — overdue order carries the "באיחור" badge
//   L3 — empty sections show the empty-state copy
//   L4 — with onOpen, the row action is a button that calls onOpen(po)
//   L5 — without onOpen, the row action falls back to a link (classic session)
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActionList } from "./ActionList";
import type { PurchaseSessionPo } from "../../purchase-session/_lib/types";

const TODAY = "2026-05-29";

afterEach(() => cleanup());

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

const POS = [
  makePo("overdue", { order_by_date: "2026-05-26" }), // must_today + overdue
  makePo("future", { order_by_date: "2026-06-20" }), // can_wait
  makePo("done", { status: "placed", order_by_date: "2026-05-20" }), // handled
];

describe("ActionList", () => {
  it("L1 groups orders into the three decision sections", () => {
    render(<ActionList pos={POS} today={TODAY} />);
    expect(screen.getByText("חייב לצאת היום")).toBeTruthy();
    expect(screen.getByText("יכול לחכות")).toBeTruthy();
    expect(screen.getByText("טופל")).toBeTruthy();
    expect(screen.getByTestId("procurement-row-overdue")).toBeTruthy();
    expect(screen.getByTestId("procurement-row-future")).toBeTruthy();
    expect(screen.getByTestId("procurement-row-done")).toBeTruthy();
  });

  it("L2 flags the overdue order with a באיחור badge", () => {
    render(<ActionList pos={POS} today={TODAY} />);
    const row = screen.getByTestId("procurement-row-overdue");
    expect(within(row).getByText("באיחור")).toBeTruthy();
  });

  it("L3 shows empty-state copy for sections with no orders", () => {
    render(<ActionList pos={[makePo("only", { order_by_date: "2026-05-26" })]} today={TODAY} />);
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
    expect(open.getAttribute("href")).toBe("/planning/purchase-session");
  });
});
