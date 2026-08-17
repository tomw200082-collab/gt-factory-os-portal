import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LeadsTable } from "@/app/(sales)/_components/LeadsTable";
import { LeadDrawer } from "@/app/(sales)/_components/LeadDrawer";
import { EventTimeline } from "@/app/(sales)/_components/EventTimeline";
import { matchesQuery } from "@/app/(sales)/_lib/format";
import { EVENT_LABELS, STATUS_LABELS, UI } from "@/app/(sales)/_lib/labels";
import type { LeadEventRow, SalesLeadRow } from "@/app/(sales)/_lib/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/sales/leads",
}));

const base: SalesLeadRow = {
  id: "L1",
  org_id: "O1",
  org_name: "קפה בדיקה",
  contact_name: "דנה",
  phone_e164: "+972521234567",
  email: "dana@cafe.co.il",
  source: "import_meta_export",
  campaign_name: "קמפיין קיץ",
  ad_name: null,
  platform: "fb",
  is_organic: false,
  status: "new",
  lost_reason: null,
  assignee: null,
  next_touch_at: null,
  first_touch_at: null,
  possible_duplicate_of: null,
  converted_order_ref: null,
  converted_amount: null,
  created_at: "2026-08-10T09:00:00Z",
  is_existing_customer: false,
  shopify_customer_id: null,
  shopify_snapshot: null,
  shopify_snapshot_at: null,
  age_days: 7,
  sla_deadline_at: "2026-08-11T09:00:00Z",
  sla_state: "overdue",
  next_touch_overdue: false,
};

function lead(over: Partial<SalesLeadRow>): SalesLeadRow {
  return { ...base, ...over };
}

const noop = () => {};

afterEach(cleanup);

describe("lead search", () => {
  it("matches a business or contact name, case-insensitively", () => {
    expect(matchesQuery(base, "קפה")).toBe(true);
    expect(matchesQuery(base, "דנה")).toBe(true);
    expect(matchesQuery(base, "DANA")).toBe(true);
    expect(matchesQuery(base, "מסעדה")).toBe(false);
  });

  it("finds a lead by a phone number typed the way people type it", () => {
    // The stored value is +972521234567; nobody types that.
    expect(matchesQuery(base, "052-1234567")).toBe(true);
    expect(matchesQuery(base, "0521234567")).toBe(true);
    expect(matchesQuery(base, "1234567")).toBe(true);
    expect(matchesQuery(base, "0529999999")).toBe(false);
  });

  it("treats an empty query as no filter", () => {
    expect(matchesQuery(base, "   ")).toBe(true);
  });
});

describe("leads table", () => {
  it("anchors each row on the business and shows its status pill", () => {
    render(<LeadsTable rows={[lead({})]} onOpen={noop} />);
    expect(screen.getAllByText("קפה בדיקה").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("status-pill-new").length).toBeGreaterThan(0);
  });

  it("flags a possible duplicate without blocking it", () => {
    render(<LeadsTable rows={[lead({ possible_duplicate_of: "L0" })]} onOpen={noop} />);
    expect(screen.getAllByTestId("duplicate-badge").length).toBeGreaterThan(0);
  });

  it("opens a lead from the row", () => {
    const opened: string[] = [];
    render(<LeadsTable rows={[lead({})]} onOpen={(l) => opened.push(l.id)} />);
    fireEvent.click(screen.getByTestId("lead-row-L1"));
    expect(opened).toEqual(["L1"]);
  });

  it("opens a lead from the keyboard", () => {
    const opened: string[] = [];
    render(<LeadsTable rows={[lead({})]} onOpen={(l) => opened.push(l.id)} />);
    fireEvent.keyDown(screen.getByTestId("lead-row-L1"), { key: "Enter" });
    expect(opened).toEqual(["L1"]);
  });

  it("isolates every phone number from the surrounding RTL text", () => {
    // fmtPhone returns raw E.164 for anything it cannot parse, and a leading
    // "+" inside an RTL paragraph resolves to the paragraph direction and
    // renders on the wrong side. <bdi dir="ltr"> makes the rendering correct
    // whichever branch fmtPhone took — so it must wrap every phone, not just
    // the pretty ones.
    const { container } = render(
      <LeadsTable rows={[lead({ phone_e164: "+12025550123" })]} onOpen={noop} />,
    );
    const isolated = [...container.querySelectorAll("bdi[dir='ltr']")].map((el) => el.textContent);
    expect(isolated).toContain("+12025550123");
  });
});

