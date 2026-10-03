import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SlaBadge, SlaTimeLeft } from "@/app/(sales)/_components/SlaBadge";
import { TodayQueue } from "@/app/(sales)/_components/TodayQueue";
import { ResponseTimeSection } from "@/app/(sales)/_components/ResponseTimeSection";
import { ResponseWeek } from "@/app/(sales)/_components/ResponseWeek";
import { bySlaUrgency } from "@/app/(sales)/_lib/queue";
import { fmtWorkLeft, validateResponseTime } from "@/app/(sales)/_lib/responseTime";
import { UI } from "@/app/(sales)/_lib/labels";
import type { ResponseTime, ResponseWeekRow, TodayRow } from "@/app/(sales)/_lib/types";

vi.mock("next/navigation", () => ({ usePathname: () => "/sales/today" }));
afterEach(cleanup);

const SEED: ResponseTime = { days: [0, 1, 2, 3, 4], start: "09:00", end: "17:00", hot_hours: 2, normal_hours: 8 };

// ── wording ────────────────────────────────────────────────────────────────────
describe("time left in working hours", () => {
  it("says minutes under an hour, hours in words to two and a half, numerals from three", () => {
    expect(fmtWorkLeft(40)).toBe("עוד 40 דקות עבודה");
    expect(fmtWorkLeft(1)).toBe("עוד דקת עבודה");
    expect(fmtWorkLeft(60)).toBe("עוד שעה עבודה");
    expect(fmtWorkLeft(89)).toBe("עוד שעה עבודה");
    expect(fmtWorkLeft(90)).toBe("עוד שעה וחצי עבודה");
    expect(fmtWorkLeft(120)).toBe("עוד שעתיים עבודה");
    expect(fmtWorkLeft(150)).toBe("עוד שעתיים וחצי עבודה");
    expect(fmtWorkLeft(180)).toBe("עוד 3 שעות עבודה");
    // tranche 205: from three hours up, whole hours, rounded down — never "7.5 שעות"
    expect(fmtWorkLeft(7 * 60 + 59)).toBe("עוד 7 שעות עבודה");
  });
});

// ── validation: the server's rules ─────────────────────────────────────────────
describe("response time validation", () => {
  it("accepts the seed", () => {
    expect(validateResponseTime(SEED)).toEqual({});
  });
  it("names only the field that is wrong", () => {
    expect(validateResponseTime({ ...SEED, days: [] })).toEqual({ days: UI.rtDaysEmpty });
    expect(validateResponseTime({ ...SEED, start: "17:00", end: "09:00" })).toEqual({ end: UI.rtEndBeforeStart });
    expect(validateResponseTime({ ...SEED, start: "09:00", end: "09:00" })).toEqual({ end: UI.rtEndBeforeStart });
    expect(validateResponseTime({ ...SEED, start: "9:00" })).toEqual({ start: UI.rtTimeFormat });
    expect(validateResponseTime({ ...SEED, end: "" })).toEqual({ end: UI.rtTimeFormat });
    expect(validateResponseTime({ ...SEED, hot_hours: 0 }).hot).toBe(UI.rtHoursRange);
    expect(validateResponseTime({ ...SEED, hot_hours: 1.25 }).hot).toBe(UI.rtHoursRange);
    expect(validateResponseTime({ ...SEED, normal_hours: 41 }).normal).toBe(UI.rtHoursRange);
    expect(validateResponseTime({ ...SEED, normal_hours: Number.NaN }).normal).toBe(UI.rtHoursRange);
    expect(validateResponseTime({ ...SEED, hot_hours: 9 })).toEqual({ hot: UI.rtHotSlower });
    expect(validateResponseTime({ ...SEED, hot_hours: 0.5, normal_hours: 0.5 })).toEqual({});
  });
});

