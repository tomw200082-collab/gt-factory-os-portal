import { describe, it, expect } from "vitest";
import {
  toIsoDate,
  parseIsoDate,
  startOfWeek,
  addDays,
  fmtWeekRange,
  fmtDayHeader,
  stepForToday,
  defaultFirmWeekStart,
  workingDaysOf,
  familyTintVar,
  nowInIsrael,
  rollupDraftFgUnits,
  type DraftWeekRow,
} from "./cadence";

function teaRow(plan_id: string, packs: { item_id: string; item_name: string | null; qty: number }[]): DraftWeekRow {
  return {
    plan_id, plan_date: "2026-01-18", track: "tea_tank",
    base_bom_head_id: "B1", base_name: "Base", base_family: "calm",
    batch_size_l: 500, packs, item_id: null, item_name: null,
    planned_qty: 500, uom: "L", notes: null,
  };
}
function matchaRow(plan_id: string, item_id: string, item_name: string, qty: number): DraftWeekRow {
  return {
    plan_id, plan_date: "2026-01-19", track: "matcha_repack",
    base_bom_head_id: null, base_name: null, base_family: null,
    batch_size_l: null, packs: [], item_id, item_name,
    planned_qty: qty, uom: "UNIT", notes: null,
  };
}

// Reference anchors (2026 starts on a Thursday):
//   2026-01-04 = Sunday, 2026-01-08 = Thursday, 2026-01-06 = Tuesday
//   2026-01-18 = Sunday

describe("date helpers", () => {
  it("toIsoDate ↔ parseIsoDate roundtrip without TZ drift", () => {
    const d = new Date(2026, 0, 18); // Jan 18 2026, local midnight
    expect(toIsoDate(d)).toBe("2026-01-18");
    expect(toIsoDate(parseIsoDate("2026-01-18"))).toBe("2026-01-18");
  });

  it("startOfWeek backs up to the Sunday of that week", () => {
    const thu = new Date(2026, 0, 8); // Thursday
    const sun = startOfWeek(thu);
    expect(sun.getDay()).toBe(0);
    expect(toIsoDate(sun)).toBe("2026-01-04");
  });

  it("startOfWeek is idempotent on a Sunday", () => {
    const sun = new Date(2026, 0, 4);
    expect(toIsoDate(startOfWeek(sun))).toBe("2026-01-04");
  });

  it("addDays crosses month boundaries", () => {
    expect(toIsoDate(addDays(parseIsoDate("2026-01-29"), 6))).toBe("2026-02-04");
  });

  it("fmtDayHeader names the weekday + date", () => {
    expect(fmtDayHeader(new Date(2026, 0, 8))).toEqual({
      dayName: "Thu",
      dateLabel: "Jan 8",
    });
  });
});

describe("fmtWeekRange", () => {
  it("collapses month when start & end share one", () => {
    expect(fmtWeekRange("2026-01-18")).toBe("Week of Jan 18–24, 2026");
  });
  it("shows both months across a boundary", () => {
    expect(fmtWeekRange("2026-01-29")).toBe("Week of Jan 29–Feb 4, 2026");
  });
});

describe("stepForToday", () => {
  it("Thursday → firm", () => {
    const thu = new Date(2026, 0, 8);
    expect(thu.getDay()).toBe(4);
    expect(stepForToday(thu)).toBe("firm");
  });
  it("Sunday → procure", () => {
    const sun = new Date(2026, 0, 4);
    expect(sun.getDay()).toBe(0);
    expect(stepForToday(sun)).toBe("procure");
  });
  it("any other day → execute", () => {
    const tue = new Date(2026, 0, 6);
    expect(tue.getDay()).toBe(2);
    expect(stepForToday(tue)).toBe("execute");
  });
});

