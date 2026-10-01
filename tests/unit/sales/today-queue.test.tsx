import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { TodayQueue } from "@/app/(sales)/_components/TodayQueue";
import { TaskCard } from "@/app/(sales)/_components/TaskCard";
import { TODAY_SECTION_LABELS, UI } from "@/app/(sales)/_lib/labels";
import type { SalesLeadRow, SalesTaskRow, TodayRow } from "@/app/(sales)/_lib/types";

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
  age_days: 0,
  uncontactable: false,
};

function row(over: Partial<TodayRow>): TodayRow {
  return { ...base, ...over };
}

const noop = () => {};
const task: SalesTaskRow = {
  id: "T1", lead_id: "L1", org_id: null, kind: "contact_first", title: "קשר ראשון",
  due_at: new Date().toISOString(), status: "open", owner_email: "rep@synthetic.invalid",
  source_kind: "lead_event", source_id: "E1", source_event_id: "E1",
  reason: "קשר ראשון", needs_assignment: false,
  lead_context: { org_name: "קפה בדיקה", contact_name: "דנה", status: "new" },
};

/** The cap defaults high so the existing cases keep testing what they were
 *  written to test; the cases that are about capping pass their own. */
function renderQueue(rows: TodayRow[], dailyCap = 500) {
  return render(
    <TodayQueue
      rows={rows}
      dailyCap={dailyCap}
      slaHours={24}
      templates={null}
      onArm={noop}
      onPostpone={noop}
      onLost={noop}
    />,
  );
}

afterEach(cleanup);

