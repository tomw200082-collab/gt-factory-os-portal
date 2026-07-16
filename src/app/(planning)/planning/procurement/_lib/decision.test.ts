// ---------------------------------------------------------------------------
// Procurement decision engine unit tests — Tranche 132 (v2, shortage math).
//
// Fallback path (no usable coverage_trace — old sessions, user-added lines):
//   C1 — placed / skipped → handled bucket
//   C2 — order_by_date in the past → must_today + isOverdue
//   C3 — order_by_date == today → must_today, days 0
//   C4 — order_by_date in the future, tier!=urgent → can_wait
//   C5 — tier urgent with a future order_by_date → must_today
//   C6 — whyNow fallback copy: overdue / today / can-wait / handled
//   C8 — unparseable order_by_date → daysUntilOrderBy null, can_wait
//   C9 — daysHe Hebrew grammar
//
// Trace math (v2):
//   V1 — projected stockout at need → must_today, shortage quantified
//   V2 — grace above zero + future last-safe date → can_wait + waitUntil
//   V3 — last safe order day == today, no gap yet → must_today (order_today)
//   V4 — driver = earliest last-safe line; extra critical lines counted
//   V5 — recount flag: never-counted / old counts flagged, fresh + pre-0284 not
//   V6 — dropped lines ignored; mixed traced/untraced uses the traced line
//   V7 — groupByDecision sorts deeper shortage first within must_today
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  assessLine,
  classifyPo,
  daysHe,
  groupByDecision,
  type DecisionInput,
  type DecisionLineInput,
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

interface TraceOpts {
  need: string;
  poh: number;
  adu?: number;
  lt?: number;
  countAge?: number | null; // null = never counted; undefined = pre-0284 trace
  blocking?: { code: string }[];
  ltSource?: string;
}

function line(label: string, t?: TraceOpts): DecisionLineInput {
  if (!t) return { line_label: label, coverage_trace: null };
  const trace: Record<string, unknown> = {
    on_hand_inv: 10,
    total_horizon_demand_inv: 100,
    avg_daily_demand_inv: t.adu ?? 10,
    cover_days: 7,
    safety_floor_inv: 70,
    need_date: t.need,
    projected_on_hand_at_need_inv: t.poh,
    consolidation_window_days: 21,
    window_demand_inv: 50,
    window_open_po_receipts_inv: 0,
    order_qty_inventory_uom: 60,
    purchase_to_inv_factor: 1,
    lead_time_days: t.lt ?? 7,
    demand_model_version: "v2",
  };
  if (t.countAge !== undefined || t.ltSource) {
    trace.trace_version = 3;
    trace.lt_source = t.ltSource ?? "component_master";
    if (t.countAge !== undefined) trace.last_count_age_days = t.countAge;
  }
  if (t.blocking) trace.blocking = t.blocking;
  return { line_label: label, coverage_trace: trace };
}

