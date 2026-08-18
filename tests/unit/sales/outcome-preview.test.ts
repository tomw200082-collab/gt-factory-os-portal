import { describe, expect, it } from "vitest";
import { nextBusinessTouchPreview } from "@/app/(sales)/_components/OutcomeSheet";

// The preview exists to say what the server is about to schedule. If the two
// ever disagree the preview is worse than no preview at all, so these pin the
// client mirror to sales_core.next_business_touch (migration 0324):
// N days out, 09:00 Israel time, never Friday or Saturday.

describe("nextBusinessTouchPreview", () => {
  it("is 09:00 local on the day it lands", () => {
    const from = new Date("2026-08-18T13:24:00"); // a Tuesday
    const d = nextBusinessTouchPreview(1, from);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  it("rolls a Friday forward to Sunday", () => {
    // Thursday + 1 = Friday, which nobody answers.
    const thursday = new Date("2026-08-20T10:00:00");
    expect(thursday.getDay()).toBe(4);
    const d = nextBusinessTouchPreview(1, thursday);
    expect(d.getDay()).toBe(0); // Sunday
  });

  it("rolls a Saturday forward to Sunday", () => {
    // Thursday + 2 = Saturday.
    const thursday = new Date("2026-08-20T10:00:00");
    const d = nextBusinessTouchPreview(2, thursday);
    expect(d.getDay()).toBe(0);
  });

  it("leaves a weekday alone", () => {
    const tuesday = new Date("2026-08-18T10:00:00");
    const d = nextBusinessTouchPreview(1, tuesday);
    expect(d.getDay()).toBe(3); // Wednesday
  });

  it("never returns a weekend day, for either interval, from any starting day", () => {
    for (let offset = 0; offset < 7; offset += 1) {
      const from = new Date("2026-08-16T10:00:00");
      from.setDate(from.getDate() + offset);
      for (const days of [1, 2]) {
        const d = nextBusinessTouchPreview(days, from);
        expect([5, 6]).not.toContain(d.getDay());
      }
    }
  });
});
