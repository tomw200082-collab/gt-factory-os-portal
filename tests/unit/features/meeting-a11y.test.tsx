// ---------------------------------------------------------------------------
// meeting-a11y.test.tsx — locks the accessibility + interaction semantics added
// to the weekly-meeting cockpit in tranche 037.
//
// These are the regression anchors for the a11y pass: the cadence rail's step
// semantics, the live-region announcements, aria-busy on async actions, the
// labelled day groups, the disabled-reason on "Firm week", and focus moving to
// the confirm button. The cadence hooks are mocked (no network); the pure date
// helpers from _lib/cadence stay real so the rendered labels are authentic.
//
// Codebase idiom: queryByX / getByX with toBeTruthy() — no jest-dom matchers.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DraftWeekResponse, DraftWeekRow } from "@/app/(planning)/planning/meeting/_lib/cadence";

// next/navigation — useRouter outside an App Router shell.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

// Session — planner can act (sees Generate + Firm controls).
vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({
    session: { user_id: "u1", display_name: "Tom", email: "t@x.com", role: "planner", theme_preference: "light" },
    setRole: vi.fn(),
    availableRoles: ["planner"],
    isLoading: false,
    loadError: null,
  }),
}));

// Mutable hook return slots the mock reads from, so individual tests can flip
// state (pending / success / error) without re-mocking the module.
const draftState: { current: { data?: DraftWeekResponse; isLoading: boolean; isError: boolean; error?: Error } } = {
  current: { data: undefined, isLoading: false, isError: false },
};
const genState: { current: Record<string, unknown> } = {
  current: { mutate: vi.fn(), isPending: false, isSuccess: false, isError: false },
};
const firmState: { current: Record<string, unknown> } = {
  current: { mutate: vi.fn(), data: undefined, isPending: false, isError: false },
};

// Keep the pure helpers real; override only the hooks.
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

// The cockpit opens on TODAY's cadence step, which is only "firm" on Thursdays.
// For the firm-panel assertions, explicitly navigate to the Firm step first so
// the suite is deterministic regardless of the day it runs.
function openFirmPanel() {
  fireEvent.click(screen.getByRole("button", { name: /Firm — Thursday/i }));
}

function teaRow(over: Partial<DraftWeekRow> = {}): DraftWeekRow {
  return {
    plan_id: "p1",
    plan_date: "2099-01-04", // a Sunday far in the future — lands in the board
    track: "tea_tank",
    base_bom_head_id: "BOM-BASE-CAL-REG",
    base_name: "CALM base",
    base_family: "calm",
    batch_size_l: 500,
    packs: [
      { item_id: "FG-CAL-1L", item_name: "CALM 1L", qty: 167 },
      { item_id: "FG-CAL-500ML", item_name: "CALM 0.5L", qty: 333 },
    ],
    item_id: null,
    item_name: null,
    planned_qty: 500,
    uom: "L",
    notes: null,
    ...over,
  };
}

function draftResponse(rows: DraftWeekRow[], over: Partial<DraftWeekResponse> = {}): DraftWeekResponse {
  return {
    week_start: "2099-01-04",
    week_end: "2099-01-10",
    as_of: "2099-01-01",
    batch_count: rows.length,
    firmed_count: 0,
    rows,
    ...over,
  };
}

function reset() {
  draftState.current = { data: undefined, isLoading: false, isError: false };
  genState.current = { mutate: vi.fn(), isPending: false, isSuccess: false, isError: false };
  firmState.current = { mutate: vi.fn(), data: undefined, isPending: false, isError: false };
}

afterEach(() => {
  cleanup();
  reset();
});

describe("weekly-meeting cockpit — cadence rail semantics", () => {
  it("renders a labelled nav with exactly one aria-current=step (today)", () => {
    render(<PlanningMeetingPage />);
    const nav = screen.getByRole("navigation", { name: /weekly cadence steps/i });
    expect(nav).toBeTruthy();
    const current = nav.querySelectorAll('[aria-current="step"]');
    expect(current.length).toBe(1);
  });

  it("marks the active step button with aria-pressed=true", () => {
    render(<PlanningMeetingPage />);
    const nav = screen.getByRole("navigation", { name: /weekly cadence steps/i });
    const pressed = nav.querySelectorAll('[aria-pressed="true"]');
    expect(pressed.length).toBe(1);
  });

  it("switches the active step (and aria-pressed) on click", () => {
    render(<PlanningMeetingPage />);
    const procure = screen.getByRole("button", { name: /Procure — Sunday/i });
    fireEvent.click(procure);
    expect(procure.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("weekly-meeting cockpit — firm panel a11y", () => {
  it("labels each day column as a group with its date", () => {
    draftState.current = { data: draftResponse([teaRow()]), isLoading: false, isError: false };
    render(<PlanningMeetingPage />);
    openFirmPanel();
    const groups = screen.getAllByRole("group");
    // At least the 5 working-day columns are present and labelled.
    expect(groups.length).toBeGreaterThanOrEqual(5);
    expect(groups.some((g) => /batch/i.test(g.getAttribute("aria-label") ?? ""))).toBe(true);
  });

  it("disables 'Firm week' with an explanatory title when there is nothing to firm", () => {
    draftState.current = { data: draftResponse([], { batch_count: 0 }), isLoading: false, isError: false };
    render(<PlanningMeetingPage />);
    openFirmPanel();
    const firmBtn = screen.getByRole("button", { name: /^Firm week$/i }) as HTMLButtonElement;
    expect(firmBtn.disabled).toBe(true);
    expect(firmBtn.getAttribute("title")).toMatch(/nothing to firm/i);
  });

  it("announces a generate success via role=status", () => {
    draftState.current = { data: draftResponse([teaRow()]), isLoading: false, isError: false };
    genState.current = {
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      isError: false,
      data: { idempotent_replay: false, draft_total_upcoming: 3 },
    };
    render(<PlanningMeetingPage />);
    openFirmPanel();
    const status = screen.getAllByRole("status").find((n) => /Generated drafts/i.test(n.textContent ?? ""));
    expect(status).toBeTruthy();
  });

  it("announces a generate error via role=alert", () => {
    genState.current = {
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: true,
      error: new Error("engine offline"),
    };
    render(<PlanningMeetingPage />);
    openFirmPanel();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/engine offline/i);
  });

  it("exposes aria-busy on the generate button while pending", () => {
    genState.current = { mutate: vi.fn(), isPending: true, isSuccess: false, isError: false };
    render(<PlanningMeetingPage />);
    openFirmPanel();
    const gen = screen.getByRole("button", { name: /Generating/i });
    expect(gen.getAttribute("aria-busy")).toBe("true");
  });

  it("moves focus to the confirm button when the inline firm-confirm opens", async () => {
    draftState.current = { data: draftResponse([teaRow()]), isLoading: false, isError: false };
    render(<PlanningMeetingPage />);
    openFirmPanel();
    fireEvent.click(screen.getByRole("button", { name: /^Firm week$/i }));
    const confirm = screen.getByRole("button", { name: /Confirm firm/i });
    await waitFor(() => expect(document.activeElement).toBe(confirm));
  });
});