// ── the badge and the time left ───────────────────────────────────────────────
describe("the response-time badge", () => {
  it("is a pill only when it asks for action: about to pass, or past it", () => {
    render(<SlaBadge state="due_soon" minutesLeft={25} />);
    expect(screen.getByTestId("sla-badge").textContent).toBe("עומד לעבור");
    expect(screen.getByTestId("sla-badge").className).toContain("s-badge-sla-soon");
    cleanup();
    render(<SlaBadge state="overdue" minutesLeft={-90} />);
    expect(screen.getByTestId("sla-badge").textContent).toBe("עבר הזמן");
  });
  it("gives on time no pill", () => {
    const { container } = render(<SlaBadge state="on_time" minutesLeft={300} />);
    expect(container.textContent).toBe("");
  });
  it("shows nothing once the lead is touched, or for an older server's 'within'", () => {
    const { container } = render(<><SlaBadge state={null} /><SlaBadge state="within" /><SlaTimeLeft state={null} minutesLeft={9} /><SlaTimeLeft state="within" minutesLeft={9} /></>);
    expect(container.textContent).toBe("");
  });
  it("puts the working time left in quiet text, for on time and about to pass only", () => {
    render(<><SlaTimeLeft state="on_time" minutesLeft={300} /><SlaTimeLeft state="due_soon" minutesLeft={25} separator /></>);
    const [onTime, soon] = screen.getAllByTestId("sla-left");
    expect(onTime.textContent).toBe("עוד 5 שעות עבודה");
    expect(onTime.className).toBe("s-sla-left");
    expect(soon.textContent).toBe(" · עוד 25 דקות עבודה");
    cleanup();
    const { container } = render(<><SlaTimeLeft state="overdue" minutesLeft={-5} /><SlaTimeLeft state="on_time" /></>);
    expect(container.textContent).toBe("");
  });
});

// ── the queue order ─────────────────────────────────────────────────────────────
const base: TodayRow = {
  lead_id: "L1", item_type: "new_lead", org_id: "O1", org_name: "קפה בדיקה", contact_name: "דנה",
  phone_e164: "+972521234567", email: null, campaign_name: null, platform: null, status: "new",
  assignee: null, next_touch_at: null, first_touch_at: null, created_at: new Date().toISOString(),
  is_existing_customer: false, shopify_snapshot: null, shopify_snapshot_at: null, converted_order_ref: null,
  converted_amount: null, converted_at: null, sla_deadline_at: new Date().toISOString(), sla_state: "on_time",
  age_days: 0, uncontactable: false, sla_class: "normal", sla_minutes_left: 300,
};
const row = (over: Partial<TodayRow>): TodayRow => ({ ...base, ...over });
const at = (min: number) => new Date(Date.now() + min * 60e3).toISOString();

