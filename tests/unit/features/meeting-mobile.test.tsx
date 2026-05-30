// ---------------------------------------------------------------------------
// meeting-mobile.test.tsx — locks the mobile/touch UX disclosures added to the
// weekly-meeting cockpit in tranche 038:
//   • CommitmentPanel "+N more" is a real expand/collapse disclosure.
//   • BatchChip with packs is a tap-to-expand button revealing the breakdown.
//   • The cadence-rail connector arrows are hidden on narrow phones.
//
// The cadence hooks are mocked (no network); the pure date helpers stay real so
// the rendered day-board is authentic and a batch chip actually renders.
//
// Codebase idiom: queryByX / getByX with toBeTruthy() — no jest-dom matchers.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DraftWeekResponse, DraftWeekRow } from "@/app/(planning)/planning/meeting/_lib/cadence";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({
    session: { user_id: "u1", display_name: "Tom", email: "t@x.com", role: "planner", theme_preference: "light" },
    setRole: vi.fn(),
    availableRoles: ["planner"],
    isLoading: false,
    loadError: null,
  }),
}));

const draftState: { current: { data?: DraftWeekResponse; isLoading: boolean; isError: boolean; error?: Error } } = {
  current: { data: undefined, isLoading: false, isError: false },
};
const genState = { current: { mutate: vi.fn(), isPending: false, isSuccess: false, isError: false } as Record<string, unknown> };
const firmState = { current: { mutate: vi.fn(), data: undefined, isPending: false, isError: false } as Record<string, unknown> };

vi.mock("@/app/(planning)/planning/meeting/_lib/cadence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/(planning)/planning/meeting/_lib/cadence")>();
  return {
    ...actual,
    useDraftWeek: () => draftState.current,
    useGenerateDrafts: () => genState.current,
    useFirmWeek: () => firmState.current,
    useFirmedWeekDemand: () => ({ data: undefined, isLoading: false }),
  };
});

import PlanningMeetingPage from "@/app/(planning)/planning/meeting/page";
import { defaultFirmWeekStart, workingDaysOf } from "@/app/(planning)/planning/meeting/_lib/cadence";

// Anchor the fixture to the real working days of the current target week so the
// chip lands in the rendered board (the board only maps the active week's days).
const WEEK = defaultFirmWeekStart();
const PLAN_DATE = workingDaysOf(WEEK)[0];

function packs(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    item_id: `FG-${i}`,
    item_name: `Product ${i}`,
    qty: 10 + i,
  }));
}

function teaRow(over: Partial<DraftWeekRow> = {}): DraftWeekRow {
  return {
    plan_id: "p1",
    plan_date: PLAN_DATE,
    track: "tea_tank",
    base_bom_head_id: "BOM-BASE-CAL-REG",
    base_name: "CALM base",
    base_family: "calm",
    batch_size_l: 500,
    packs: packs(9), // 9 distinct FGs → rollup has 9 entries (> the TOP=8 cap)
    item_id: null,
    item_name: null,
    planned_qty: 500,
    uom: "L",
    notes: null,
    ...over,
  };
}

function draftResponse(rows: DraftWeekRow[]): DraftWeekResponse {
  return {
    week_start: WEEK,
    week_end: WEEK,
    as_of: WEEK,
    batch_count: rows.length,
    firmed_count: 0,
    rows,
  };
}

function openFirmPanel() {
  fireEvent.click(screen.getByRole("button", { name: /Firm — Thursday/i }));
}

afterEach(() => {
  cleanup();
  draftState.current = { data: undefined, isLoading: false, isError: false };
  genState.current = { mutate: vi.fn(), isPending: false, isSuccess: false, isError: false };
  firmState.current = { mutate: vi.fn(), data: undefined, isPending: false, isError: false };
});

describe("weekly-meeting cockpit — cadence rail mobile", () => {
  it("hides the decorative connector arrows on narrow screens", () => {
    render(<PlanningMeetingPage />);
    const nav = screen.getByRole("navigation", { name: /weekly cadence steps/i });
    const connectors = Array.from(nav.querySelectorAll("svg")).filter((s) =>
      (s.getAttribute("class") ?? "").includes("mx-1"),
    );
    // two connectors between the three steps, both hidden until the sm breakpoint
    expect(connectors.length).toBe(2);
    connectors.forEach((s) => {
      const cls = s.getAttribute("class") ?? "";
      expect(cls.includes("hidden")).toBe(true);
      expect(cls.includes("sm:block")).toBe(true);
    });
  });
});

describe("weekly-meeting cockpit — commitment disclosure", () => {
  it("expands and collapses the '+N more' product list", () => {
    draftState.current = { data: draftResponse([teaRow()]), isLoading: false, isError: false };
    render(<PlanningMeetingPage />);
    openFirmPanel();

    const toggle = screen.getByRole("button", { name: /more product/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // rollupDraftFgUnits sorts by units desc; packs have qty 10+i, so Product 0
    // (lowest qty) is the one pushed past the TOP=8 cap → hidden while collapsed.
    expect(screen.queryByText("Product 0")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Product 0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /show fewer/i }));
    expect(screen.queryByText("Product 0")).toBeNull();
  });
});

describe("weekly-meeting cockpit — batch chip tap-to-expand", () => {
  it("renders a pack-bearing chip as a disclosure button and reveals the breakdown on tap", () => {
    draftState.current = { data: draftResponse([teaRow()]), isLoading: false, isError: false };
    render(<PlanningMeetingPage />);
    openFirmPanel();

    const chip = screen.getByRole("button", { name: /CALM base/i });
    expect(chip.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    // the inline breakdown list now shows the pack rows
    expect(chip.querySelectorAll("ul li").length).toBe(9);
  });
});
