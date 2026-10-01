import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { JourneyFlow } from "@/app/(sales)/_components/JourneyFlow";
import { flowCounts } from "@/app/(sales)/_lib/leadMilestones";
import { UI } from "@/app/(sales)/_lib/labels";

afterEach(cleanup);
const base = { created_at: "2026-09-30T08:00:00Z", first_touch_at: null, next_touch_at: null, converted_order_ref: null, status: "new" };
const touched = { ...base, status: "working", first_touch_at: "2026-09-30T09:00:00Z" };
const planned = { ...touched, next_touch_at: "2026-10-02T06:00:00Z" };
const won = { ...planned, status: "won", converted_order_ref: "#1001" };
const lost = { ...planned, status: "lost" };

describe("Today journey flow (D1 hero)", () => {
  it("counts each open lead once at its furthest node and every verified order", () => {
    expect(flowCounts([base, base, touched, planned, won, lost])).toEqual({
      created: 2, outreach: 1, next_action: 1, converted: 1,
    });
  });

  it("does not count a lead that left the path without an order", () => {
    expect(flowCounts([lost, { ...base, status: "won" }])).toEqual({
      created: 0, outreach: 0, next_action: 0, converted: 0,
    });
  });

  it("names the path and each stage with the approved rail labels and its count", () => {
    render(<JourneyFlow rows={[base, touched, planned, planned, won]} />);
    const flow = screen.getByRole("list", { name: UI.railTitle });
    const stages = within(flow).getAllByRole("listitem");
    expect(stages.map((stage) => stage.textContent)).toEqual([
      `1${UI.railCreated}`, `1${UI.railOutreach}`, `2${UI.railNextAction}`, `1${UI.railConverted}`,
    ]);
  });

  it("holds its shape without numbers until the rows arrive", () => {
    render(<JourneyFlow rows={undefined} />);
    expect(screen.getByTestId("journey-flow").getAttribute("data-ready")).toBe("false");
    expect(screen.getByTestId("flow-created").textContent).toBe(UI.railCreated);
  });

  it("marks a stage that grew on a real change, never on first load", () => {
    const { rerender } = render(<JourneyFlow rows={[base, touched]} />);
    expect(screen.getByTestId("flow-outreach").hasAttribute("data-bump")).toBe(false);
    rerender(<JourneyFlow rows={[base, touched, touched]} />);
    expect(screen.getByTestId("flow-outreach").hasAttribute("data-bump")).toBe(true);
    expect(screen.getByTestId("flow-created").hasAttribute("data-bump")).toBe(false);
    expect(screen.getByTestId("flow-outreach").textContent).toBe(`2${UI.railOutreach}`);
  });
});
