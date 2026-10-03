import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QuickMessagesSection } from "@/app/(sales)/_components/QuickMessagesSection";
import { JourneySection } from "@/app/(sales)/_components/JourneySection";
import { QUICK_SITUATION_LABELS, UI } from "@/app/(sales)/_lib/labels";
import type { Journey, QuickSituation } from "@/app/(sales)/_lib/types";

afterEach(cleanup);

const MESSAGES: Record<QuickSituation, string> = {
  returning_customer: "חוזר {{name}}\n{{rep}}",
  tapped_order_no_order: "הזמנה {{name}}\n{{rep}}",
  asked_more: "עוד {{name}}\n{{rep}}",
  no_answer: "היי , ניסיתי\n{{rep}}",
  menu_no_reply: "תפריט {{menu}} ל־{{business}}\n{{rep}}",
  no_auto: "שלום {{name}}\n{{rep}}",
};

function renderQuick(onSave = vi.fn(), over: Partial<React.ComponentProps<typeof QuickMessagesSection>> = {}) {
  render(<QuickMessagesSection messages={MESSAGES} changes={{ no_answer: { actor: "Avi", at: new Date(Date.now() - 2 * 3600e3).toISOString() } }}
    signer="אבי" onSave={onSave} savingSituation={null} savedSituation={null} error={null} {...over} />);
  return onSave;
}

describe("quick messages in settings", () => {
  it("lists the six situations, each with its textarea and its own save", () => {
    renderQuick();
    for (const s of Object.keys(MESSAGES) as QuickSituation[]) {
      const row = screen.getByTestId(`quick-${s}`);
      expect(within(row).getByText(QUICK_SITUATION_LABELS[s])).toBeTruthy();
      expect((within(row).getByTestId(`quick-text-${s}`) as HTMLTextAreaElement).value).toBe(MESSAGES[s]);
      expect(within(row).getByTestId(`quick-save-${s}`)).toBeTruthy();
    }
  });

  it("says who changed a situation and when", () => {
    renderQuick();
    expect(screen.getByTestId("quick-no_answer").textContent).toContain("שונה ע״י Avi לפני שעתיים");
    expect(screen.getByTestId("quick-asked_more").textContent).not.toContain("שונה ע״י");
  });

  it("inserts a variable chip at the cursor", () => {
    renderQuick();
    const ta = screen.getByTestId("quick-text-no_answer") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(4, 4);
    fireEvent.select(ta);
    fireEvent.click(within(screen.getByTestId("quick-no_answer")).getByTestId("quick-chip-name"));
    expect(ta.value).toBe("היי {{name}}, ניסיתי\n{{rep}}");
  });

  it("previews the message on a synthetic lead, with the sender as signer", () => {
    renderQuick();
    const preview = screen.getByTestId("quick-preview-menu_no_reply");
    expect(preview.textContent).toContain("תפריט המאצ׳ה");
    expect(preview.textContent).toContain("אבי");
    expect(preview.textContent).not.toContain("{{");
  });

  it("saves only its own situation, trimmed", () => {
    const onSave = renderQuick();
    const ta = screen.getByTestId("quick-text-asked_more");
    fireEvent.change(ta, { target: { value: "  חדש {{name}}  " } });
    fireEvent.click(screen.getByTestId("quick-save-asked_more"));
    expect(onSave).toHaveBeenCalledWith("asked_more", "חדש {{name}}");
  });

  it("refuses an empty message and one over 1000 characters", () => {
    const onSave = renderQuick();
    const ta = screen.getByTestId("quick-text-no_auto");
    fireEvent.change(ta, { target: { value: "   " } });
    expect(screen.getByTestId("quick-save-no_auto")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("quick-error-no_auto").textContent).toBe(UI.quickEmpty);
    fireEvent.change(ta, { target: { value: "x".repeat(1001) } });
    expect(screen.getByTestId("quick-save-no_auto")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("quick-error-no_auto").textContent).toBe(UI.quickTooLong);
    fireEvent.click(screen.getByTestId("quick-save-no_auto"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("an unchanged message has nothing to save", () => {
    renderQuick();
    expect(screen.getByTestId("quick-save-no_auto")).toHaveProperty("disabled", true);
  });
});

const JOURNEY: Journey = {
  mode: { state: "test", outreach_gate_open: false, test_phone_count: 1, phone_number_id_set: true, send_token_set: true },
  steps: [
    { id: "first_menu", trigger: { kind: "first_message", when: "menu" }, text: "היי, כיף שפניתם!\nהנה {{menu}} שלנו", footer: "לא מתאים? כתבו \"הסר\"",
      buttons: [{ kind: "reply", id: "lj.order", title: "אני רוצה להזמין" }, { kind: "reply", id: "lj.more", title: "רוצה לשמוע עוד" }], effects: [] },
    { id: "more_info", trigger: { kind: "button", button_id: "lj.more" }, text: "בשמחה! נתקשר אליכם בהקדם", footer: null,
      buttons: [{ kind: "link", title: "שאלות ותשובות" }], effects: ["owner_alerted"] },
    { id: "wake_2", trigger: { kind: "wake", step: 2, slots: "morning", on: "follow_up_date", template: "gt_lead_wake_2" }, text: "בוקר טוב {{name}}!", footer: "להסרה", buttons: [], effects: [] },
  ],
  wake_rules: {
    timezone: "Asia/Jerusalem", days: "sun_thu",
    slots: { morning: { from: "10:00", to: "11:30" }, afternoon: { from: "15:00", to: "17:00" } },
    first_after_hours: 2, min_hours_between: 48, quiet_after_staff_hours: 24, retry_after_hours: 24, max_messages: 4,
  },
};

describe("the journey in settings (read-only)", () => {
  it("shows every step's exact text, footer and buttons, with no control to edit them", () => {
    render(<JourneySection journey={JOURNEY} />);
    const section = screen.getByTestId("settings-journey");
    expect(screen.getByTestId("journey-step-first_menu").textContent).toContain("הנה {{menu}} שלנו");
    expect(screen.getByTestId("journey-step-first_menu").textContent).toContain("אני רוצה להזמין");
    expect(screen.getByTestId("journey-step-more_info").textContent).toContain("שאלות ותשובות");
    expect(section.querySelectorAll("textarea, input").length).toBe(0);
    expect(section.textContent).toContain(UI.journeyChangeVia);
  });

  it("says when each one goes out, with the wake slots from the server", () => {
    render(<JourneySection journey={JOURNEY} />);
    expect(screen.getByTestId("journey-when-first_menu").textContent).toBe(UI.journeyWhenFirst("menu"));
    expect(screen.getByTestId("journey-when-more_info").textContent).toContain("רוצה לשמוע עוד");
    expect(screen.getByTestId("journey-when-wake_2").textContent).toContain("10:00–11:30");
  });

  it("states test mode truthfully", () => {
    render(<JourneySection journey={JOURNEY} />);
    expect(screen.getByTestId("journey-mode").textContent).toBe(UI.journeyModeTest(1));
    cleanup();
    render(<JourneySection journey={{ ...JOURNEY, mode: { ...JOURNEY.mode, state: "live", outreach_gate_open: true } }} />);
    expect(screen.getByTestId("journey-mode").textContent).toBe(UI.journeyModeLive);
  });
});
