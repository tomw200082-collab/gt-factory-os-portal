import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { BulkBar } from "@/app/(sales)/_components/BulkBar";
import { SettingsForm } from "@/app/(sales)/_components/SettingsForm";
import { AttentionList } from "@/app/(sales)/_components/AttentionList";
import { LeadsTable } from "@/app/(sales)/_components/LeadsTable";
import { UI } from "@/app/(sales)/_lib/labels";
import { budgetSpent, capRows } from "@/app/(sales)/_lib/queue";
import type {
  AttentionRow,
  SalesLeadRow,
  SalesSettings,
  TodayRow,
} from "@/app/(sales)/_lib/types";

afterEach(cleanup);

const noop = () => {};

// ---------------------------------------------------------------------------
// P0 — INTER-002: a failed batch has to say so
// ---------------------------------------------------------------------------

describe("bulk bar", () => {
  it("states a failed batch instead of returning quietly to idle", () => {
    // Spinner → idle with nothing changed reads as "nothing happened", and the
    // natural response is to press the same button again.
    render(
      <BulkBar
        count={3}
        roster={[]}
        error={UI.bulkAssignFailed}
        onAssign={noop}
        onClear={noop}
      />,
    );
    const alert = screen.getByTestId("bulk-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toBe(UI.bulkAssignFailed);
  });

  it("renders no error region when there is no error", () => {
    render(<BulkBar count={3} roster={[]} onAssign={noop} onClear={noop} />);
    expect(screen.queryByTestId("bulk-error")).toBeNull();
  });

  it("names the date field as a field, not as an action", () => {
    // An <input> whose accessible name is an imperative announces as a button.
    render(<BulkBar count={1} roster={[]} onAssign={noop} onClear={noop} />);
    expect(screen.getByLabelText(UI.bulkDateLabel).tagName).toBe("INPUT");
  });

  it("agrees the count with the verb in Hebrew", () => {
    expect(UI.bulkSelected(1)).toBe("נבחר 1");
    expect(UI.bulkSelected(3)).toBe("3 נבחרו");
    expect(UI.bulkAssigned(1, "דנה")).toContain("ליד אחד");
    expect(UI.bulkAssigned(4, "דנה")).toContain("4 לידים");
  });
});

// ---------------------------------------------------------------------------
// P1 — the settings screen's two logic bugs
// ---------------------------------------------------------------------------

const settings: SalesSettings = {
  sla_hours: 24,
  whatsapp_templates: { new_lead: "א", reminder: "ב", returning_customer: "ג" },
  assignees: [{ name: "דנה", email: "dana@gt.co.il", active: true }],
  lost_reasons: ["אין תקציב", "אחר"],
  queue: { daily_cap: 15, order: "newest_first" },
  last_changes: [],
};

describe("settings form", () => {
  it("will not offer to save an invalid daily cap", () => {
    // The submit handler already refused it; the button did not, so the only
    // feedback for a bad value was a press that did nothing.
    render(<SettingsForm settings={settings} onSave={noop} />);
    const save = screen.getByTestId("settings-save") as HTMLButtonElement;
    expect(save.disabled).toBe(false);

    fireEvent.change(screen.getByTestId("queue-cap"), { target: { value: "0" } });
    expect(save.disabled).toBe(true);
    expect(screen.getByTestId("queue-cap-error").textContent).toBe(UI.queueCapRange);
  });

  it("points the cap field at its own error message", () => {
    render(<SettingsForm settings={settings} onSave={noop} />);
    fireEvent.change(screen.getByTestId("queue-cap"), { target: { value: "999" } });
    expect(screen.getByTestId("queue-cap").getAttribute("aria-describedby")).toBe(
      "queue-cap-error",
    );
  });

  it("keeps the deactivation warning visible while the box is unchecked", () => {
    // The warning was gated on person.active, so it vanished at the moment it
    // became relevant — unchecking removed the sentence explaining the cost.
    render(
      <SettingsForm
        settings={settings}
        openLeadsByAssignee={{ "dana@gt.co.il": 4 }}
        onSave={noop}
      />,
    );
    expect(screen.getByTestId("person-open-dana@gt.co.il").textContent).toBe(
      UI.deactivateWarning(4),
    );
    fireEvent.click(screen.getByTestId("person-active-dana@gt.co.il"));
    expect(screen.getByTestId("person-open-dana@gt.co.il").textContent).toBe(
      UI.deactivateWarning(4),
    );
  });

  it("names every repeated control by what it acts on", () => {
    // Four buttons announcing "הסר" and a toggle announcing "פעיל" name nothing.
    render(<SettingsForm settings={settings} onSave={noop} />);
    expect(screen.getByLabelText(UI.removeItemNamed("אין תקציב"))).toBeTruthy();
    expect(screen.getByLabelText(UI.personActiveNamed("דנה"))).toBeTruthy();
  });

  it("separates a section heading from the field labels inside it", () => {
    const { container } = render(<SettingsForm settings={settings} onSave={noop} />);
    const heading = container.querySelector("#settings-queue-title");
    expect(heading?.className).toContain("s-section-heading");
    expect(heading?.className).not.toContain("s-eyebrow");
    // and the section is programmatically named by it
    expect(
      screen.getByTestId("settings-queue").getAttribute("aria-labelledby"),
    ).toBe("settings-queue-title");
  });

  it("agrees the open-lead warning with its count", () => {
    expect(UI.deactivateWarning(1)).toContain("ליד פתוח אחד");
    expect(UI.deactivateWarning(1)).toContain("אותו");
    expect(UI.deactivateWarning(3)).toContain("3 לידים פתוחים");
  });
});

// ---------------------------------------------------------------------------
// P1 — a call from /attention owes an outcome
// ---------------------------------------------------------------------------

const attentionRow = (over: Partial<AttentionRow> = {}): AttentionRow => ({
  lead_id: "L1",
  org_id: "O1",
  org_name: "קפה בדיקה",
  contact_name: "דנה",
  phone_e164: "+972521234567",
  status: "new",
  assignee: null,
  next_touch_at: null,
  days_stuck: 6,
  bucket: "overdue",
  ...over,
});

describe("attention list", () => {
  it("arms outcome capture when a call is placed", () => {
    // This screen dialled and asked nothing, so the one surface built for
    // "what is stuck" was itself a way to leave a lead stuck with no record.
    const armed: Array<[string, string]> = [];
    render(
      <AttentionList
        rows={[attentionRow()]}
        roster={[]}
        onOpen={noop}
        onArm={(id, ch) => armed.push([id, ch])}
      />,
    );
    fireEvent.click(screen.getByTestId("attention-call-L1-overdue"));
    expect(armed).toEqual([["L1", "call"]]);
  });

  it("names each call link by the business it calls", () => {
    render(
      <AttentionList rows={[attentionRow()]} roster={[]} onOpen={noop} onArm={noop} />,
    );
    expect(screen.getByLabelText(UI.callOrg("קפה בדיקה"))).toBeTruthy();
  });

  it("makes the business name look like the control it is", () => {
    // It was the only way into a lead from this screen and rendered as plain
    // bold text, so the card read as "tap the number".
    render(
      <AttentionList rows={[attentionRow()]} roster={[]} onOpen={noop} onArm={noop} />,
    );
    const open = screen.getByTestId("attention-open-L1-overdue");
    expect(open.tagName).toBe("BUTTON");
    // .s-link carries the accent colour and the underline; jsdom cannot read
    // hsl(var(--token)) from an inline style, and a class is the system rule.
    expect(open.className).toContain("s-link");
  });

  it("keeps the numeral on a one-day badge", () => {
    expect(UI.daysStuck(1)).toBe("יום א׳");
    expect(UI.daysStuck(6)).toBe("6 ימ׳");
  });
});

// ---------------------------------------------------------------------------
// P1 — selection state a screen reader can read
// ---------------------------------------------------------------------------

const leadRow = (over: Partial<SalesLeadRow> = {}): SalesLeadRow => ({
  id: "L1",
  org_id: "O1",
  org_name: "קפה בדיקה",
  contact_name: "דנה",
  phone_e164: "+972521234567",
  email: null,
  source: "manual",
  campaign_name: null,
  ad_name: null,
  platform: null,
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
  sla_deadline_at: null,
  sla_state: null,
  next_touch_overdue: false,
  ...over,
});

describe("leads table selection", () => {
  it("names each row's checkbox by its business", () => {
    // Twenty rows announcing "בחר ליד" identify nothing.
    render(
      <LeadsTable
        rows={[leadRow(), leadRow({ id: "L2", org_name: "מסעדת בדיקה" })]}
        selected={new Set()}
        onToggle={noop}
        onToggleAll={noop}
        onOpen={noop}
      />,
    );
    expect(screen.getByLabelText(UI.selectLeadNamed("קפה בדיקה"))).toBeTruthy();
    expect(screen.getByLabelText(UI.selectLeadNamed("מסעדת בדיקה"))).toBeTruthy();
  });

  it("reads a partial selection as mixed, not as none", () => {
    // "Some" only exists as a DOM property; without it a partial selection
    // rendered identically to an empty one.
    render(
      <LeadsTable
        rows={[leadRow(), leadRow({ id: "L2", org_name: "מסעדת בדיקה" })]}
        selected={new Set(["L1"])}
        onToggle={noop}
        onToggleAll={noop}
        onOpen={noop}
      />,
    );
    const all = screen.getByTestId("leads-select-all") as HTMLInputElement;
    expect(all.checked).toBe(false);
    expect(all.indeterminate).toBe(true);
  });

  it("is neither checked nor mixed when nothing is selected", () => {
    render(
      <LeadsTable
        rows={[leadRow()]}
        selected={new Set()}
        onToggle={noop}
        onToggleAll={noop}
        onOpen={noop}
      />,
    );
    const all = screen.getByTestId("leads-select-all") as HTMLInputElement;
    expect(all.checked).toBe(false);
    expect(all.indeterminate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P1 — one daily budget, not one per section
// ---------------------------------------------------------------------------

const todayRow = (over: Partial<TodayRow> = {}): TodayRow =>
  ({ lead_id: "T1", item_type: "new_lead", ...over }) as TodayRow;

describe("daily budget", () => {
  it("spends what a section takes and no more", () => {
    const news = Array.from({ length: 20 }, (_, i) => todayRow({ lead_id: `N${i}` }));
    expect(budgetSpent(news, 15)).toBe(15);
    expect(budgetSpent(news.slice(0, 4), 15)).toBe(4);
    expect(budgetSpent(news, 0)).toBe(0);
  });

  it("never spends budget on a section that is not capped", () => {
    // A conversion and a returning customer are not deferrable work.
    const uncapped = [
      todayRow({ lead_id: "C1", item_type: "conversion" }),
      todayRow({ lead_id: "R1", item_type: "returning_customer" }),
    ];
    expect(budgetSpent(uncapped, 15)).toBe(0);
    const { visible, remaining } = capRows(uncapped, 0);
    expect(visible).toHaveLength(2);
    expect(remaining).toBe(0);
  });
});
