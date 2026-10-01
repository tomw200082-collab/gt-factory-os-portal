import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MiniRail } from "@/app/(sales)/_components/MiniRail";
import { railFromRow } from "@/app/(sales)/_lib/leadMilestones";
import { UI } from "@/app/(sales)/_lib/labels";

afterEach(cleanup);
const base = { created_at: "2026-09-30T08:00:00Z", first_touch_at: null, next_touch_at: null, converted_order_ref: null };

describe("mini journey rail (D1 signature)", () => {
  it("derives four nodes from the row's own fields", () => {
    expect(railFromRow(base).map((n) => n.reached)).toEqual([true, false, false, false]);
    expect(railFromRow({ ...base, next_touch_at: "2026-10-02T06:00:00Z" })[2].reached).toBe(false);
    const worked = railFromRow({ ...base, first_touch_at: "2026-09-30T09:00:00Z", next_touch_at: "2026-10-02T06:00:00Z" });
    expect(worked.map((n) => n.reached)).toEqual([true, true, true, false]);
    expect(railFromRow({ ...base, converted_order_ref: "#1001" }).at(-1)).toMatchObject({ kind: "converted", reached: true });
  });

  it("names only reached milestones to assistive technology and marks the current one", () => {
    render(<MiniRail row={{ ...base, first_touch_at: "2026-09-30T09:00:00Z" }} />);
    const rail = screen.getByRole("list", { name: UI.railTitle });
    expect(rail).toBeTruthy();
    expect(screen.getByLabelText(UI.railCreated)).toBeTruthy();
    const current = screen.getByLabelText(UI.railOutreach);
    expect(current.getAttribute("aria-current")).toBe("step");
    expect(screen.queryByLabelText(UI.railNextAction)).toBeNull();
    expect(screen.queryByLabelText(UI.railConverted)).toBeNull();
  });

  it("turns the order node green only for a verified order", () => {
    const { container } = render(<MiniRail row={{ ...base, converted_order_ref: "#1001" }} />);
    expect(container.querySelector(".s-mini-rail-converted.s-mini-rail-reached")).toBeTruthy();
  });
});
