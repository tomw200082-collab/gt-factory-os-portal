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
} from "./cadence";

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
