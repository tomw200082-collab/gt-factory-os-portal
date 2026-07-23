// ---------------------------------------------------------------------------
// CalendarView render tests — Tranche 033.
//
//   V1 — renders an order chip on its order-by day and the tier summary
//   V2 — clicking a day chip calls onOpen(session_po_id)
// (Grid math + grouping are covered by calendar-grid.test.ts.)
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarView } from "./CalendarView";
import type { PurchaseSessionPo } from "../../purchase-session/_lib/types";

const TODAY = "2026-05-29";

afterEach(() => cleanup());

function po(id: string, over: Partial<PurchaseSessionPo> = {}): PurchaseSessionPo {
  return {
    session_po_id: id,
    supplier_id: `sup_${id}`,
    supplier_snapshot: `ספק ${id}`,
    tier: "must",
    status: "proposed",
    order_by_date: "2026-06-02",
    earliest_need_date: null,
    covered_through_date: null,
    currency: "ILS",
    total_cost: 250,
    order_document_text: null,
    po_id: null,
    blocking_issues: [],
    lines: [],
    ...over,
  };
}

describe("CalendarView", () => {
  it("V1 renders an order chip + the tier summary", () => {
    render(<CalendarView pos={[po("a")]} today={TODAY} />);
    expect(screen.getByTestId("calendar-entry-a")).toBeTruthy();
    // Tier summary strip shows the labels. Tranche 053 (FLOW-004) added the
    // mobile grouped list, which repeats the tier chip per row — so the label
    // legitimately appears more than once now (getAllByText, was getByText).
    // ux-release-gate 2026-07-23 R2-F01/COPY-032: "must" now shares
    // ActionList's "יכול לחכות" bucket label instead of the old, conflicting
    // "חובה השבוע" tier label.
    expect(screen.getAllByText(/יכול לחכות/).length).toBeGreaterThanOrEqual(1);
  });

  it("V2 clicking a day chip opens that order", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<CalendarView pos={[po("a")]} today={TODAY} onOpen={onOpen} />);
    await user.click(screen.getByTestId("calendar-entry-a"));
    expect(onOpen).toHaveBeenCalledWith("a");
  });
});
