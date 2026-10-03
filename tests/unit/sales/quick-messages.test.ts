import { describe, it, expect } from "vitest";
import {
  QUICK_SITUATIONS,
  QUICK_VARIABLES,
  autoSummary,
  fillQuickMessage,
  insertAtCursor,
  isOptedOut,
  quickMessageFor,
  suggestedSituation,
} from "@/app/(sales)/_lib/quickMessages";
import type { LeadConversation, SalesSettings } from "@/app/(sales)/_lib/types";

const conv = (over: Partial<LeadConversation> = {}): LeadConversation => ({
  suggested_situation: "menu_no_reply",
  opted_out: false,
  menu_key: "matcha",
  menu_label: "תפריט המאצ׳ה",
  auto: [],
  taps: [],
  ...over,
});

const settings = (over: Partial<SalesSettings> = {}): SalesSettings => ({
  sla_hours: 24,
  whatsapp_templates: { new_lead: "היי {{name}}, כאן תום", reminder: "ר", returning_customer: "ח" },
  lost_reasons: ["אחר"],
  queue: { daily_cap: 15, order: "newest_first" },
  assignees: [],
  last_changes: [],
  whatsapp_quick_messages: {
    returning_customer: "היי {{name}}, שוב! {{business}}\n{{rep}}",
    tapped_order_no_order: "הזמנה {{name}}\n{{rep}}",
    asked_more: "עוד {{name}}\n{{rep}}",
    no_answer: "לא ענית {{name}}\n{{rep}}",
    menu_no_reply: "היי {{name}}, קיבלתם את {{menu}}?\n{{rep}}, GT Everyday",
    no_auto: "היי {{name}}, תודה שפניתם\n{{rep}}",
  },
  quick_message_changes: {},
  quick_message_signer: "אבי",
  ...over,
});

const lead = {
  contact_name: "דנה כהן",
  org_name: "קפה נחת",
  is_existing_customer: false,
  conversation: conv(),
};

describe("quick messages", () => {
  it("lists the six sendable situations in priority order", () => {
    expect(QUICK_SITUATIONS).toEqual([
      "returning_customer", "tapped_order_no_order", "asked_more", "no_answer", "menu_no_reply", "no_auto",
    ]);
    expect(QUICK_VARIABLES).toEqual(["{{name}}", "{{rep}}", "{{business}}", "{{menu}}"]);
  });

  it("fills every variable, and keeps a greeting clean without a name", () => {
    expect(fillQuickMessage("היי {{name}}, {{menu}} ל־{{business}}\n{{rep}}", {
      name: "דנה", rep: "אבי", business: "קפה נחת", menu: "תפריט האובה",
    })).toBe("היי דנה, תפריט האובה ל־קפה נחת\nאבי");
    expect(fillQuickMessage("היי {{name}}, מה נשמע?", { name: null, rep: "אבי", business: null, menu: null })).toBe("היי, מה נשמע?");
    expect(fillQuickMessage("את {{menu}}", { name: null, rep: "x", business: null, menu: null })).toBe("את התפריט");
  });

  it("uses the server's suggested situation, and falls back without one", () => {
    expect(suggestedSituation(lead)).toBe("menu_no_reply");
    expect(suggestedSituation({ ...lead, conversation: undefined })).toBe("no_auto");
    expect(suggestedSituation({ ...lead, is_existing_customer: true, conversation: null })).toBe("returning_customer");
  });

  it("knows an opted-out lead", () => {
    expect(isOptedOut(lead)).toBe(false);
    expect(isOptedOut({ ...lead, conversation: conv({ opted_out: true, suggested_situation: "opted_out" }) })).toBe(true);
  });

  it("builds the suggested message with the first name, the sender as signer, the business and the menu", () => {
    expect(quickMessageFor(lead, settings(), "menu_no_reply")).toBe("היי דנה, קיבלתם את תפריט המאצ׳ה?\nאבי, GT Everyday");
    expect(quickMessageFor(lead, settings(), "returning_customer")).toBe("היי דנה, שוב! קפה נחת\nאבי");
  });

  it("never signs as Tom for someone else: no signer → no name, never the legacy template's", () => {
    const text = quickMessageFor(lead, settings({ quick_message_signer: undefined }), "no_auto");
    expect(text).not.toContain("תום");
  });

  it("falls back to the old templates only when the API has no quick messages", () => {
    const old = settings({ whatsapp_quick_messages: undefined });
    expect(quickMessageFor(lead, old, "no_auto")).toBe("היי דנה כהן, כאן תום");
    expect(quickMessageFor(lead, null, "no_auto")).toBe("");
  });

  it("summarises what was sent automatically in one line: the last message, its read time, the tap", () => {
    const today = new Date("2026-10-03T07:42:00Z");
    const s = autoSummary(conv({
      auto: [{ kind: "first_menu", step: "w", at: "2026-10-03T07:40:00Z", menu: "matcha", delivered_at: "2026-10-03T07:41:00Z", read_at: "2026-10-03T07:42:00Z", failed: false }],
      taps: [{ button_id: "lj.more", at: "2026-10-03T07:45:00Z", title: "רוצה לשמוע עוד" }],
    }), today);
    expect(s).toBe("נשלח אוטומטית: תפריט המאצ׳ה · נקרא 10:42 · לחץ «רוצה לשמוע עוד»");
  });

  it("says delivered when not read, and nothing about status it does not know", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const one = (d: string | null, r: string | null) => conv({
      auto: [{ kind: "more_info", step: null, at: "2026-10-03T09:00:00Z", menu: null, delivered_at: d, read_at: r, failed: false }],
    });
    expect(autoSummary(one("2026-10-03T09:01:00Z", null), now)).toBe("נשלח אוטומטית: הודעת «נחזור אליכם» · נמסר 12:01");
    expect(autoSummary(one(null, null), now)).toBe("נשלח אוטומטית: הודעת «נחזור אליכם»");
  });

  it("has no line when nothing was sent", () => {
    expect(autoSummary(conv(), new Date())).toBeNull();
    expect(autoSummary(null, new Date())).toBeNull();
  });

  it("inserts a variable at the cursor and returns where the cursor lands", () => {
    expect(insertAtCursor("היי , מה", 4, 4, "{{name}}")).toEqual({ text: "היי {{name}}, מה", cursor: 12 });
    expect(insertAtCursor("abcdef", 1, 3, "X")).toEqual({ text: "aXdef", cursor: 2 });
  });
});