describe("today queue", () => {
  it("offers the recorded email channel when an assigned task has email but no phone", () => {
    const armed: Array<[string, string]> = [];
    const emailLead = { ...base, id: "L1", phone_e164: null, email: "synthetic@example.invalid",
      source: "import", lost_reason: null, possible_duplicate_of: null,
      shopify_customer_id: null, shopify_snapshot_at: null } as SalesLeadRow;
    render(<TaskCard task={task} lead={emailLead} manager={false}
      onArm={(id, channel) => armed.push([id, channel])}
      onComplete={async () => undefined} onResolveContact={async () => undefined} />);
    const mail = screen.getByRole("link", { name: UI.email });
    expect(mail.getAttribute("href")).toContain("mailto:synthetic@example.invalid");
    expect(screen.queryByRole("link", { name: UI.call })).toBeNull();
    fireEvent.click(mail);
    expect(armed).toEqual([["L1", "email"]]);
  });
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
    // Commitments and news first, the backlog last. A promised callback ranks
    // above an untouched lead because someone was told it would happen today
    // (tranche 173); before that it rendered underneath the backlog, which is
    // also where it lost the daily budget.
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      TODAY_SECTION_LABELS.conversion,
      TODAY_SECTION_LABELS.returning_customer,
      TODAY_SECTION_LABELS.due_follow_up,
      TODAY_SECTION_LABELS.new_lead,
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

  it("does not repeat a lead-work card already represented by an open task", () => {
    render(<TodayQueue rows={[row({ lead_id: "A" }), row({ lead_id: "B", item_type: "conversion", status: "won" })]}
      taskLeadIds={new Set(["A"])} dailyCap={15} slaHours={24} templates={null}
      onArm={noop} onPostpone={noop} onLost={noop} />);
    expect(screen.queryByTestId("today-card-A")).toBeNull();
    expect(screen.getByTestId("today-card-B")).toBeTruthy();
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
        dailyCap={500}
        slaHours={24}
        templates={null}
        onArm={(id, ch) => armed.push([id, ch])}
        onPostpone={noop}
        onLost={noop}
      />,
    );
    fireEvent.click(within(screen.getByTestId("today-card-L7")).getByText(UI.call));
    expect(armed).toEqual([["L7", "call"]]);
  });

  it("routes a phone-less lead to its record without suggesting a call", () => {
    renderQueue([row({ lead_id: "NP", phone_e164: null })]);
    const card = screen.getByTestId("today-card-NP");
    expect(within(card).getByRole("link", { name: UI.taskOpenLead })).toBeTruthy();
    expect(within(card).queryByText(UI.call)).toBeNull();
  });

  it("offers email as the contact path when the lead has email but no phone", () => {
    const armed: Array<[string, string]> = [];
    render(<TodayQueue rows={[row({ lead_id: "EM", phone_e164: null, email: "synthetic@example.invalid" })]}
      dailyCap={500} slaHours={24} templates={null}
      onArm={(id, channel) => armed.push([id, channel])} onPostpone={noop} onLost={noop} />);
    const card = screen.getByTestId("today-card-EM");
    const email = within(card).getByRole("link", { name: UI.email });
    expect(email.getAttribute("href")).toBe("mailto:synthetic@example.invalid");
    expect(within(card).queryByRole("button", { name: UI.call })).toBeNull();
    fireEvent.click(email);
    expect(armed).toEqual([["EM", "email"]]);
  });

  it("routes a contactless lead to its record without offering an impossible call", () => {
    renderQueue([row({ lead_id: "GAP", phone_e164: null, email: null })]);
    const card = screen.getByTestId("today-card-GAP");
    expect(within(card).getByRole("link", { name: UI.taskOpenLead }).getAttribute("href"))
      .toBe("/sales/leads?lead=GAP");
    expect(within(card).queryByRole("button", { name: UI.call })).toBeNull();
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

  it("caps the backlog at the daily commitment and says what is waiting", () => {
    // 40 untouched leads, a commitment of 15: the section shows the true count,
    // renders the first batch of the committed set, and states the remainder in
    // words rather than quietly dropping 25 rows.
    renderQueue(
      Array.from({ length: 40 }, (_, i) => row({ lead_id: `N${i}`, item_type: "new_lead" })),
      15,
    );
    const section = screen.getByTestId("today-section-new_lead");
    expect(within(section).getByTestId("today-section-count").textContent).toBe("40");
    expect(within(section).getByTestId("today-daily-commitment").textContent).toContain(
      UI.dailyCommitment(15, 25),
    );
    // A sentence that names 25 waiting leads and offers no way to reach them is
    // a dead end; the count opens the list it is counting.
    expect(
      within(section).getByTestId("today-deferred-link").getAttribute("href"),
    ).toBe("/sales/leads");
  });

  it("states the rule that produced the number, not just the number", () => {
    // "Why these 15?" has to be answerable without a person standing next to
    // the screen. The line names the quota, and names it as one quota for the
    // whole queue — which is also why a later section can read 0.
    renderQueue(
      Array.from({ length: 40 }, (_, i) => row({ lead_id: `N${i}`, item_type: "new_lead" })),
      15,
    );
    // Once for the whole queue, not once per section: the sentence describes a
    // single budget, and two copies of it each claimed to describe all of it.
    const rules = screen.getAllByTestId("today-daily-cap-rule");
    expect(rules).toHaveLength(1);
    expect(rules[0].textContent).toBe(UI.dailyCapRule(15));

    // And the rule it states must be the rule that actually runs. The string
    // used to say the quota was "לכל התור" — for the whole queue — which was
    // true only while follow-ups shared the budget. A sentence that overstates
    // what it caps is exactly the kind of false thing this screen may not show.
    expect(rules[0].textContent).toContain("לידים חדשים");
    expect(rules[0].textContent).not.toContain("לכל התור");
  });

  it("says nothing about a quota that is not biting", () => {
    // A queue smaller than the cap has no "why these?" to answer.
    renderQueue(
      Array.from({ length: 3 }, (_, i) => row({ lead_id: `N${i}`, item_type: "new_lead" })),
      15,
    );
    expect(screen.queryByTestId("today-daily-cap-rule")).toBeNull();
  });

  it("spends one daily budget, and spends it only on the untouched backlog", () => {
    // Two regressions guarded by one case, because the second was the
    // over-correction for the first.
    //
    // A cap of 15 once meant 15 new leads *and* 15 follow-ups — thirty calls
    // from a setting whose label reads "כמה שיחות ביום" (gate P1). The fix
    // collapsed both sections onto a single budget drained in render order,
    // which made the follow-up section render zero cards against the live shape
    // (tranche 173). The budget is one number, and a promised callback does not
    // draw on it at all.
    renderQueue(
      [
        ...Array.from({ length: 20 }, (_, i) => row({ lead_id: `N${i}`, item_type: "new_lead" })),
        ...Array.from({ length: 20 }, (_, i) =>
          row({ lead_id: `F${i}`, item_type: "due_follow_up", status: "working" }),
        ),
      ],
      15,
    );
    // The backlog is the one claimant: 15 owed today, 5 deferred, and no second
    // allowance opened anywhere behind it.
    const newSection = screen.getByTestId("today-section-new_lead");
    expect(within(newSection).getByTestId("today-daily-commitment").textContent).toContain(
      UI.dailyCommitment(15, 5),
    );
    // Thirty calls cannot reappear from the other direction either: the quota
    // sentence exists once for the whole queue, so no section is quietly
    // holding a budget of its own.
    expect(screen.getAllByTestId("today-daily-cap-rule")).toHaveLength(1);
    // The promises are all on screen and defer nothing. `queryBy` rather than
    // an assertion on `dailyCommitment(0, N)`: a section that defers nothing
    // must not print a deferral sentence at all.
    const followSection = screen.getByTestId("today-section-due_follow_up");
    expect(within(followSection).queryByTestId("today-daily-commitment")).toBeNull();
    expect(within(followSection).getByTestId("today-section-count").textContent).toBe("20");
  });

  it("never defers a promised callback behind the daily cap", () => {
    // D1. A follow-up is a commitment already made: the rep told someone they
    // would call back today. The cap is a workload limit on leads nobody has
    // been promised anything about, and it may not eat a promise.
    renderQueue(
      [
        ...Array.from({ length: 20 }, (_, i) => row({ lead_id: `N${i}`, item_type: "new_lead" })),
        ...Array.from({ length: 3 }, (_, i) =>
          row({
            lead_id: `F${i}`,
            item_type: "due_follow_up",
            status: "working",
            next_touch_at: new Date(Date.now() - (i + 1) * 3600e3).toISOString(),
          }),
        ),
      ],
      15,
    );
    const followSection = screen.getByTestId("today-section-due_follow_up");
    expect(within(followSection).getAllByTestId(/^today-card-/).length).toBe(3);
    // And it is not merely rendered — nothing about it is deferred, so the
    // section states no remainder at all.
    expect(
      within(followSection).queryByTestId("today-daily-commitment"),
    ).toBeNull();
  });

  it("never defers a conversion or a returning customer behind the cap", () => {
    renderQueue(
      [
        row({ lead_id: "R1", item_type: "returning_customer", is_existing_customer: true }),
        ...Array.from({ length: 30 }, (_, i) => row({ lead_id: `N${i}`, item_type: "new_lead" })),
      ],
      1,
    );
    // The returning customer is the case that must never go quiet again, so a
    // cap of one still leaves it on screen alongside the one committed lead.
    expect(
      within(screen.getByTestId("today-section-returning_customer")).getAllByTestId(
        /^today-card-/,
      ).length,
    ).toBe(1);
    expect(
      screen.queryByTestId("today-section-returning_customer")?.querySelector(
        '[data-testid="today-daily-commitment"]',
      ),
    ).toBeNull();
  });

  it("states a lead's age in days, and turns it red past the SLA", () => {
    renderQueue([row({ lead_id: "OLD", age_days: 19 })]);
    const age = within(screen.getByTestId("today-card-OLD")).getByTestId("today-age");
    expect(age.textContent).toContain(UI.ageInDays(19));
    expect(age.getAttribute("data-tone")).toBe("overdue");
  });

  it("leaves a fresh lead's age calm", () => {
    renderQueue([row({ lead_id: "NEW", age_days: 0 })]);
    const age = within(screen.getByTestId("today-card-NEW")).getByTestId("today-age");
    expect(age.getAttribute("data-tone")).toBe("muted");
  });

  it("shows no SLA badge until a lead is actually overdue", () => {
    renderQueue([row({ lead_id: "OK", sla_state: "within" })]);
    expect(
      within(screen.getByTestId("today-card-OK")).queryByTestId("sla-badge"),
    ).toBeNull();

    cleanup();
    renderQueue([row({ lead_id: "LATE", sla_state: "overdue" })]);
    expect(
      within(screen.getByTestId("today-card-LATE")).getByTestId("sla-badge").textContent,
    ).toBe(UI.slaOverdue);
  });
});

describe("source-backed task card", () => {
  it("passes the source task identity when a task's call is started", () => {
    const armed = vi.fn();
    render(<TaskCard task={task} lead={row({ lead_id: "L1", phone_e164: "+972501111111" })}
      manager={false} onArm={armed} onComplete={vi.fn()} onResolveContact={vi.fn()} />);
    fireEvent.click(within(screen.getByTestId("task-card")).getByRole("link", { name: UI.call }));
    expect(armed).toHaveBeenCalledWith("L1", "call", "T1");
  });
  it("shows a registered reason instead of an unregistered trigger title", () => {
    render(<TaskCard task={{ ...task, title: "קשר ראשון", reason: "ליד חדש ממתין לקשר ראשון" }}
      manager={false} onArm={vi.fn()} onComplete={vi.fn()} onResolveContact={vi.fn()} />);
    expect(screen.queryByText("קשר ראשון")).toBeNull();
    expect(screen.getAllByText("ליד חדש ממתין לקשר ראשון")).toHaveLength(1);
  });
  it("says whether the completion form is open", () => {
    render(<TaskCard task={task} manager={false} onArm={vi.fn()} onComplete={vi.fn()} onResolveContact={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: UI.taskComplete });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
  it("lets the owning rep resolve a contact gap (D8)", () => {
    render(<TaskCard task={{ ...task, kind: "contact_resolution", title: "בירור פרטי קשר" }}
      manager={false} onArm={vi.fn()} onComplete={vi.fn()} onResolveContact={vi.fn()} />);
    expect(screen.getByText(UI.taskContactSave)).toBeTruthy();
  });
  it("keeps an unassigned contact gap with the manager (D8)", () => {
    render(<TaskCard task={{ ...task, kind: "contact_resolution", owner_email: null, needs_assignment: true }}
      manager={false} onArm={vi.fn()} onComplete={vi.fn()} onResolveContact={vi.fn()} />);
    expect(screen.queryByText(UI.taskContactSave)).toBeNull();
  });
  it("links to its lead and requires a note before completion", async () => {
    const completed = vi.fn(async () => undefined);
    render(<TaskCard task={task} manager={false} onArm={noop} onComplete={completed} onResolveContact={vi.fn()} />);
    const card = screen.getByTestId("task-card");
    expect(within(card).queryByText(/למה עכשיו/)).toBeNull();
    expect(within(card).getByRole("link", { name: UI.taskSource }).getAttribute("href"))
      .toContain("lead=L1");
    fireEvent.click(within(card).getAllByText(UI.taskComplete)[0]);
    const note = within(card).getByLabelText(UI.taskNote);
    const save = within(card).getAllByRole("button", { name: UI.taskComplete })[1];
    fireEvent.change(note, { target: { value: "אבגד" } });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(note, { target: { value: "אבגדה" } });
    fireEvent.click(save);
    await waitFor(() => expect(completed).toHaveBeenCalledWith("T1", "אבגדה"));
  });

  it("sends contactless work only through the manager verification form", async () => {
    const corrected = vi.fn(async () => undefined);
    render(<TaskCard task={{ ...task, kind: "contact_resolution", owner_email: null,
      needs_assignment: true }} manager onArm={noop} onComplete={vi.fn()} onResolveContact={corrected} />);
    const card = screen.getByTestId("task-card");
    expect(within(card).queryByText(UI.call)).toBeNull();
    const save = within(card).getByRole("button", { name: UI.taskContactSave });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(within(card).getByLabelText(UI.phone), { target: { value: "0501111234" } });
    fireEvent.change(within(card).getByLabelText(UI.taskContactSource), { target: { value: "אומת מול העסק" } });
    fireEvent.click(save);
    await waitFor(() => expect(corrected).toHaveBeenCalledWith("L1", {
      phone: "0501111234", email: undefined, provenance: "אומת מול העסק",
    }));
  });
});
