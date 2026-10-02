// The orders timeline as a person meets it (Tom, 2026-10-02): trend, zoom on the
// count scale, and from a month down to its orders.
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { OrdersTimeline } from "@/app/(sales)/_components/org/OrdersTimeline";
import { UI } from "@/app/(sales)/_lib/labels";
import { buildRing } from "@/app/(sales)/_lib/ring";
import { circle } from "./_orgFixtures";

afterEach(cleanup);

const months = () => {
  const r = buildRing(circle().months, [{ gid: "d", name: "#D", draft_status: "OPEN", created_at: "2026-09-25T08:00:00Z", age_days: 7 }]);
  return [...r.inner, ...r.outer];
};

describe("orders timeline", () => {
  it("offers every month as a named target, newest at the left", () => {
    render(<OrdersTimeline months={months()} onMonth={() => {}} />);
    const targets = within(screen.getByTestId("orders-timeline")).getAllByRole("button", { name: /20\d\d:/ });
    expect(targets).toHaveLength(24);
    expect(targets[23].getAttribute("aria-label")).toMatch(/אוקטובר 2026/);
  });

  it("selects a month on tap, says what it holds, and opens it from a real button", () => {
    const opened: string[] = [];
    render(<OrdersTimeline months={months()} onMonth={(ym) => opened.push(ym)} />);
    fireEvent.click(screen.getByRole("button", { name: /ספטמבר 2026/ }));
    const callout = screen.getByTestId("timeline-callout");
    expect(callout.textContent).toContain("ספטמבר 2026");
    expect(callout.textContent).toContain("טיוטה פתוחה אחת");
    expect(opened).toEqual([]);
    fireEvent.click(within(callout).getByRole("button", { name: UI.timelineOpenMonth }));
    expect(opened).toEqual(["2026-09"]);
  });

  it("opens a month straight from the keyboard, and arrows walk through time", () => {
    const opened: string[] = [];
    render(<OrdersTimeline months={months()} onMonth={(ym) => opened.push(ym)} />);
    const sep = screen.getByRole("button", { name: /ספטמבר 2026/ });
    sep.focus();
    fireEvent.keyDown(sep, { key: "ArrowLeft" });
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/אוקטובר 2026/);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/ספטמבר 2026/);
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(opened).toEqual(["2026-09"]);
  });

  it("zooms the order-count scale in and out, and back to fit", () => {
    render(<OrdersTimeline months={months()} onMonth={() => {}} />);
    const zoomIn = screen.getByRole("button", { name: UI.timelineZoomIn });
    const zoomOut = screen.getByRole("button", { name: UI.timelineZoomOut });
    const scale = () => screen.getByTestId("timeline-scale").textContent;
    const fit = scale();
    expect((zoomOut as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(zoomIn);
    expect(scale()).not.toBe(fit);
    expect((zoomOut as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(zoomIn);
    expect((zoomIn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: UI.timelineZoomFit }));
    expect(scale()).toBe(fit);
  });

  it("marks a month taller than the zoomed scale with its true count", () => {
    const m = months();
    m[20] = { ...m[20], completed: 9, filled: 9 };
    render(<OrdersTimeline months={m} onMonth={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: UI.timelineZoomIn }));
    fireEvent.click(screen.getByRole("button", { name: UI.timelineZoomIn }));
    // the default test width leaves room for the count above the column
    expect(screen.getAllByTestId("timeline-overflow").map((e) => e.textContent)).toContain(String(m[20].filled + m[20].hollow + m[20].open));
  });

  it("explains its marks and its trend line in a visible legend", () => {
    render(<OrdersTimeline months={months()} onMonth={() => {}} />);
    const legend = screen.getByTestId("timeline-legend");
    for (const word of [UI.circleLegendOrder, UI.circleLegendCancelled, UI.circleLegendDraft, UI.timelineTrend]) {
      expect(legend.textContent).toContain(word);
    }
  });

  it("opens on a headline: the orders of the two years, and the trend of the full months", () => {
    const m = months();
    render(<OrdersTimeline months={m} onMonth={() => {}} />);
    const total = m.reduce((n, x) => n + x.filled, 0);
    const head = screen.getByTestId("orders-timeline").querySelector(".s-tl-total")!;
    expect(head.textContent).toBe(`${total}${UI.timelineTotal}`);
    expect(screen.getByTestId("timeline-trend").textContent).toContain(UI.timelineTrendBasis);
  });

  it("says the current month is still in progress", () => {
    render(<OrdersTimeline months={months()} onMonth={() => {}} />);
    const now = screen.getByRole("button", { name: /אוקטובר 2026/ });
    expect(now.getAttribute("aria-label")).toContain(UI.timelineInProgress);
    fireEvent.click(now);
    expect(screen.getByTestId("timeline-callout").textContent).toContain(UI.timelineInProgress);
  });

  it("lights a month under a passing mouse without saying anything", () => {
    render(<OrdersTimeline months={months()} onMonth={() => {}} />);
    const callout = screen.getByTestId("timeline-callout");
    const before = callout.textContent;
    fireEvent.pointerEnter(screen.getByRole("button", { name: /ספטמבר 2026/ }), { pointerType: "mouse" });
    expect(callout.textContent).toBe(before);
    expect(callout.hasAttribute("aria-live")).toBe(false);
    expect(document.querySelector(".s-tl-col[data-selected]")).toBeTruthy();
  });

  it("is one tab stop, and the arrows move it", () => {
    render(<OrdersTimeline months={months()} onMonth={() => {}} />);
    const targets = within(screen.getByTestId("orders-timeline")).getAllByRole("button", { name: /20\d\d:/ });
    expect(targets.filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(targets[23].getAttribute("tabindex")).toBe("0");
    targets[23].focus();
    fireEvent.keyDown(targets[23], { key: "ArrowRight" });
    expect(targets[22].getAttribute("tabindex")).toBe("0");
    expect(targets[23].getAttribute("tabindex")).toBe("-1");
  });

  it("does not zoom past the height of a typical month, where every column would only say it is cut", () => {
    const busy = months().map((m) => ({ ...m, completed: 7, filled: 7 }));
    render(<OrdersTimeline months={busy} onMonth={() => {}} />);
    expect((screen.getByRole("button", { name: UI.timelineZoomIn }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("steps to the month before and after from full-size buttons, whatever the column width", () => {
    render(<OrdersTimeline months={months()} onMonth={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /ספטמבר 2026/ }));
    const callout = screen.getByTestId("timeline-callout");
    fireEvent.click(within(callout).getByRole("button", { name: UI.timelineMonthPrev }));
    expect(callout.textContent).toContain("אוגוסט 2026");
    fireEvent.click(within(callout).getByRole("button", { name: UI.timelineMonthNext }));
    fireEvent.click(within(callout).getByRole("button", { name: UI.timelineMonthNext }));
    expect(callout.textContent).toContain("אוקטובר 2026");
    expect((within(callout).getByRole("button", { name: UI.timelineMonthNext }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets go of a month tapped a second time", () => {
    render(<OrdersTimeline months={months()} onMonth={() => {}} />);
    const sep = screen.getByRole("button", { name: /ספטמבר 2026/ });
    fireEvent.click(sep);
    fireEvent.click(sep);
    expect(screen.getByTestId("timeline-callout").textContent).toContain(UI.timelinePick);
  });

  it("offers no way into a month that holds nothing", () => {
    const m = months();
    m[10] = { ...m[10], filled: 0, refunded: 0, hollow: 0, open: 0, completed: 0, cancelled: 0 } as typeof m[number];
    render(<OrdersTimeline months={m} onMonth={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /אין הזמנות/ }));
    const open = within(screen.getByTestId("timeline-callout")).getByRole("button", { name: UI.timelineOpenMonth }) as HTMLButtonElement;
    expect(open.disabled).toBe(true);
  });

  it("keeps a month chosen by a press that also focused it", () => {
    render(<OrdersTimeline months={months()} onMonth={() => {}} />);
    const sep = screen.getByRole("button", { name: /ספטמבר 2026/ });
    // a real press: pointer down, focus, click
    fireEvent.pointerDown(sep, { pointerType: "mouse" });
    fireEvent.focus(sep);
    fireEvent.click(sep);
    expect(screen.getByTestId("timeline-callout").textContent).toContain("ספטמבר 2026");
  });
});
