// ---------------------------------------------------------------------------
// Procurement decision engine unit tests — Tranche 028.
//
// Coverage:
//   C1 — placed / skipped → handled bucket
//   C2 — order_by_date in the past → must_today + isOverdue
//   C3 — order_by_date == today → must_today, not overdue, days 0
//   C4 — order_by_date in the future, tier!=urgent → can_wait
//   C5 — tier urgent with a future order_by_date → must_today (not can_wait)
//   C6 — whyNow copy: overdue / today / can-wait variants
//   C7 — groupByDecision sorts most-overdue first within must_today
//   C8 — unparseable order_by_date → daysUntilOrderBy null, lands in can_wait
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  classifyPo,
  daysHe,
  groupByDecision,
  type DecisionInput,
} from "./decision";

const TODAY = "2026-05-29";

function po(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    status: "proposed",
    tier: "must",
    order_by_date: "2026-06-05",
    earliest_need_date: "2026-06-12",
    ...overrides,
  };
}

describe("classifyPo", () => {
  it("C1 placed and skipped land in handled", () => {
    expect(classifyPo(po({ status: "placed" }), TODAY).bucket).toBe("handled");
    expect(classifyPo(po({ status: "skipped" }), TODAY).bucket).toBe("handled");
  });

  it("C2 a past order_by_date is must_today and overdue", () => {
    const c = classifyPo(po({ order_by_date: "2026-05-26" }), TODAY);
    expect(c.bucket).toBe("must_today");
    expect(c.isOverdue).toBe(true);
    expect(c.daysUntilOrderBy).toBe(-3);
  });

  it("C3 due today is must_today, not overdue, days 0", () => {
    const c = classifyPo(po({ order_by_date: TODAY }), TODAY);
    expect(c.bucket).toBe("must_today");
    expect(c.isOverdue).toBe(false);
    expect(c.daysUntilOrderBy).toBe(0);
  });

  it("C4 a future order_by_date (non-urgent) can wait", () => {
    const c = classifyPo(po({ order_by_date: "2026-06-10" }), TODAY);
    expect(c.bucket).toBe("can_wait");
    expect(c.isOverdue).toBe(false);
    expect(c.daysUntilOrderBy).toBe(12);
  });

  it("C5 urgent tier forces must_today even when order_by_date is future", () => {
    const c = classifyPo(
      po({ tier: "urgent", order_by_date: "2026-06-20" }),
      TODAY,
    );
    expect(c.bucket).toBe("must_today");
  });

  it("C6 whyNow copy reflects the situation", () => {
    expect(classifyPo(po({ order_by_date: "2026-05-26" }), TODAY).whyNow).toMatch(
      /באיחור/,
    );
    expect(classifyPo(po({ order_by_date: TODAY }), TODAY).whyNow).toMatch(
      /חייב לצאת היום/,
    );
    expect(
      classifyPo(po({ order_by_date: "2026-06-10" }), TODAY).whyNow,
    ).toMatch(/אפשר להמתין/);
    expect(classifyPo(po({ status: "placed" }), TODAY).whyNow).toBe("הוזמן");
  });

  it("C8 unparseable order_by_date → null days, defaults to can_wait", () => {
    const c = classifyPo(po({ order_by_date: "n/a" }), TODAY);
    expect(c.daysUntilOrderBy).toBeNull();
    expect(c.bucket).toBe("can_wait");
  });

  it("C9 daysHe uses correct Hebrew grammar (1=יום, 2=יומיים, else N ימים)", () => {
    expect(daysHe(1)).toBe("יום");
    expect(daysHe(-1)).toBe("יום");
    expect(daysHe(2)).toBe("יומיים");
    expect(daysHe(9)).toBe("9 ימים");
  });
});

describe("groupByDecision", () => {
  it("C7 buckets and sorts most-overdue first in must_today", () => {
    const groups = groupByDecision(
      [
        po({ order_by_date: "2026-05-28" }), // overdue -1
        po({ order_by_date: "2026-05-20" }), // overdue -9 (most urgent)
        po({ order_by_date: "2026-06-10" }), // can wait
        po({ status: "placed", order_by_date: "2026-05-01" }), // handled
      ],
      TODAY,
    );
    expect(groups.must_today).toHaveLength(2);
    expect(groups.can_wait).toHaveLength(1);
    expect(groups.handled).toHaveLength(1);
    // most-overdue (smallest daysUntilOrderBy) first
    expect(groups.must_today[0].po.order_by_date).toBe("2026-05-20");
    expect(groups.must_today[1].po.order_by_date).toBe("2026-05-28");
  });
});