describe("the Today order inside a section (P0-1)", () => {
  it("lifts only the leads about to pass, soonest first; everyone else keeps the order they came in", () => {
    const rows = [
      row({ lead_id: "A", sla_state: "on_time" }),
      row({ lead_id: "B", sla_state: "overdue" }),
      row({ lead_id: "C", sla_state: "due_soon", sla_deadline_at: at(40) }),
      row({ lead_id: "D", sla_state: null }),
      row({ lead_id: "E", sla_state: "due_soon", sla_deadline_at: at(10) }),
      row({ lead_id: "F", sla_state: "overdue" }),
    ];
    expect(bySlaUrgency(rows).map((r) => r.lead_id)).toEqual(["E", "C", "A", "B", "D", "F"]);
  });

  it("with 145 overdue leads and a cap of 15, the hot lead about to pass and the fresh one are in view", () => {
    // newest first, as the server sends it: the fresh lead, then the backlog, with the hot one
    // created 100 minutes ago sitting behind 40 overdue leads that came in later
    const backlog = Array.from({ length: 145 }, (_, i) =>
      row({ lead_id: `O${i}`, org_name: `עסק ${i}`, sla_state: "overdue", sla_minutes_left: -60 * (i + 1),
        created_at: new Date(Date.now() - (i + 2) * 3600e3).toISOString() }));
    const fresh = row({ lead_id: "FRESH", sla_state: "on_time", created_at: new Date().toISOString() });
    const hot = row({ lead_id: "HOT", sla_state: "due_soon", sla_class: "hot", sla_minutes_left: 20, sla_deadline_at: at(20) });
    render(
      <TodayQueue rows={[fresh, ...backlog.slice(0, 40), hot, ...backlog.slice(40)]}
        dailyCap={15} slaHours={24} templates={null} onArm={() => {}} onPostpone={() => {}} onLost={() => {}} />,
    );
    const ids = screen.getAllByTestId(/^today-card-/).map((el) => el.getAttribute("data-testid")!.replace("today-card-", ""));
    expect(ids).toHaveLength(12); // the first render batch of the 15
    expect(ids.slice(0, 3)).toEqual(["HOT", "FRESH", "O0"]);
    expect(ids.slice(2)).toEqual(backlog.slice(0, 10).map((r) => r.lead_id)); // the rest, newest first
    expect(within(screen.getByTestId("today-card-HOT")).getByTestId("sla-badge").textContent).toBe("עומד לעבור");
    expect(within(screen.getByTestId("today-card-HOT")).getByTestId("sla-left").textContent).toContain("עוד 20 דקות עבודה");
    expect(within(screen.getByTestId("today-card-FRESH")).queryByTestId("sla-badge")).toBeNull();
    expect(within(screen.getByTestId("today-card-FRESH")).getByTestId("sla-left").textContent).toContain("עוד 5 שעות עבודה");
    expect(within(screen.getByTestId("today-card-O0")).getByTestId("sla-badge").textContent).toBe("עבר הזמן");
  });
});

// ── settings: זמני תגובה ─────────────────────────────────────────────────────────
function renderSection(over: Partial<React.ComponentProps<typeof ResponseTimeSection>> = {}) {
  const onSave = vi.fn();
  render(<ResponseTimeSection value={SEED} change={null} saving={false} saved={false} error={null} onSave={onSave} {...over} />);
  return onSave;
}

