import { describe, expect, it } from "vitest";
import { agedTone, capRows } from "./queue";
import type { TodayItemType, TodayRow } from "./types";

function row(item_type: TodayItemType, lead_id: string): TodayRow {
  return {
    lead_id,
    item_type,
    org_id: "org",
    org_name: "org",
    contact_name: null,
    phone_e164: "+972500000000",
    email: null,
    campaign_name: null,
    platform: null,
    status: "new",
    assignee: null,
    next_touch_at: null,
    first_touch_at: null,
    created_at: "2026-08-01T00:00:00Z",
    is_existing_customer: false,
    shopify_snapshot: null,
    shopify_snapshot_at: null,
    converted_order_ref: null,
    converted_amount: null,
    converted_at: null,
    sla_deadline_at: "2026-08-02T00:00:00Z",
    sla_state: "overdue",
    age_days: 17,
    uncontactable: false,
  };
}

describe("capRows", () => {
  it("caps the backlog at the daily commitment and reports what is waiting", () => {
    const rows = Array.from({ length: 40 }, (_, i) => row("new_lead", `n${i}`));
    const { visible, remaining } = capRows(rows, 15);
    expect(visible).toHaveLength(15);
    expect(remaining).toBe(25);
  });

  it("never caps a conversion or a returning customer", () => {
    const rows = [
      row("conversion", "c1"),
      row("returning_customer", "r1"),
      ...Array.from({ length: 20 }, (_, i) => row("new_lead", `n${i}`)),
    ];
    const { visible, remaining } = capRows(rows, 5);
    expect(visible.filter((r) => r.item_type !== "new_lead")).toHaveLength(2);
    expect(visible).toHaveLength(7);
    expect(remaining).toBe(15);
  });

  it("reports nothing waiting when the section fits inside the cap", () => {
    const { visible, remaining } = capRows([row("new_lead", "a")], 15);
    expect(visible).toHaveLength(1);
    expect(remaining).toBe(0);
  });

  it("treats a cap of zero as a cap, not as unlimited", () => {
    // Built from new leads, not follow-ups: a cap of zero must still mean zero,
    // and the section it means it about is the one the cap governs. Written
    // against `due_follow_up` this case passed for the wrong reason and would
    // have flipped 0 → 3 under tranche 173 without anything being broken.
    const rows = Array.from({ length: 3 }, (_, i) => row("new_lead", `n${i}`));
    const { visible, remaining } = capRows(rows, 0);
    expect(visible).toHaveLength(0);
    expect(remaining).toBe(3);
  });

  it("never caps a promised callback, even at a cap of zero", () => {
    // D1. The other half of the case above, and the reason it had to move: a
    // due follow-up is a commitment already made, so no cap reaches it.
    const rows = Array.from({ length: 3 }, (_, i) => row("due_follow_up", `d${i}`));
    const { visible, remaining } = capRows(rows, 0);
    expect(visible).toHaveLength(3);
    expect(remaining).toBe(0);
  });
});

describe("agedTone", () => {
  it("is calm inside the SLA window and urgent beyond it", () => {
    expect(agedTone(0, 24)).toBe("muted");
    expect(agedTone(1, 24)).toBe("muted");
    expect(agedTone(3, 24)).toBe("overdue");
  });

  it("moves with the SLA rather than a hardcoded day count", () => {
    // 96h = four days: a three-day-old lead is urgent at 24h and calm at 96h.
    expect(agedTone(3, 24)).toBe("overdue");
    expect(agedTone(3, 96)).toBe("muted");
  });
});
