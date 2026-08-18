import { describe, it, expect } from "vitest";
import {
  CHANNEL_LABELS,
  EVENT_LABELS,
  LOST_REASONS,
  NAV_LABELS,
  OUTCOME_LABELS,
  RULE_MESSAGES,
  STATUS_LABELS,
  TODAY_SECTION_LABELS,
  UI,
} from "@/app/(sales)/_lib/labels";

const HEBREW = /[֐-׿]/;

/** Latin that is allowed to appear on a Hebrew screen: product names and the
 *  placeholder token the templates document. Shopify joins WhatsApp for the
 *  same reason — it is the product's own name, and the transliteration
 *  ("שופיפיי") is not what a Hebrew speaker reads it as. */
const ALLOWED_LATIN = ["WhatsApp", "Shopify", "GT", "SLA", "{{name}}"];

function stripAllowed(value: string): string {
  return ALLOWED_LATIN.reduce((acc, token) => acc.split(token).join(""), value);
}

describe("sales labels", () => {
  it("gives every lead status a Hebrew display label", () => {
    for (const [value, label] of Object.entries(STATUS_LABELS)) {
      expect(label, value).toMatch(HEBREW);
    }
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(["lost", "new", "won", "working"]);
  });

  it("labels every Today section and every outcome", () => {
    expect(Object.keys(TODAY_SECTION_LABELS).sort()).toEqual([
      "conversion",
      "due_follow_up",
      "new_lead",
      "returning_customer",
    ]);
    expect(Object.keys(OUTCOME_LABELS).sort()).toEqual([
      "answered_progressing",
      "lost",
      "no_answer",
      "whatsapp_sent",
    ]);
    for (const label of Object.values({ ...TODAY_SECTION_LABELS, ...OUTCOME_LABELS })) {
      expect(label).toMatch(HEBREW);
    }
  });

  it("covers every lead_event type the schema can produce", () => {
    // 0318's nine values plus the two 0322 adds. A new event type without a
    // label would render as a raw English token in the timeline.
    for (const type of [
      "created",
      "status_change",
      "note",
      "assignment",
      "next_touch_set",
      "alert_sent",
      "converted",
      "matched_existing_customer",
      "imported",
      "outreach",
      "outcome",
    ]) {
      expect(EVENT_LABELS[type], type).toMatch(HEBREW);
    }
  });

  it("ships no English UI string", () => {
    for (const [key, value] of Object.entries(UI)) {
      // Four arguments, not three: triageLine takes four counts, and calling
      // it with three printed the word "undefined" — which this guard then
      // correctly flagged as English. The arity of the call is the fixture,
      // not the rule being tested.
      const rendered =
        typeof value === "function" ? String(value(1, 2, 3, 4)) : String(value);
      const residue = stripAllowed(rendered);
      expect(/[A-Za-z]{2,}/.test(residue), `${key}: ${rendered}`).toBe(false);
    }
  });

  it("translates every server rule code the API can return", () => {
    for (const code of [
      "SALES_LOST_REQUIRES_REASON",
      "SALES_WON_IS_EVIDENCE_ONLY",
      "SALES_NEXT_TOUCH_REQUIRED",
      "SALES_OPEN_LEAD_WITHOUT_NEXT_TOUCH",
      "SALES_INVALID_CHANNEL",
      "SALES_INVALID_OUTCOME",
      "SALES_INVALID_STATUS",
      "SALES_LEAD_NOT_FOUND",
      "SALES_NOTE_EMPTY",
    ]) {
      expect(RULE_MESSAGES[code], code).toMatch(HEBREW);
    }
  });

  it("keeps navigation and lost reasons in Hebrew", () => {
    for (const label of Object.values(NAV_LABELS)) expect(label).toMatch(HEBREW);
    for (const reason of LOST_REASONS) expect(reason).toMatch(HEBREW);
    for (const label of Object.values(CHANNEL_LABELS)) expect(label).toMatch(HEBREW);
  });

  it("never offers a way to declare a lead won", () => {
    // Winning is proven by a Shopify order, never clicked. The outcome list and
    // the status tabs must not contain an affordance for it.
    expect(Object.keys(OUTCOME_LABELS)).not.toContain("won");
    expect(UI.wonBannerHint).toMatch(HEBREW);
  });
});

describe("hebrew number agreement", () => {
  // "1 לידים" is as wrong to a native reader as "1 leads". Every count in the
  // surface goes through the same pair of helpers, so this covers all of them.
  it("uses the singular noun at one and the numeral above it", () => {
    expect(UI.showMore(1)).toBe("הצג עוד ליד אחד");
    expect(UI.showMore(12)).toBe("הצג עוד 12 לידים");
    expect(UI.orgLeads(1)).toBe("ליד אחד");
    expect(UI.orgLeads(4)).toBe("4 לידים");
  });

  it("agrees the feminine המרה too, and scopes each stat to its own period", () => {
    expect(UI.statsLine(1, 3, 1)).toBe("השבוע: ליד אחד · המרה אחת · בטיפול כרגע: 3");
    expect(UI.statsLine(7, 3, 2)).toBe("השבוע: 7 לידים · 2 המרות · בטיפול כרגע: 3");
  });
});
