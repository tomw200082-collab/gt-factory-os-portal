// ---------------------------------------------------------------------------
// procurement-calendar-mobile.test.tsx — locks Tranche 053 FLOW-004 on the
// procurement CalendarView:
//   • The desktop 7-col month grid is now md+ only (hidden md:block) and its
//     markup / testids are unchanged.
//   • Below md a grouped-by-week list renders: week header, then one row per
//     order (tier dot + chip, supplier, Hebrew date, ₪ amount); tapping a row
//     opens focus mode exactly like the desktop cell button; placed/skipped
//     rows are dimmed.
//
// Codebase idiom: queryByX / getByX with toBeTruthy() — no jest-dom matchers.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CalendarView } from "@/app/(planning)/planning/procurement/_components/CalendarView";
import type { PurchaseSessionPo } from "@/app/(planning)/planning/purchase-session/_lib/types";

// 2026-06-10 is a Wednesday; its Sunday-aligned week starts 2026-06-07.
const TODAY = "2026-06-10";

function po(over: Record<string, unknown>): PurchaseSessionPo {
  return {
    session_po_id: "po-base",
    supplier_snapshot: "ספק בדיקה",
    tier: "must",
    status: "pending",
    total_cost: 1500,
    order_by_date: TODAY,
    lines: [{ is_dropped: false }],
    ...over,
  } as unknown as PurchaseSessionPo;
}

const POS: PurchaseSessionPo[] = [
  // Same week as today.
  po({ session_po_id: "po-1", supplier_snapshot: "ספק א", tier: "urgent", order_by_date: "2026-06-11", total_cost: 1234 }),
  // Next week.
  po({ session_po_id: "po-2", supplier_snapshot: "ספק ב", tier: "recommended", order_by_date: "2026-06-16", total_cost: 980 }),
  // Same week as po-2, already placed → dimmed.
  po({ session_po_id: "po-3", supplier_snapshot: "ספק ג", tier: "must", status: "placed", order_by_date: "2026-06-17", total_cost: 555 }),
];

afterEach(() => cleanup());

describe("procurement CalendarView — FLOW-004 mobile grouped list", () => {
  it("keeps the desktop grid markup, gated to md+ via hidden md:block", () => {
    render(<CalendarView pos={POS} today={TODAY} />);
    // Desktop day-cell entries still render with the original testids.
    const desktopEntry = screen.getByTestId("calendar-entry-po-1");
    expect(desktopEntry).toBeTruthy();
    // …inside the card that is hidden below md.
    const gridCard = desktopEntry.closest(".card");
    expect(gridCard).toBeTruthy();
    const cls = gridCard!.getAttribute("class") ?? "";
    expect(cls.includes("hidden")).toBe(true);
    expect(cls.includes("md:block")).toBe(true);
  });

  it("renders the mobile list grouped by week (md:hidden), only weeks with orders", () => {
    render(<CalendarView pos={POS} today={TODAY} />);
    const list = screen.getByTestId("procurement-calendar-list");
    expect((list.getAttribute("class") ?? "").includes("md:hidden")).toBe(true);

    const weekGroups = screen.getAllByTestId("calendar-week-group");
    expect(weekGroups.length).toBe(2); // today's week + next week, nothing else
    expect(weekGroups[0]!.getAttribute("data-week-start")).toBe("2026-06-07");
    expect(weekGroups[1]!.getAttribute("data-week-start")).toBe("2026-06-14");

    // Row carries supplier name + ₪ amount.
    const row = screen.getByTestId("calendar-list-entry-po-1");
    expect(row.textContent).toContain("ספק א");
    // ux-release-gate 2026-07-23 R2-F01/COPY-032: urgent now reads as
    // ActionList's "חייב לצאת היום" bucket label, not the old "דחוף" tier term.
    expect(row.textContent).toContain("חייב לצאת היום"); // urgent tier chip label
  });

  it("taps a row like the desktop cell button (onOpen with the session_po_id)", () => {
    const onOpen = vi.fn();
    render(<CalendarView pos={POS} today={TODAY} onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId("calendar-list-entry-po-2"));
    expect(onOpen).toHaveBeenCalledWith("po-2");
  });

  it("dims placed/skipped rows like the desktop cells", () => {
    render(<CalendarView pos={POS} today={TODAY} />);
    const placed = screen.getByTestId("calendar-list-entry-po-3");
    expect((placed.getAttribute("class") ?? "").includes("opacity-50")).toBe(true);
    const open = screen.getByTestId("calendar-list-entry-po-1");
    expect((open.getAttribute("class") ?? "").includes("opacity-50")).toBe(false);
  });

  it("shows an empty state when the session has no orders", () => {
    render(<CalendarView pos={[]} today={TODAY} />);
    const list = screen.getByTestId("procurement-calendar-list");
    expect(list.textContent).toContain("אין הזמנות");
    expect(screen.queryAllByTestId("calendar-week-group").length).toBe(0);
  });
});
