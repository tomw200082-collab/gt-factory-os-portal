import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SlaBadge } from "@/app/(sales)/_components/SlaBadge";
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
  it("says minutes under an hour, and hours in half hours above it", () => {
    expect(fmtWorkLeft(40)).toBe("עוד 40 דקות עבודה");
    expect(fmtWorkLeft(1)).toBe("עוד דקת עבודה");
    expect(fmtWorkLeft(60)).toBe("עוד שעת עבודה");
    expect(fmtWorkLeft(89)).toBe("עוד שעת עבודה");
    expect(fmtWorkLeft(90)).toBe("עוד 1.5 שעות עבודה");
    expect(fmtWorkLeft(7 * 60 + 59)).toBe("עוד 7.5 שעות עבודה");
    expect(fmtWorkLeft(480)).toBe("עוד 8 שעות עבודה");
  });
});

// ── validation: the server's rules ─────────────────────────────────────────────
describe("response time validation", () => {
  it("accepts the seed", () => {
    expect(validateResponseTime(SEED)).toEqual({});
  });
  it("needs a day, an end after the start, and targets in half hours, hot never slower", () => {
    expect(validateResponseTime({ ...SEED, days: [] }).days).toBe(UI.rtDaysEmpty);
    expect(validateResponseTime({ ...SEED, start: "17:00", end: "09:00" }).hours).toBe(UI.rtEndBeforeStart);
    expect(validateResponseTime({ ...SEED, start: "09:00", end: "09:00" }).hours).toBe(UI.rtEndBeforeStart);
    expect(validateResponseTime({ ...SEED, start: "" }).hours).toBe(UI.rtTimeMissing);
    expect(validateResponseTime({ ...SEED, hot_hours: 0 }).hot).toBe(UI.rtHoursRange);
    expect(validateResponseTime({ ...SEED, hot_hours: 1.25 }).hot).toBe(UI.rtHoursRange);
    expect(validateResponseTime({ ...SEED, normal_hours: 41 }).normal).toBe(UI.rtHoursRange);
    expect(validateResponseTime({ ...SEED, normal_hours: Number.NaN }).normal).toBe(UI.rtHoursRange);
    expect(validateResponseTime({ ...SEED, hot_hours: 9 }).hot).toBe(UI.rtHotSlower);
    expect(validateResponseTime({ ...SEED, hot_hours: 0.5, normal_hours: 0.5 })).toEqual({});
  });
});

// ── the badge ─────────────────────────────────────────────────────────────────
describe("the response-time badge", () => {
  it("shows three states, with the working time left while there is some", () => {
    render(<SlaBadge state="on_time" minutesLeft={300} />);
    expect(screen.getByTestId("sla-badge").textContent).toBe(`${UI.slaOnTime} · עוד 5 שעות עבודה`);
    expect(screen.getByTestId("sla-badge").getAttribute("data-state")).toBe("on_time");
    cleanup();
    render(<SlaBadge state="due_soon" minutesLeft={25} />);
    expect(screen.getByTestId("sla-badge").textContent).toBe(`${UI.slaDueSoon} · עוד 25 דקות עבודה`);
    cleanup();
    render(<SlaBadge state="overdue" minutesLeft={-90} />);
    expect(screen.getByTestId("sla-badge").textContent).toBe(UI.slaOverdue);
  });
  it("uses the words D-043 names", () => {
    expect([UI.slaOnTime, UI.slaDueSoon, UI.slaOverdue]).toEqual(["בזמן", "עומד לעבור", "עבר"]);
  });
  it("shows nothing once the lead is touched, or for an older server's 'within'", () => {
    const { container } = render(<><SlaBadge state={null} /><SlaBadge state="within" /></>);
    expect(container.textContent).toBe("");
  });
  it("shows the state without minutes when the server sends none", () => {
    render(<SlaBadge state="on_time" />);
    expect(screen.getByTestId("sla-badge").textContent).toBe(UI.slaOnTime);
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

describe("the Today order inside a section", () => {
  it("puts overdue first, then due soon, then the rest, keeping each group's order", () => {
    const rows = [
      row({ lead_id: "A", sla_state: "on_time" }),
      row({ lead_id: "B", sla_state: "overdue" }),
      row({ lead_id: "C", sla_state: "due_soon" }),
      row({ lead_id: "D", sla_state: null }),
      row({ lead_id: "E", sla_state: "overdue" }),
    ];
    expect(bySlaUrgency(rows).map((r) => r.lead_id)).toEqual(["B", "E", "C", "A", "D"]);
  });

  it("renders the urgent cards first and keeps them inside the daily cap", () => {
    render(
      <TodayQueue
        rows={[row({ lead_id: "FRESH", sla_state: "on_time" }), row({ lead_id: "SOON", sla_state: "due_soon", sla_minutes_left: 20 }), row({ lead_id: "LATE", sla_state: "overdue" })]}
        dailyCap={2} slaHours={24} templates={null} onArm={() => {}} onPostpone={() => {}} onLost={() => {}}
      />,
    );
    const ids = screen.getAllByTestId(/^today-card-/).map((el) => el.getAttribute("data-testid"));
    expect(ids).toEqual(["today-card-LATE", "today-card-SOON"]);
    expect(within(screen.getByTestId("today-card-SOON")).getByTestId("sla-badge").textContent).toContain(UI.slaDueSoon);
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

  it("refuses an invalid value with a message, and does not save it", () => {
    const onSave = renderSection();
    fireEvent.change(screen.getByTestId("rt-end"), { target: { value: "08:00" } });
    expect(screen.getByTestId("rt-hours-error").textContent).toBe(UI.rtEndBeforeStart);
    fireEvent.change(screen.getByTestId("rt-end"), { target: { value: "17:00" } });
    fireEvent.change(screen.getByTestId("rt-hot"), { target: { value: "9" } });
    expect(screen.getByTestId("rt-hot-error").textContent).toBe(UI.rtHotSlower);
    expect((screen.getByTestId("rt-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("rt-save"));
    expect(onSave).not.toHaveBeenCalled();
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
  { assignee: "dana@synthetic.invalid", total: 6, on_time: 3, due_soon: 1, overdue: 2, met: 3, decided: 5, met_pct: 60 },
  { assignee: null, total: 2, on_time: 1, due_soon: 1, overdue: 0, met: 0, decided: 0, met_pct: null },
];

describe("the weekly response metric on the attention screen", () => {
  it("shows each rep by name with on time, due soon, overdue and the share that met the target", () => {
    render(<ResponseWeek rows={week} roster={[{ email: "dana@synthetic.invalid", name: "דנה", active: true }]} />);
    const dana = screen.getByTestId("rt-week-dana@synthetic.invalid");
    expect(dana.textContent).toContain("דנה");
    expect(within(dana).getByTestId("rt-week-on_time").textContent).toContain("3");
    expect(within(dana).getByTestId("rt-week-due_soon").textContent).toContain("1");
    expect(within(dana).getByTestId("rt-week-overdue").textContent).toContain("2");
    expect(within(dana).getByTestId("rt-week-met").textContent).toBe(UI.weekMet(60, 3, 5));
    const unowned = screen.getByTestId("rt-week-unowned");
    expect(unowned.textContent).toContain(UI.weekUnowned);
    expect(within(unowned).getByTestId("rt-week-met").textContent).toBe(UI.weekNoDecided);
  });

  it("says so when no lead came in this week", () => {
    render(<ResponseWeek rows={[]} roster={[]} />);
    expect(screen.getByTestId("rt-week-empty").textContent).toBe(UI.weekEmpty);
  });
});
