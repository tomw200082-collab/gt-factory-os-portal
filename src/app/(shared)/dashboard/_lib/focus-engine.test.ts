// Tranche 060 — Focus Engine rule cascade.
import { describe, expect, it } from "vitest";
import { resolveFocus, type FocusInputs } from "./focus-engine";

const MONDAY = new Date("2026-06-08T08:00:00"); // local Monday
const SUNDAY = new Date("2026-06-07T08:00:00"); // local Sunday

function base(overrides: Partial<FocusInputs> = {}): FocusInputs {
  return {
    now: MONDAY,
    critical: [],
    procurement: null,
    slipped: 0,
    todayPlan: null,
    latePos: 0,
    nextCommitment: null,
    ...overrides,
  };
}

describe("resolveFocus", () => {
  it("rule 0: loading while critical is unknown", () => {
    const r = resolveFocus(base({ critical: null }));
    expect(r.rule).toBe("loading");
  });

  it("rule 1: a single critical row names the blocker", () => {
    const r = resolveFocus(base({ critical: [{ label: "Lime juice stockout" }] }));
    expect(r.rule).toBe("critical");
    expect(r.tone).toBe("danger");
    expect(r.sentence).toContain("Lime juice stockout");
    expect(r.sentence).toContain("stops production today");
  });

  it("rule 1: multiple critical rows lead with the count and the worst", () => {
    const r = resolveFocus(
      base({ critical: [{ label: "Stockout A" }, { label: "Break-glass" }] }),
    );
    expect(r.sentence).toContain("2 critical issues");
    expect(r.sentence).toContain("Stockout A");
  });

  it("rule 2: Sunday with no session is procurement day", () => {
    const r = resolveFocus(
      base({
        now: SUNDAY,
        procurement: { sessionExists: false, overdue: 0, dueToday: 0, nextSupplier: null },
      }),
    );
    expect(r.rule).toBe("procurement_day");
    expect(r.href).toBe("/planning/procurement");
  });

  it("rule 2 does not fire for roles that cannot see purchasing", () => {
    const r = resolveFocus(base({ now: SUNDAY, procurement: null }));
    expect(r.rule).toBe("all_clear");
  });

  it("rule 3: overdue supplier orders name the next supplier", () => {
    const r = resolveFocus(
      base({
        procurement: { sessionExists: true, overdue: 2, dueToday: 1, nextSupplier: "Tempo" },
      }),
    );
    expect(r.rule).toBe("procurement_due");
    expect(r.sentence).toContain("2 supplier orders are overdue");
    expect(r.sentence).toContain("Tempo");
  });

  it("rule 4: slipped plans", () => {
    const r = resolveFocus(base({ slipped: 3 }));
    expect(r.rule).toBe("slipped");
    expect(r.sentence).toContain("3 production runs are overdue");
  });

  it("rule 5: today's plan in progress names the next run", () => {
    const r = resolveFocus(
      base({ todayPlan: { planned: 5, done: 2, nextItem: "Mojito 330ml" } }),
    );
    expect(r.rule).toBe("plan_progress");
    expect(r.sentence).toContain("next: Mojito 330ml");
  });

  it("rule 5: completed plan reads as success", () => {
    const r = resolveFocus(
      base({ todayPlan: { planned: 3, done: 3, nextItem: null } }),
    );
    expect(r.rule).toBe("plan_complete");
    expect(r.tone).toBe("success");
  });

  it("rule 6: late POs", () => {
    const r = resolveFocus(base({ latePos: 1 }));
    expect(r.rule).toBe("late_pos");
    expect(r.sentence).toContain("1 delivery is late from suppliers");
  });

  it("rule 7: all clear points forward at the next commitment", () => {
    const r = resolveFocus(base({ nextCommitment: "order-by Thursday (Tempo)" }));
    expect(r.rule).toBe("all_clear");
    expect(r.sentence).toBe("All clear — next: order-by Thursday (Tempo).");
  });

  it("precedence: critical beats procurement day beats slipped", () => {
    const inputs = base({
      now: SUNDAY,
      critical: [{ label: "X" }],
      procurement: { sessionExists: false, overdue: 5, dueToday: 0, nextSupplier: "S" },
      slipped: 9,
    });
    expect(resolveFocus(inputs).rule).toBe("critical");
    expect(resolveFocus({ ...inputs, critical: [] }).rule).toBe("procurement_day");
    expect(
      resolveFocus({ ...inputs, critical: [], now: MONDAY }).rule,
    ).toBe("procurement_due");
  });
});