describe("the response-time settings section", () => {
  it("shows the days, the hours and both targets from the server", () => {
    renderSection();
    for (const d of [0, 1, 2, 3, 4]) expect(screen.getByTestId(`rt-day-${d}`).getAttribute("aria-pressed")).toBe("true");
    for (const d of [5, 6]) expect(screen.getByTestId(`rt-day-${d}`).getAttribute("aria-pressed")).toBe("false");
    expect((screen.getByTestId("rt-start") as HTMLInputElement).value).toBe("09:00");
    expect((screen.getByTestId("rt-end") as HTMLInputElement).value).toBe("17:00");
    expect((screen.getByTestId("rt-hot") as HTMLInputElement).value).toBe("2");
    expect((screen.getByTestId("rt-normal") as HTMLInputElement).value).toBe("8");
  });

  it("names each day by its letter and then its full name (the name holds the visible label)", () => {
    renderSection();
    expect(screen.getByRole("button", { name: "א׳ ראשון" })).toBe(screen.getByTestId("rt-day-0"));
    expect(screen.getByRole("button", { name: "ו׳ שישי" })).toBe(screen.getByTestId("rt-day-5"));
  });

  it("quotes the exact button titles in the hot-lead hint", () => {
    renderSection();
    expect(screen.getByTestId("settings-response-time").textContent).toContain("«אני רוצה להזמין» או «רוצה לשמוע עוד»");
  });

  it("saves its own value, and only once something changed", () => {
    const onSave = renderSection();
    const save = screen.getByTestId("rt-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("rt-day-5"));
    fireEvent.change(screen.getByTestId("rt-hot"), { target: { value: "1.5" } });
    expect(screen.getByTestId("rt-dirty")).toBeTruthy();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ days: [0, 1, 2, 3, 4, 5], start: "09:00", end: "17:00", hot_hours: 1.5, normal_hours: 8 });
  });

  it("checks a field when it is left, not while it is typed, and marks only that field", () => {
    renderSection();
    const end = screen.getByTestId("rt-end");
    fireEvent.change(end, { target: { value: "1" } });
    expect(screen.getByTestId("rt-end-error").textContent).toBe("");
    expect(end.getAttribute("aria-invalid")).toBeNull();
    fireEvent.blur(end);
    expect(screen.getByTestId("rt-end-error").textContent).toBe(UI.rtTimeFormat);
    expect(screen.getByTestId("rt-end-error").getAttribute("aria-live")).toBe("polite");
    expect(end.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("rt-start").getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(end, { target: { value: "08:00" } });
    expect(screen.getByTestId("rt-end-error").textContent).toBe(UI.rtEndBeforeStart);
  });

  it("on save, shows every problem and does not save", () => {
    const onSave = renderSection();
    fireEvent.change(screen.getByTestId("rt-hot"), { target: { value: "9" } });
    expect(screen.getByTestId("rt-hot-error").textContent).toBe("");
    fireEvent.click(screen.getByTestId("rt-save"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("rt-hot-error").textContent).toBe(UI.rtHotSlower);
    expect(screen.getByTestId("rt-hot").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("rt-normal").getAttribute("aria-invalid")).toBeNull();
  });

  it("will not switch off the last working day", () => {
    renderSection({ value: { ...SEED, days: [0] } });
    fireEvent.click(screen.getByTestId("rt-day-0"));
    expect(screen.getByTestId("rt-days-error").textContent).toBe(UI.rtDaysEmpty);
  });

  it("says who changed it and when, and that it saved", () => {
    renderSection({ change: { actor: "Avi", at: new Date(Date.now() - 2 * 3600e3).toISOString() }, saved: true });
    expect(screen.getByTestId("settings-response-time").textContent).toContain("שונה ע״י Avi לפני שעתיים");
    expect(screen.getByTestId("rt-saved").textContent).toBe(UI.rtSaved);
  });
});

// ── attention: the week per rep ─────────────────────────────────────────────────
const week: ResponseWeekRow[] = [
  { assignee: "dana@synthetic.invalid", total: 6, answered_on_time: 3, answered_late: 1, not_answered: 2,
    not_answered_due_soon: 1, not_answered_overdue: 1, met_pct: 60 },
  { assignee: null, total: 2, answered_on_time: 0, answered_late: 0, not_answered: 2,
    not_answered_due_soon: 0, not_answered_overdue: 0, met_pct: null },
];

describe("the weekly response metric on the attention screen", () => {
  it("shows each rep: answered on time, answered late, not answered yet, and the share that met the target", () => {
    render(<ResponseWeek rows={week} roster={[{ email: "dana@synthetic.invalid", name: "דנה", active: true }]} />);
    const dana = screen.getByTestId("rt-week-dana@synthetic.invalid");
    expect(dana.textContent).toContain("דנה");
    expect(within(dana).getByTestId("rt-week-on_time").textContent).toBe("ענו בזמן3");
    expect(within(dana).getByTestId("rt-week-late").textContent).toBe("ענו באיחור1");
    expect(within(dana).getByTestId("rt-week-open").textContent).toBe("עוד לא ענו2");
    expect(within(dana).getByTestId("rt-week-soon").textContent).toBe("מתוכם אחד עומד לעבור");
    expect(within(dana).getByTestId("rt-week-met").textContent).toBe(UI.weekMet(60, 3, 5));
    const unowned = screen.getByTestId("rt-week-unowned");
    expect(unowned.textContent).toContain(UI.weekUnowned);
    expect(within(unowned).getByTestId("rt-week-met").textContent).toBe(UI.weekNoDecided);
    expect(within(unowned).queryByTestId("rt-week-soon")).toBeNull();
  });

  it("says so when no lead came in this week", () => {
    render(<ResponseWeek rows={[]} roster={[]} />);
    expect(screen.getByTestId("rt-week-empty").textContent).toBe(UI.weekEmpty);
  });
});