describe("defaultFirmWeekStart", () => {
  it("is the Sunday two weeks after the current week's Sunday", () => {
    // Thursday Jan 8 → week Sunday Jan 4 → +14 = Jan 18 (a Sunday)
    const out = defaultFirmWeekStart(new Date(2026, 0, 8));
    expect(out).toBe("2026-01-18");
    expect(parseIsoDate(out).getDay()).toBe(0);
  });
  it("is stable across the Thu→Sun handoff (same target from Sun of same week)", () => {
    const fromThu = defaultFirmWeekStart(new Date(2026, 0, 8)); // Thu
    const fromSun = defaultFirmWeekStart(new Date(2026, 0, 4)); // Sun of same week
    expect(fromThu).toBe(fromSun);
  });
});

describe("workingDaysOf", () => {
  it("returns the five Sun–Thu working days", () => {
    const days = workingDaysOf("2026-01-18");
    expect(days).toEqual([
      "2026-01-18",
      "2026-01-19",
      "2026-01-20",
      "2026-01-21",
      "2026-01-22",
    ]);
    expect(parseIsoDate(days[0]).getDay()).toBe(0); // Sunday
    expect(parseIsoDate(days[4]).getDay()).toBe(4); // Thursday
  });
});

describe("nowInIsrael", () => {
  it("returns a valid Date with in-range wall-clock fields", () => {
    const d = nowInIsrael();
    expect(d instanceof Date).toBe(true);
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(d.getDay()).toBeGreaterThanOrEqual(0);
    expect(d.getDay()).toBeLessThanOrEqual(6);
    expect(d.getHours()).toBeGreaterThanOrEqual(0);
    expect(d.getHours()).toBeLessThanOrEqual(23);
  });

  it("agrees with the IL calendar date for the current instant", () => {
    const il = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()); // YYYY-MM-DD
    expect(toIsoDate(nowInIsrael())).toBe(il);
  });
});

describe("rollupDraftFgUnits", () => {
  it("explodes tea packs and aggregates the same FG across batches", () => {
    const rows = [
      teaRow("p1", [{ item_id: "A", item_name: "Alpha", qty: 10 }, { item_id: "B", item_name: "Beta", qty: 20 }]),
      teaRow("p2", [{ item_id: "A", item_name: "Alpha", qty: 5 }]),
    ];
    const out = rollupDraftFgUnits(rows);
    const a = out.find((r) => r.item_id === "A");
    const b = out.find((r) => r.item_id === "B");
    expect(a?.units).toBe(15); // 10 + 5 across two batches
    expect(b?.units).toBe(20);
    expect(a?.track).toBe("tea_tank");
  });

  it("passes matcha single-FG planned_qty through", () => {
    const out = rollupDraftFgUnits([matchaRow("m1", "M", "Matcha", 7)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ item_id: "M", units: 7, track: "matcha_repack" });
  });

  it("sorts by units desc and skips zero/empty", () => {
    const rows = [
      teaRow("p1", [{ item_id: "A", item_name: "Alpha", qty: 3 }, { item_id: "Z", item_name: "Zero", qty: 0 }]),
      matchaRow("m1", "M", "Matcha", 50),
    ];
    const out = rollupDraftFgUnits(rows);
    expect(out.map((r) => r.item_id)).toEqual(["M", "A"]); // 50 before 3
    expect(out.find((r) => r.item_id === "Z")).toBeUndefined(); // qty 0 dropped
  });
});

describe("familyTintVar", () => {
  it("maps a known family to its token", () => {
    expect(familyTintVar("calm")).toBe("var(--family-calm)");
  });
  it("normalizes case and spaces to the hyphenated token", () => {
    expect(familyTintVar("Pink Sangria")).toBe("var(--family-pink-sangria)");
    expect(familyTintVar("  Matcha  ")).toBe("var(--family-matcha)");
  });
  it("falls back to accent for unknown or null families", () => {
    expect(familyTintVar("Nonexistent")).toBe("var(--accent)");
    expect(familyTintVar(null)).toBe("var(--accent)");
  });
});