describe("classifyPo — fallback (no trace)", () => {
  it("C1 placed and skipped land in handled", () => {
    expect(classifyPo(po({ status: "placed" }), TODAY).bucket).toBe("handled");
    expect(classifyPo(po({ status: "skipped" }), TODAY).bucket).toBe("handled");
  });

  it("C2 a past order_by_date is must_today and overdue", () => {
    const c = classifyPo(po({ order_by_date: "2026-05-26" }), TODAY);
    expect(c.bucket).toBe("must_today");
    expect(c.isOverdue).toBe(true);
    expect(c.daysUntilOrderBy).toBe(-3);
    expect(c.usedTraceMath).toBe(false);
  });

  it("C3 due today is must_today, days 0", () => {
    const c = classifyPo(po({ order_by_date: TODAY }), TODAY);
    expect(c.bucket).toBe("must_today");
    expect(c.daysUntilOrderBy).toBe(0);
  });

  it("C4 a future order_by_date (non-urgent) can wait, waitUntil = order_by", () => {
    const c = classifyPo(po({ order_by_date: "2026-06-10" }), TODAY);
    expect(c.bucket).toBe("can_wait");
    expect(c.waitUntil).toBe("2026-06-10");
  });

  it("C5 urgent tier forces must_today even when order_by_date is future", () => {
    const c = classifyPo(
      po({ tier: "urgent", order_by_date: "2026-06-20" }),
      TODAY,
    );
    expect(c.bucket).toBe("must_today");
  });

  it("C6 whyNow fallback copy reflects the situation", () => {
    expect(
      classifyPo(po({ order_by_date: "2026-05-26" }), TODAY).whyNow,
    ).toMatch(/באיחור/);
    expect(classifyPo(po({ order_by_date: TODAY }), TODAY).whyNow).toMatch(
      /להזמין עד היום/,
    );
    expect(
      classifyPo(po({ order_by_date: "2026-06-10" }), TODAY).whyNow,
    ).toMatch(/אפשר להמתין/);
    expect(classifyPo(po({ status: "placed" }), TODAY).whyNow).toBe("הוזמן");
    expect(classifyPo(po({ status: "skipped" }), TODAY).whyNow).toBe(
      "דולג / בוטל",
    );
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

describe("classifyPo — trace math (v2)", () => {
  it("V1 projected stockout at need → must_today with quantified shortage", () => {
    // Stock hits zero on the need date (poh<0); lead time 7 → even ordering
    // today leaves a 7-day gap.
    const c = classifyPo(
      po({
        order_by_date: "2026-06-20", // fallback would say can_wait — trace wins
        lines: [line("Lime Puree", { need: TODAY, poh: -5, lt: 7 })],
      }),
      TODAY,
    );
    expect(c.usedTraceMath).toBe(true);
    expect(c.bucket).toBe("must_today");
    expect(c.severity).toBe("shortage_now");
    expect(c.shortageDays).toBe(7);
    expect(c.isOverdue).toBe(true);
    expect(c.driverLabel).toBe("Lime Puree");
    expect(c.whyNow).toContain("Lime Puree");
    expect(c.whyNow).toContain("פער");
  });

  it("V2 grace above zero with a future last-safe date → can_wait + waitUntil", () => {
    // need 06-01 with 20 units left at 10/day → zero ≈ 06-03; lt 2 →
    // last safe order day 06-01 (in 3 days).
    const c = classifyPo(
      po({
        order_by_date: "2026-05-20", // fallback would say overdue — trace wins
        lines: [line("Sugar", { need: "2026-06-01", poh: 20, adu: 10, lt: 2 })],
      }),
      TODAY,
    );
    expect(c.bucket).toBe("can_wait");
    expect(c.severity).toBe("can_wait");
    expect(c.shortageDays).toBe(0);
    expect(c.isOverdue).toBe(false);
    expect(c.waitUntil).toBe("2026-06-01");
    expect(c.whyNow).toContain("אפשר להמתין עד 01/06");
    expect(c.whyNow).toContain("3 ימים");
  });

  it("V3 last safe order day is today (no gap yet) → must_today / order_today", () => {
    // zero = 06-01, lt 3 → last safe = 05-29 = today; ordering today still
    // arrives exactly in time (shortage 0), tomorrow it would not.
    const c = classifyPo(
      po({ lines: [line("Labels", { need: "2026-06-01", poh: 0, lt: 3 })] }),
      TODAY,
    );
    expect(c.bucket).toBe("must_today");
    expect(c.severity).toBe("order_today");
    expect(c.shortageDays).toBe(0);
    expect(c.whyNow).toContain("היום אחרון להזמין");
    expect(c.whyNow).toContain("Labels");
  });

  it("V4 driver is the earliest last-safe line; other critical lines are counted", () => {
    const c = classifyPo(
      po({
        lines: [
          line("Calm wait", { need: "2026-06-10", poh: 100, adu: 10, lt: 2 }),
          line("Deep shortage", { need: TODAY, poh: -5, lt: 7 }),
          line("Last day", { need: "2026-06-01", poh: 0, lt: 3 }),
        ],
      }),
      TODAY,
    );
    expect(c.bucket).toBe("must_today");
    expect(c.driverLabel).toBe("Deep shortage");
    expect(c.whyNow).toContain("Deep shortage");
    expect(c.whyNow).toContain("+1");
  });

  it("V5 recount flags never-counted and old counts; fresh and pre-0284 stay quiet", () => {
    const never = classifyPo(
      po({ lines: [line("A", { need: TODAY, poh: -1, countAge: null })] }),
      TODAY,
    );
    expect(never.recount).not.toBeNull();
    expect(never.recount?.worstAgeDays).toBeNull();

    const old = classifyPo(
      po({ lines: [line("B", { need: TODAY, poh: -1, countAge: 45 })] }),
      TODAY,
    );
    expect(old.recount?.worstAgeDays).toBe(45);

    const fresh = classifyPo(
      po({ lines: [line("C", { need: TODAY, poh: -1, countAge: 3 })] }),
      TODAY,
    );
    expect(fresh.recount).toBeNull();

    // Pre-0284 trace (no last_count_age_days key at all) → no recount noise.
    const pre = classifyPo(
      po({ lines: [line("D", { need: TODAY, poh: -1 })] }),
      TODAY,
    );
    expect(pre.recount).toBeNull();
  });

  it("V6 dropped lines are ignored; a traced line beats untraced siblings", () => {
    const c = classifyPo(
      po({
        order_by_date: "2026-06-20",
        lines: [
          {
            ...line("Dropped stockout", { need: TODAY, poh: -50, lt: 14 }),
            is_dropped: true,
          },
          line("No trace at all"),
          line("Waits fine", { need: "2026-06-10", poh: 100, adu: 10, lt: 2 }),
        ],
      }),
      TODAY,
    );
    // The dropped stockout must not force must_today; the traced healthy
    // line drives a can_wait.
    expect(c.bucket).toBe("can_wait");
    expect(c.lineRisks).toHaveLength(1);
  });

  it("V7 groupByDecision sorts deeper shortage first within must_today", () => {
    const shallow = po({
      lines: [line("Shallow", { need: TODAY, poh: -1, lt: 3 })],
    });
    const deep = po({
      lines: [line("Deep", { need: TODAY, poh: -1, lt: 14 })],
    });
    const groups = groupByDecision([shallow, deep], TODAY);
    expect(groups.must_today).toHaveLength(2);
    expect(groups.must_today[0].driverLabel).toBe("Deep");
    expect(groups.must_today[1].driverLabel).toBe("Shallow");
  });
});

describe("assessLine", () => {
  it("returns null without a usable trace and computes exposure with one", () => {
    expect(assessLine(line("x"), TODAY)).toBeNull();
    const r = assessLine(
      line("y", { need: "2026-06-01", poh: 20, adu: 10, lt: 2 }),
      TODAY,
    );
    expect(r).not.toBeNull();
    expect(r?.zeroDate).toBe("2026-06-03");
    expect(r?.lastSafeOrderDate).toBe("2026-06-01");
    expect(r?.shortageDays).toBe(0);
    expect(r?.severity).toBe("can_wait");
  });

  it("flags missing price and defaulted lead time from the trace", () => {
    const r = assessLine(
      line("z", {
        need: TODAY,
        poh: -1,
        ltSource: "global_default",
        countAge: 3,
        blocking: [{ code: "missing_price" }],
      }),
      TODAY,
    );
    expect(r?.missingPrice).toBe(true);
    expect(r?.ltSource).toBe("global_default");
  });
});
