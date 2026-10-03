import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { WhatsAppQuick } from "@/app/(sales)/_components/WhatsAppQuick";
import { AutoSentLine } from "@/app/(sales)/_components/AutoSentLine";
import { TodayCard } from "@/app/(sales)/_components/TodayCard";
import { QUICK_SITUATION_LABELS, UI } from "@/app/(sales)/_lib/labels";
import type { LeadConversation, SalesSettings, TodayRow } from "@/app/(sales)/_lib/types";

afterEach(cleanup);

const SETTINGS: SalesSettings = {
  sla_hours: 24,
  whatsapp_templates: { new_lead: "x", reminder: "y", returning_customer: "z" },
  lost_reasons: ["אחר"],
  queue: { daily_cap: 15, order: "newest_first" },
  assignees: [],
  last_changes: [],
  whatsapp_quick_messages: {
    returning_customer: "חוזר {{name}} {{rep}}",
    tapped_order_no_order: "הזמנה {{name}} {{rep}}",
    asked_more: "עוד {{name}} {{rep}}",
    no_answer: "לא ענית {{name}} {{rep}}",
    menu_no_reply: "תפריט {{menu}} {{name}} {{rep}}",
    no_auto: "שלום {{name}} {{rep}}",
  },
  quick_message_changes: {},
  quick_message_signer: "אבי",
};

const conv = (over: Partial<LeadConversation> = {}): LeadConversation => ({
  suggested_situation: "asked_more", opted_out: false, menu_key: "ube", menu_label: "תפריט האובה",
  auto: [], taps: [], ...over,
});
const lead = { contact_name: "דנה כהן", org_name: "קפה נחת", is_existing_customer: false, conversation: conv() };
const textOf = (href: string | null) => decodeURIComponent(new URL(href!).searchParams.get("text") ?? "");

describe("the WhatsApp quick button", () => {
  it("opens wa.me with the suggested situation's message, signed by the sender, and arms the outreach", () => {
    const onArm = vi.fn();
    render(<WhatsAppQuick leadId="L1" phone="+972521234567" lead={lead} settings={SETTINGS} onArm={onArm} testId="wa" />);
    const a = screen.getByTestId("wa");
    expect(a.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/972521234567\?text=/);
    expect(textOf(a.getAttribute("href"))).toBe("עוד דנה אבי");
    fireEvent.click(a);
    expect(onArm).toHaveBeenCalledWith("L1", "whatsapp");
  });

  it("lets the rep pick another situation", () => {
    render(<WhatsAppQuick leadId="L1" phone="+972521234567" lead={lead} settings={SETTINGS} onArm={() => {}} testId="wa" />);
    fireEvent.click(screen.getByTestId("wa-other"));
    const list = screen.getByTestId("wa-situations");
    // the suggested one is marked
    expect(within(list).getByTestId("wa-situation-asked_more").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(list).getByText(QUICK_SITUATION_LABELS.menu_no_reply));
    expect(textOf(screen.getByTestId("wa").getAttribute("href"))).toBe("תפריט תפריט האובה דנה אבי");
    expect(screen.queryByTestId("wa-situations")).toBeNull();
  });

  it("is disabled, with the reason in words, for a lead who opted out; nothing is armed", () => {
    const onArm = vi.fn();
    render(<WhatsAppQuick leadId="L1" phone="+972521234567"
      lead={{ ...lead, conversation: conv({ opted_out: true, suggested_situation: "opted_out" }) }}
      settings={SETTINGS} onArm={onArm} testId="wa" />);
    const b = screen.getByTestId("wa");
    expect(b.tagName).toBe("BUTTON");
    expect(b).toHaveProperty("disabled", true);
    expect(b.textContent).toContain("הליד ביקש לא לקבל הודעות («הסר»)");
    expect(b.getAttribute("href")).toBeNull();
    fireEvent.click(b);
    expect(onArm).not.toHaveBeenCalled();
    expect(screen.queryByTestId("wa-other")).toBeNull();
  });

  it("renders nothing without a phone", () => {
    const { container } = render(<WhatsAppQuick leadId="L1" phone={null} lead={lead} settings={SETTINGS} onArm={() => {}} testId="wa" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("the Today card", () => {
  const row: TodayRow = {
    lead_id: "L1", item_type: "new_lead", org_id: "O1", org_name: "קפה נחת", contact_name: "דנה",
    phone_e164: "+972521234567", email: null, campaign_name: null, platform: null, status: "new",
    assignee: null, next_touch_at: null, first_touch_at: null, created_at: new Date().toISOString(),
    is_existing_customer: false, shopify_snapshot: null, shopify_snapshot_at: null,
    converted_order_ref: null, converted_amount: null, converted_at: null,
    sla_deadline_at: new Date(Date.now() + 3600e3).toISOString(), sla_state: "within", age_days: 0,
    uncontactable: false, conversation: conv({ opted_out: true, suggested_situation: "opted_out" }),
  };
  it("keeps the call for an opted-out lead and disables only WhatsApp", () => {
    render(<TodayCard row={row} slaHours={24} templates={null} settings={SETTINGS} onArm={() => {}} onPostpone={() => {}} onLost={() => {}} />);
    const card = screen.getByTestId("today-card-L1");
    expect(within(card).getByText(UI.call).closest("a")?.getAttribute("href")).toBe("tel:+972521234567");
    expect(within(card).getByText(UI.waOptedOut).closest("button")).toHaveProperty("disabled", true);
  });
});

describe("the drawer's automatic-messages line", () => {
  const c = conv({
    auto: [
      { kind: "first_menu", step: "a", at: "2026-10-03T07:40:00Z", menu: "ube", delivered_at: "2026-10-03T07:41:00Z", read_at: "2026-10-03T07:42:00Z", failed: false },
      { kind: "more_info", step: "b", at: "2026-10-03T07:46:00Z", menu: null, delivered_at: null, read_at: null, failed: false },
    ],
    taps: [{ button_id: "lj.more", at: "2026-10-03T07:45:00Z", title: "רוצה לשמוע עוד" }],
  });
  it("shows a compact line and expands to the list", () => {
    render(<AutoSentLine conversation={c} now={new Date("2026-10-03T08:00:00Z")} />);
    const line = screen.getByTestId("auto-sent-line");
    expect(line.textContent).toContain("נשלח אוטומטית: הודעת «נחזור אליכם»");
    expect(line.textContent).toContain("לחץ «רוצה לשמוע עוד»");
    expect(screen.queryByTestId("auto-sent-list")).toBeNull();
    fireEvent.click(screen.getByTestId("auto-sent-toggle"));
    const items = within(screen.getByTestId("auto-sent-list")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("תפריט האובה");
    expect(items[0].textContent).toContain("נקרא");
  });
  it("renders nothing when nothing was sent", () => {
    const { container } = render(<AutoSentLine conversation={conv()} />);
    expect(container.innerHTML).toBe("");
  });
});