describe("lead drawer", () => {
  function renderDrawer(over: Partial<SalesLeadRow> = {}, events: LeadEventRow[] = []) {
    const calls = { status: [] as unknown[], note: [] as string[], closed: 0 };
    render(
      <LeadDrawer
        lead={lead(over)}
        events={events}
        eventsLoading={false}
        templates={null}
        onClose={() => (calls.closed += 1)}
        onStatus={(s, r) => calls.status.push([s, r])}
        onNote={(n) => calls.note.push(n)}
        onNextTouch={noop}
        onAssign={noop}
      />,
    );
    return calls;
  }

  it("is a labelled modal dialog in RTL", () => {
    renderDrawer();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("dir")).toBe("rtl");
  });

  it("closes on Escape", () => {
    const calls = renderDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(calls.closed).toBe(1);
  });

  it("moves a lead to working", () => {
    const calls = renderDrawer();
    fireEvent.click(screen.getByTestId("drawer-set-working"));
    expect(calls.status).toEqual([["working", undefined]]);
  });

  it("will not lose a lead without a reason", () => {
    const calls = renderDrawer();
    fireEvent.click(screen.getByTestId("drawer-set-lost"));
    const confirm = screen.getByTestId("drawer-lost-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(UI.lostReasonTitle), {
      target: { value: "אין תקציב" },
    });
    fireEvent.click(screen.getByTestId("drawer-lost-confirm"));
    expect(calls.status).toEqual([["lost", "אין תקציב"]]);
  });

  it("refuses to save an empty note", () => {
    renderDrawer();
    expect((screen.getByTestId("drawer-note-save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a won lead as evidence and offers no status controls", () => {
    renderDrawer({ status: "won", converted_order_ref: "#1042" });
    const banner = screen.getByTestId("won-banner");
    expect(banner.textContent).toContain("#1042");
    // The order ref is a Latin/numeric run inside a Hebrew sentence: isolated,
    // or the leading "#" renders on the wrong side of the digits.
    expect(banner.querySelector("bdi[dir='ltr']")?.textContent).toBe("#1042");
    expect(screen.queryByTestId("drawer-set-working")).toBeNull();
    expect(screen.queryByTestId("drawer-set-lost")).toBeNull();
    expect(screen.getByText(STATUS_LABELS.won)).toBeTruthy();
  });
});

describe("event timeline", () => {
  const event = (over: Partial<LeadEventRow>): LeadEventRow => ({
    id: "E1",
    lead_id: "L1",
    event_type: "note",
    payload: {},
    actor: "Tom",
    created_at: "2026-08-17T09:00:00Z",
    ...over,
  });

  it("names every event type in Hebrew", () => {
    render(
      <EventTimeline
        events={[
          event({ id: "E1", event_type: "created" }),
          event({ id: "E2", event_type: "outreach", payload: { channel: "call" } }),
          event({ id: "E3", event_type: "outcome", payload: { result: "no_answer" } }),
        ]}
      />,
    );
    expect(screen.getByText(EVENT_LABELS.created)).toBeTruthy();
    expect(screen.getByText(EVENT_LABELS.outreach)).toBeTruthy();
    expect(screen.getByText(EVENT_LABELS.outcome)).toBeTruthy();
  });

  it("reads a status change as Hebrew labels, not schema values", () => {
    render(
      <EventTimeline
        events={[event({ event_type: "status_change", payload: { from: "new", to: "working" } })]}
      />,
    );
    const timeline = screen.getByTestId("event-timeline");
    expect(timeline.textContent).toContain(STATUS_LABELS.working);
    expect(timeline.textContent).not.toContain("working");
  });

  it("shows a note's text and who wrote it", () => {
    render(<EventTimeline events={[event({ payload: { note: "התקשרתי, לא ענו" } })]} />);
    expect(screen.getByText("התקשרתי, לא ענו")).toBeTruthy();
    expect(screen.getByTestId("event-timeline").textContent).toContain("Tom");
  });

  it("renders an unknown event type rather than dropping it", () => {
    render(<EventTimeline events={[event({ event_type: "some_future_type" })]} />);
    expect(screen.getByText("some_future_type")).toBeTruthy();
  });
});
