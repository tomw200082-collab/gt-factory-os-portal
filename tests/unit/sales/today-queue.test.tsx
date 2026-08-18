import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TodayQueue } from "@/app/(sales)/_components/TodayQueue";
import { TODAY_SECTION_LABELS, UI } from "@/app/(sales)/_lib/labels";
import type { TodayRow } from "@/app/(sales)/_lib/types";

vi.mock("next/navigation", () => ({ usePathname: () => "/sales/today" }));

const base: TodayRow = {
  lead_id: "L1",
  item_type: "new_lead",
  org_id: "O1",
  org_name: "קפה בדיקה",
  contact_name: "דנה",
  phone_e164: "+972521234567",
  email: null,
  campaign_name: "קמפיין קיץ",
  platform: "fb",
  status: "new",
  assignee: null,
  next_touch_at: null,
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
};

function row(over: Partial<TodayRow>): TodayRow {
  return { ...base, ...over };
}

const noop = () => {};

function renderQueue(rows: TodayRow[]) {
  return render(
    <TodayQueue rows={rows} templates={null} onArm={noop} onPostpone={noop} onLost={noop} />,
  );
}

afterEach(cleanup);

describe("today queue", () => {
  it("groups rows under their Hebrew section headings", () => {
    renderQueue([
      row({ lead_id: "A", item_type: "new_lead" }),
      row({ lead_id: "B", item_type: "returning_customer", is_existing_customer: true }),
      row({ lead_id: "C", item_type: "due_follow_up", status: "working" }),
    ]);
    expect(screen.getByText(TODAY_SECTION_LABELS.returning_customer)).toBeTruthy();
    expect(screen.getByText(TODAY_SECTION_LABELS.new_lead)).toBeTruthy();
    expect(screen.getByText(TODAY_SECTION_LABELS.due_follow_up)).toBeTruthy();
  });

  it("keeps the sections in the order the work should be done", () => {
    renderQueue([
      row({ lead_id: "C", item_type: "due_follow_up", status: "working" }),
      row({ lead_id: "A", item_type: "new_lead" }),
      row({
        lead_id: "W",
        item_type: "conversion",
        status: "won",
        converted_order_ref: "#1001",
        converted_amount: "2400",
        converted_at: new Date().toISOString(),
      }),
      row({ lead_id: "B", item_type: "returning_customer", is_existing_customer: true }),
    ]);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      TODAY_SECTION_LABELS.conversion,
      TODAY_SECTION_LABELS.returning_customer,
      TODAY_SECTION_LABELS.new_lead,
      TODAY_SECTION_LABELS.due_follow_up,
    ]);
  });

  it("shows how many items each section holds", () => {
    renderQueue([
      row({ lead_id: "A", item_type: "new_lead" }),
      row({ lead_id: "B", item_type: "new_lead" }),
    ]);
    const section = screen.getByTestId("today-section-new_lead");
    expect(within(section).getByTestId("today-section-count").textContent).toBe("2");
  });

  it("celebrates a conversion and offers it no actions", () => {
    renderQueue([
      row({
        lead_id: "W",
        item_type: "conversion",
        status: "won",
        converted_order_ref: "#1001",
        converted_amount: "2400",
        converted_at: new Date().toISOString(),
      }),
    ]);
    const card = screen.getByTestId("today-card-W");
    expect(card.textContent).toContain("#1001");
    expect(within(card).queryByText(UI.call)).toBeNull();
    expect(within(card).queryByText(UI.markLost)).toBeNull();
  });

  it("gives every actionable card the four affordances", () => {
    renderQueue([row({ lead_id: "A" })]);
    const card = screen.getByTestId("today-card-A");
    expect(within(card).getByText(UI.call)).toBeTruthy();
    expect(within(card).getByText(UI.whatsapp)).toBeTruthy();
    expect(within(card).getByText(UI.postpone)).toBeTruthy();
    expect(within(card).getByText(UI.markLost)).toBeTruthy();
  });

  it("shows the SLA badge before the first touch and hides it after", () => {
    renderQueue([
      row({ lead_id: "A", sla_state: "overdue" }),
      row({
        lead_id: "B",
        item_type: "due_follow_up",
        status: "working",
        sla_state: null,
        first_touch_at: new Date().toISOString(),
        next_touch_at: new Date().toISOString(),
      }),
    ]);
    expect(within(screen.getByTestId("today-card-A")).getByTestId("sla-badge")).toBeTruthy();
    expect(within(screen.getByTestId("today-card-B")).queryByTestId("sla-badge")).toBeNull();
  });

  it("carries the customer's own history onto a returning-customer card", () => {
    renderQueue([
      row({
        lead_id: "R",
        item_type: "returning_customer",
        is_existing_customer: true,
        shopify_snapshot: {
          status: "נטש",
          rev12: "2152",
          orders: "5",
          days_since_last_order: "196",
          as_of: "2026-08-06",
        },
        shopify_snapshot_at: "2026-08-05T21:00:00Z",
      }),
    ]);
    const card = screen.getByTestId("today-card-R");
    expect(card.textContent).toContain("נטש");
    expect(card.textContent).toContain("2,152");
    // dated, never presented as live truth
    expect(card.textContent).toMatch(/נכון ל-/);
  });

  it("invents nothing when the snapshot is missing", () => {
    renderQueue([
      row({ lead_id: "R", item_type: "returning_customer", is_existing_customer: true }),
    ]);
    const card = screen.getByTestId("today-card-R");
    expect(card.textContent).not.toMatch(/נכון ל-/);
    expect(card.textContent).not.toContain("₪");
  });

  it("arms the card's own lead when an outreach starts", () => {
    // Regression: the outreach mutation was once bound to the *pending* lead,
    // which is null at the instant of the tap — every call posted to an empty
    // lead id. The id must travel from the card.
    const armed: Array<[string, string]> = [];
    render(
      <TodayQueue
        rows={[row({ lead_id: "L7" })]}
        templates={null}
        onArm={(id, ch) => armed.push([id, ch])}
        onPostpone={noop}
        onLost={noop}
      />,
    );
    fireEvent.click(within(screen.getByTestId("today-card-L7")).getByText(UI.call));
    expect(armed).toEqual([["L7", "call"]]);
  });

  it("disables the call when the lead has no phone, rather than faking a link", () => {
    renderQueue([row({ lead_id: "NP", phone_e164: null })]);
    const card = screen.getByTestId("today-card-NP");
    const call = within(card).getByText(UI.call).closest("button");
    expect(call).not.toBeNull();
    expect((call as HTMLButtonElement).disabled).toBe(true);
  });

  it("reveals a long section in batches, always naming the true total", () => {
    // The production backlog is 185 untouched leads; rendering every card at
    // once is unusable on a phone, and truncating silently would lie.
    const many = Array.from({ length: 40 }, (_, i) => row({ lead_id: `L${i}` }));
    renderQueue(many);
    const section = screen.getByTestId("today-section-new_lead");
    expect(within(section).getByTestId("today-section-count").textContent).toBe("40");
    expect(within(section).getAllByTestId(/^today-card-/).length).toBeLessThan(40);
    expect(within(section).getByTestId("today-show-more")).toBeTruthy();
  });
});
