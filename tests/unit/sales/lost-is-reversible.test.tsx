import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LOST_REASONS, UI } from "@/app/(sales)/_lib/labels";
import type { SalesLeadRow, TodayRow } from "@/app/(sales)/_lib/types";

// ---------------------------------------------------------------------------
// D3 — "אבוד" is reversible from every path that sets it.
//
// Three doors record a lead as lost, and until tranche 173 exactly one of them
// offered a way back: the Today card's אבוד button. The other two — the outcome
// sheet the whole call-and-return loop leads to, and the drawer's own status
// control — left the same four-tap recovery the undo was written to end (find
// the lead, open the drawer, set the status back by hand).
//
// Counting `setUndo` occurrences proves nothing: there were already four, two
// of them teardowns. So each door is driven for real, and the assertion is that
// the toast offers the way back AND that taking it writes the reversal — status
// back to 'working', carrying the date the lead held before.
// ---------------------------------------------------------------------------

interface Call {
  leadId: string;
  vars: Record<string, unknown>;
}

const sink = vi.hoisted(() => ({
  status: [] as Call[],
  outcome: [] as Call[],
  /** What the mocked convert endpoint answers. convert_lead returns FALSE, not
   *  an error, when the lead is no longer open. */
  convertResult: { converted: true } as { lead_id?: string; converted: boolean },
  nextTouch: [] as Call[],
}));

vi.mock("@/app/(sales)/_lib/api", () => {
  const recorder = (bucket: Call[]) => (leadId: string) => ({
    mutate: (
      vars: Record<string, unknown>,
      opts?: { onSuccess?: (data: unknown) => void },
    ) => {
      bucket.push({ leadId, vars });
      opts?.onSuccess?.({});
    },
    isPending: false,
    isError: false,
    error: null,
  });
  const idle = () => ({ mutate: () => {}, isPending: false, isError: false, error: null });
  const settled = <T,>(data: T) => ({
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    refetch: () => {},
  });
  return {
    useSetStatus: recorder(sink.status),
    useOutcome: recorder(sink.outcome),
    // S5 added a close on all three sheets; unmocked, the pages throw here.
    useConvert: (leadId: string) => ({
      mutate: (
        vars: Record<string, unknown>,
        opts?: { onSuccess?: (data: unknown) => void },
      ) => {
        void leadId;
        void vars;
        opts?.onSuccess?.(sink.convertResult);
      },
      isPending: false,
      isError: false,
      error: null,
    }),
    // A recorder, not `idle`: idle's mutate never calls onSuccess, so the
    // second toast would never be raised and the undo-scoping case below would
    // pass for the wrong reason.
    useSetNextTouch: recorder(sink.nextTouch),
    useAddNote: idle,
    useAssign: idle,
    useBulkAssign: idle,
    useOutreach: idle,
    useToday: () => settled({ rows: todayRows(), queue: { daily_cap: 15, order: "newest_first" } }),
    useLeads: () => settled(leadRows()),
    useLeadEvents: () => settled([]),
    useWeekStats: () => settled(undefined),
    useSettings: () =>
      settled({
        sla_hours: 24,
        whatsapp_templates: { new_lead: "", reminder: "", returning_customer: "" },
        lost_reasons: [...LOST_REASONS],
        queue: { daily_cap: 15, order: "newest_first" },
        assignees: [],
        last_changes: [],
      }),
  };
});

vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({ session: { email: "tom@gteveryday.com", role: "admin" } }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/sales",
  useSearchParams: () => new URLSearchParams("lead=L1"),
}));

/** The date the lead was carrying before it was lost — what the undo restores. */
const PRIOR_TOUCH = "2026-08-28T06:00:00.000Z";

function todayRows(): TodayRow[] {
  return [
    {
      lead_id: "L1",
      item_type: "new_lead",
      org_id: "O1",
      org_name: "קפה בדיקה",
      contact_name: "דנה",
      phone_e164: "+972521234567",
      email: null,
      campaign_name: null,
      platform: null,
      status: "new",
      assignee: null,
      next_touch_at: PRIOR_TOUCH,
      first_touch_at: null,
      created_at: new Date().toISOString(),
      is_existing_customer: false,
      shopify_snapshot: null,
      shopify_snapshot_at: null,
      converted_order_ref: null,
      converted_amount: null,
      converted_at: null,
      sla_deadline_at: new Date(Date.now() + 20 * 3600e3).toISOString(),
      sla_state: "within",
      age_days: 0,
      uncontactable: false,
    },
  ];
}

