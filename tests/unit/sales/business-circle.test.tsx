// The business circle as a person meets it (GT Pulse Unit B, tranche 191).
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BusinessCircle } from "@/app/(sales)/_components/org/BusinessCircle";
import { UI } from "@/app/(sales)/_lib/labels";
import { circle } from "./_orgFixtures";

afterEach(cleanup);

const NOW = new Date("2026-10-02T09:00:00Z");

describe("business circle", () => {
  it("offers every month as a named target, in the ring and in the narrow grid", () => {
    render(<BusinessCircle data={circle()} pending={[]} moved={null} onMonth={() => {}} now={NOW} />);
    const ring = screen.getByTestId("circle-ring");
    const segments = within(ring).getAllByRole("button");
    expect(segments).toHaveLength(24);
    expect(segments[23].getAttribute("aria-label")).toMatch(/אוקטובר 2026/);
    expect(within(screen.getByTestId("circle-grid")).getAllByRole("button")).toHaveLength(24);
  });

  it("says what a month holds in its name, not by colour", () => {
    render(<BusinessCircle data={circle()} pending={[]} moved={null} onMonth={() => {}} now={NOW} />);
    const label = within(screen.getByTestId("circle-ring")).getByRole("button", { name: /אוגוסט 2026/ }).getAttribute("aria-label")!;
    expect(label).toMatch(/הזמנ/);
  });

  it("opens a month on tap and on Enter", () => {
    const opened: string[] = [];
    render(<BusinessCircle data={circle()} pending={[]} moved={null} onMonth={(ym) => opened.push(ym)} now={NOW} />);
    const seg = within(screen.getByTestId("circle-ring")).getByRole("button", { name: /ספטמבר 2026/ });
    fireEvent.click(seg);
    fireEvent.keyDown(seg, { key: "Enter" });
    fireEvent.keyDown(seg, { key: " " });
    expect(opened).toEqual(["2026-09", "2026-09", "2026-09"]);
  });

  it("puts the last order and how long ago in the centre, with its source and time", () => {
    render(<BusinessCircle data={circle()} pending={[]} moved={null} onMonth={() => {}} now={NOW} />);
    const centre = screen.getByTestId("circle-centre");
    expect(centre.textContent).toContain(UI.daysSince(12));
    expect(centre.textContent).toContain("Shopify");
  });

  it("states a move to a distributor and never counts silence for it (T5)", () => {
    render(<BusinessCircle data={circle()} pending={[]} moved={{ to: "מפיץ הדגמה", on: "2026-03-01" }} onMonth={() => {}} now={NOW} />);
    const centre = screen.getByTestId("circle-centre");
    expect(centre.textContent).toContain("מפיץ הדגמה");
    expect(centre.textContent).not.toMatch(/לפני \d+ ימים|לפני יום/);
  });

  it("says how many more orders a crowded month holds than it can draw", () => {
    const data = circle();
    data.months[23] = { ...data.months[23], completed: 9, refunded: 0, cancelled: 0 };
    render(<BusinessCircle data={data} pending={[]} moved={null} onMonth={() => {}} now={NOW} />);
    const more = within(screen.getByTestId("circle-ring")).getAllByTestId("ring-more");
    expect(more).toHaveLength(1);
    expect(more[0].textContent).toBe("+4");
  });

  it("explains its marks in a visible legend", () => {
    render(<BusinessCircle data={circle()} pending={[]} moved={null} onMonth={() => {}} now={NOW} />);
    const legend = screen.getByTestId("circle-legend");
    for (const word of [UI.circleLegendOrder, UI.circleLegendCancelled, UI.circleLegendDraft]) expect(legend.textContent).toContain(word);
  });

  it("draws an open draft only from the open drafts it is given", () => {
    const { rerender } = render(<BusinessCircle data={circle()} pending={[]} moved={null} onMonth={() => {}} now={NOW} />);
    expect(document.querySelectorAll("[data-mark='open']").length).toBe(0);
    rerender(<BusinessCircle data={circle()} now={NOW} moved={null} onMonth={() => {}}
      pending={[{ gid: "gid://shopify/DraftOrder/1", name: "#D1", draft_status: "OPEN", created_at: "2026-09-25T08:00:00Z", age_days: 7 }]} />);
    // drawn once in the ring and once in the grid
    expect(document.querySelectorAll("[data-mark='open']").length).toBe(2);
  });

  it("switches to a timeline and back, and remembers the choice", () => {
    window.localStorage.removeItem("gt.sales.ordersView");
    render(<BusinessCircle data={circle()} pending={[]} moved={null} onMonth={() => {}} now={NOW} />);
    const toggle = screen.getByRole("group", { name: UI.ordersViewLabel });
    expect(within(toggle).getByRole("button", { name: UI.viewCircle }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(toggle).getByRole("button", { name: UI.viewTimeline }));
    expect(screen.getByTestId("orders-timeline")).toBeTruthy();
    expect(screen.queryByTestId("circle-ring")).toBeNull();
    expect(window.localStorage.getItem("gt.sales.ordersView")).toBe("timeline");
    cleanup();
    render(<BusinessCircle data={circle()} pending={[]} moved={null} onMonth={() => {}} now={NOW} />);
    expect(screen.getByTestId("orders-timeline")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: UI.viewCircle }));
    expect(screen.getByTestId("circle-ring")).toBeTruthy();
    window.localStorage.removeItem("gt.sales.ordersView");
  });

  it("starts no animation when the user asked for reduced motion", () => {
    const mm = vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({
      matches: q.includes("reduce"), media: q, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }) as MediaQueryList);
    render(<BusinessCircle data={circle()} pending={[]} moved={null} onMonth={() => {}} now={NOW} />);
    expect(screen.getByTestId("circle-ring").getAttribute("data-motion")).toBe("off");
    mm.mockRestore();
  });
});