function leadRows(): SalesLeadRow[] {
  return [
    {
      id: "L1",
      org_id: "O1",
      org_name: "קפה בדיקה",
      contact_name: "דנה",
      phone_e164: "+972521234567",
      email: null,
      source: "meta",
      campaign_name: null,
      ad_name: null,
      platform: null,
      is_organic: null,
      status: "new",
      lost_reason: null,
      assignee: null,
      next_touch_at: PRIOR_TOUCH,
      first_touch_at: null,
      possible_duplicate_of: null,
      converted_order_ref: null,
      converted_amount: null,
      created_at: new Date().toISOString(),
      is_existing_customer: false,
      shopify_customer_id: null,
      shopify_snapshot: null,
      shopify_snapshot_at: null,
      age_days: 0,
      sla_deadline_at: new Date(Date.now() + 20 * 3600e3).toISOString(),
      sla_state: "within",
      next_touch_overdue: false,
      uncontactable: false,
    },
  ];
}

/** A real trip away from the app and back — what raises the owed sheet. */
async function returnToApp() {
  await act(async () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

/** Arm an owed outcome, the way returning from a call does. */
function armReturnFromCall() {
  window.sessionStorage.setItem(
    "gt.sales.outreach",
    JSON.stringify({ leadId: "L1", channel: "call", at: Date.now() - 60_000 }),
  );
  window.__GT_SALES_OUTCOME_DELAY_MS__ = 0;
}

/** Take the way back the toast offers, and report what it wrote. */
function takeTheUndo(): Call {
  const action = screen.getByTestId("sales-toast-action");
  expect(action.textContent).toContain(UI.undo);
  fireEvent.click(action);
  const reversal = sink.status.at(-1);
  expect(reversal, "the undo wrote nothing").toBeTruthy();
  return reversal as Call;
}

beforeEach(() => {
  sink.status.length = 0;
  sink.outcome.length = 0;
  sink.convertResult = { converted: true };
  sink.nextTouch.length = 0;
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  delete window.__GT_SALES_OUTCOME_DELAY_MS__;
});

describe("marking a lead lost is reversible", () => {
  it("door 1 — the Today card's אבוד button", async () => {
    const { default: TodayPage } = await import("@/app/(sales)/sales/today/page");
    render(<TodayPage />);

    fireEvent.click(within(screen.getByTestId("today-card-L1")).getByText(UI.markLost));
    fireEvent.click(screen.getByTestId(`lost-reason-${LOST_REASONS[0]}`));
    fireEvent.click(screen.getByTestId("lost-confirm"));
    expect(sink.outcome.at(-1)?.vars.result).toBe("lost");

    const reversal = takeTheUndo();
    expect(reversal.leadId).toBe("L1");
    expect(reversal.vars.status).toBe("working");
    expect(reversal.vars.next_touch_at).toBe(PRIOR_TOUCH);
  });

  it("door 2 — the outcome sheet the call-and-return loop leads to", async () => {
    armReturnFromCall();
    const { default: TodayPage } = await import("@/app/(sales)/sales/today/page");
    render(<TodayPage />);

    // The sheet is owed and raised; answer it with אבוד.
    fireEvent.click(screen.getByTestId("outcome-lost"));
    fireEvent.click(screen.getByTestId(`lost-reason-${LOST_REASONS[0]}`));
    fireEvent.click(screen.getByTestId("lost-confirm"));
    expect(sink.outcome.at(-1)?.vars.result).toBe("lost");

    const reversal = takeTheUndo();
    expect(reversal.leadId).toBe("L1");
    expect(reversal.vars.status).toBe("working");
    expect(reversal.vars.next_touch_at).toBe(PRIOR_TOUCH);
  });

  it("door 3 — the leads drawer's own status control", async () => {
    const { default: LeadsPage } = await import("@/app/(sales)/sales/leads/page");
    render(<LeadsPage />);

    fireEvent.click(screen.getByTestId("drawer-set-lost"));
    fireEvent.click(screen.getByTestId(`drawer-lost-reason-${LOST_REASONS[0]}`));
    fireEvent.click(screen.getByTestId("drawer-lost-confirm"));
    const lost = sink.status.at(-1);
    expect(lost?.vars.status).toBe("lost");

    const reversal = takeTheUndo();
    expect(reversal.leadId).toBe("L1");
    expect(reversal.vars.status).toBe("working");
    expect(reversal.vars.next_touch_at).toBe(PRIOR_TOUCH);
  });
});

// ---------------------------------------------------------------------------
// The undo belongs to its toast — not to the screen.
// ---------------------------------------------------------------------------

describe("the way back does not outlive the message that offered it", () => {
  it("a later toast never inherits an earlier toast's undo target", async () => {
    // The defect: `undo` was sibling state that no toast owned. Record אבוד on
    // a lead, then raise ANY other toast, and that second toast rendered a
    // "בטל" button still pointing at the first lead — a reversal of something
    // the message on screen was not about.
    const { default: TodayPage } = await import("@/app/(sales)/sales/today/page");
    render(<TodayPage />);

    // 1. lose the lead — the toast offers a way back.
    fireEvent.click(within(screen.getByTestId("today-card-L1")).getByText(UI.markLost));
    fireEvent.click(screen.getByTestId(`lost-reason-${LOST_REASONS[0]}`));
    fireEvent.click(screen.getByTestId("lost-confirm"));
    expect(screen.getByTestId("sales-toast-action")).toBeTruthy();

    // 2. raise a different toast — postponing the same card is enough.
    fireEvent.click(within(screen.getByTestId("today-card-L1")).getByText(UI.postpone));
    fireEvent.click(screen.getByTestId("next-touch-tomorrow"));

    // 3. the new message must carry no reversal at all.
    expect(screen.queryByTestId("sales-toast-action")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A close that did not happen is not a close.
// ---------------------------------------------------------------------------

describe("closing a deal reports what actually happened", () => {
  it("announces success only when the lead was really converted", async () => {
    const { default: TodayPage } = await import("@/app/(sales)/sales/today/page");
    render(<TodayPage />);
    armReturnFromCall();

    fireEvent.click(within(screen.getByTestId("today-card-L1")).getByText(UI.call));
    // arming is enough to raise the sheet on the next visibility return
    await returnToApp();

    fireEvent.click(screen.getByTestId("outcome-won"));
    fireEvent.change(screen.getByTestId("won-document-number"), {
      target: { value: "GI-2026-0042" },
    });
    fireEvent.click(screen.getByTestId("won-confirm"));
    expect(screen.getByTestId("sales-toast")).toBeTruthy();
  });

  it("says so, and keeps the sheet open, when the lead was no longer open", async () => {
    // sales_core.convert_lead returns FALSE — not an error — when the lead has
    // already been won or lost. This is the race S3 creates by putting a second
    // person on the queue: one rep marks אבוד while the other is closing the
    // deal. Reporting "נסגר ✓" for it is the workspace stating something false.
    sink.convertResult = { converted: false };
    const { default: TodayPage } = await import("@/app/(sales)/sales/today/page");
    render(<TodayPage />);
    armReturnFromCall();

    fireEvent.click(within(screen.getByTestId("today-card-L1")).getByText(UI.call));
    await returnToApp();

    fireEvent.click(screen.getByTestId("outcome-won"));
    fireEvent.change(screen.getByTestId("won-document-number"), {
      target: { value: "GI-2026-0042" },
    });
    fireEvent.click(screen.getByTestId("won-confirm"));

    // No celebration ...
    expect(screen.queryByTestId("sales-toast")).toBeNull();
    // ... the sheet is still there, and it says why.
    expect(screen.getByTestId("outcome-sheet")).toBeTruthy();
    expect(screen.getByTestId("outcome-error").textContent).toBe(UI.wonNotOpen);
  });
});
