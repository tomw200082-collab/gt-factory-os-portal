import { describe, it, expect } from "vitest";
import {
  buildDaily,
  dailyHero,
  dailySeries,
  dowOf,
  isOff,
  lastBusinessDay,
  median,
  paceTotal,
  retroChip,
  retroRows,
  revByMinute,
  sameDowMed,
  weekdayProfile,
} from "@/app/(sales)/_lib/report/daily";
import { cust, makeD, order } from "./_d";

// Epoch day 1000 = Sunday 2026-09-27, 09:15 (cut = 555 minutes). Day e is e - 1000 days from it.
//   972 Aug 30 (Sun) | 976 Sep 3 (Thu) | 979 Sep 6 (Sun) | 983 Sep 10 (Thu) | 986 Sep 13 (Sun)
//   990 Sep 17 (Thu) | 993 Sep 20 (Sun) | 995 Sep 22 (Tue) | 997 Sep 24 (Thu) | 1000 today
const o = (c: number, e: number, rev: number, minute: number) => order(c, e, rev, 24, minute);
const ORDERS = [
  o(0, 947, 100_000, 600), // Aug 5: the first order in the data
  o(0, 972, 5_000, 480), o(0, 972, 10_000, 600),
  o(0, 976, 20_000, 600),
  o(0, 979, 20_000, 500),
  o(0, 983, 10_000, 600),
  o(0, 986, 30_000, 540),
  o(0, 990, 40_000, 600),
  o(1, 993, 6_000, 100), o(0, 993, 40_000, 560),
  o(0, 995, 10_000, 600),
  o(0, 997, 30_000, 600), o(1, 997, 20_000, 700),
  o(0, 1000, 25_000, 520),
];
const D = makeD({ cust: [cust("לקוח א"), cust("לקוח ב")], orders: ORDERS });
const daily = buildDaily(D);

describe("the day grid", () => {
  it("runs from the first order to the pull date with real zeros in between", () => {
    expect(daily.first).toBe(947);
    expect(daily.last).toBe(1000);
    expect(daily.n).toBe(54);
    expect(daily.rev[969 - 947]).toBe(0); // Aug 27: nothing sold, and the day exists
    expect(daily.rev[972 - 947]).toBe(15_000);
    expect(daily.cnt[972 - 947]).toBe(2);
    expect(daily.cnt[993 - 947]).toBe(2);
  });

  it("knows the weekday, and treats Friday and Saturday as the rest days", () => {
    expect(dowOf(D, 1000)).toBe(0); // Sunday
    expect(dowOf(D, 997)).toBe(4); // Thursday
    expect([isOff(D, 997), isOff(D, 998), isOff(D, 999), isOff(D, 1000)]).toEqual([false, true, true, false]);
  });

  it("does not crash on a pull with no orders at all", () => {
    const empty = buildDaily(makeD());
    expect(empty.n).toBe(1);
    expect(dailyHero(makeD()).tRev).toBe(0);
  });
});

describe("the usual day", () => {
  it("is the median of the four preceding days of the same weekday", () => {
    // Sundays 993, 986, 979, 972 = 46000, 30000, 20000, 15000 -> (20000 + 30000) / 2
    expect(sameDowMed(daily, 1000, 4)).toBe(25_000);
  });

  it("counts a quiet same weekday as a zero", () => {
    // Thursdays 990, 983, 976, 969 = 40000, 10000, 20000, 0 -> (10000 + 20000) / 2
    expect(sameDowMed(daily, 997, 4)).toBe(15_000);
  });

  it("uses fewer days when the data starts later, and nothing when it has none", () => {
    // 954 is a Wednesday, a week after the first day in the data: one earlier Wednesday exists
    expect(sameDowMed(daily, 954, 4)).toBe(100_000);
    expect(sameDowMed(daily, 947, 4)).toBeNull();
  });

  it("is a median that averages the middle two", () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("today so far", () => {
  it("sums what was booked up to a minute of the day, inclusive", () => {
    expect(revByMinute(D, 993, 555)).toBe(6_000); // the 09:20 order is after the 09:15 pull
    expect(revByMinute(D, 993, 560)).toBe(46_000);
    expect(revByMinute(D, 972, 480)).toBe(5_000);
  });
});

describe("the daily hero", () => {
  const h = dailyHero(D);

  it("headlines the last closed business day, walking back over Friday and Saturday", () => {
    expect(lastBusinessDay(D, daily)).toBe(997);
    expect(h.yest).toBe(997);
    expect(h.yRev).toBe(50_000);
    expect(h.yCnt).toBe(2);
    expect(h.yBase).toBe(15_000);
  });

  it("reads today against the same hour on the four weekdays before", () => {
    // by 09:15: Sep 20 6000, Sep 13 30000, Sep 6 20000, Aug 30 5000 -> sorted 5000 6000 20000 30000
    expect(h.tRev).toBe(25_000);
    expect(h.tCnt).toBe(1);
    expect(h.tBase).toBe(13_000);
  });

  it("compares seven closed days with the seven before", () => {
    expect(h.w1).toBe(106_000); // days 993..999
    expect(h.w0).toBe(70_000); // days 986..992
  });

  it("compares the month so far with the same number of days of the month before", () => {
    expect(h.mDays).toBe(27);
    expect(h.thisMonthLen).toBe(30);
    expect(h.mtd).toBe(251_000); // September 1..27, today's part-day included
    expect(h.pmSame).toBe(100_000); // August 1..27
  });

  it("projects the month by each remaining weekday's own median: a projection, not a forecast", () => {
    // 28, 29, 30 September are Mon, Tue, Wed; this data has no sales on those weekdays at all
    expect(h.pace.rest).toBe(0);
    expect(h.pace.total).toBe(251_000);
  });
});

describe("weekday profile", () => {
  it("is the median per weekday over the 13 weeks ending yesterday, zeros counted", () => {
    const mondays = [973, 980, 987, 994].map((e, i) => o(0, e, [400, 800, 200, 600][i], 600));
    const D2 = makeD({ cust: [cust("א")], orders: mondays });
    const prof = weekdayProfile(D2, buildDaily(D2));
    expect(prof.byDow.map((x) => x.length)).toEqual([3, 4, 4, 4, 4, 4, 4]);
    expect(prof.meds[1]).toBe(500); // 200 400 600 800
    expect(prof.meds[2]).toBe(0);
  });

  it("looks back 91 days and no further", () => {
    // an order 92 days ago sets the start of the data but is outside the 13 weeks
    const old = [o(0, 908, 999_999, 600), o(0, 994, 700, 600)];
    const D2 = makeD({ cust: [cust("א")], orders: old });
    const prof = weekdayProfile(D2, buildDaily(D2));
    expect(prof.byDow[6]).toHaveLength(13); // Saturdays 915 .. 999
    expect(prof.byDow[6].every((v) => v === 0)).toBe(true);
    expect(Math.max(...prof.meds)).toBeLessThan(999_999);
  });

  it("adds each remaining weekday's median to the month so far", () => {
    // 28 Sep is a Monday: Mon, Tue, Wed = 200 + 300 + 400 on top of 1,000
    expect(paceTotal(1_000, 27, 30, 974, D, [100, 200, 300, 400, 500, 0, 0])).toEqual({ rest: 900, total: 1_900 });
    // the last day of the month leaves nothing to add
    expect(paceTotal(1_000, 30, 30, 974, D, [100, 200, 300, 400, 500, 0, 0])).toEqual({ rest: 0, total: 1_000 });
  });
});

describe("daily chart series", () => {
  // one order a day on 990..1000: 10, 0, 0, 20, 30, 0, 0, 40, 50, 0, 60
  const day = [10, 0, 0, 20, 30, 0, 0, 40, 50, 0, 60];
  const orders = day.flatMap((v, i) => (v ? [o(0, 990 + i, v, 600)] : []));
  const D3 = makeD({ cust: [cust("א")], orders });
  const base3 = buildDaily(D3);

  it("shows the last N days", () => {
    const s = dailySeries(D3, base3, 5);
    expect(s.a0).toBe(996);
    expect(s.vals).toEqual([0, 40, 50, 0, 60]);
  });

  it("averages the seven real days up to each day, reaching before the window", () => {
    const s = dailySeries(D3, base3, 5);
    expect(s.ma[0]).toBeCloseTo(60 / 7, 9);
    expect(s.ma[1]).toBeCloseTo(90 / 7, 9);
    expect(s.ma[2]).toBeCloseTo(20, 9);
    expect(s.ma[4]).toBeCloseTo(180 / 7, 9);
  });

  it("averages only the days that exist at the start of the data", () => {
    const s = dailySeries(D3, base3, 11);
    expect(s.ma[0]).toBe(10); // one day
    expect(s.ma[1]).toBe(5); // two days
    expect(s.ma[2]).toBeCloseTo(10 / 3, 9);
    expect(s.ma[6]).toBeCloseTo(60 / 7, 9);
  });

  it("clamps the window to the data", () => {
    expect(dailySeries(D3, base3, 365).vals).toHaveLength(11);
  });

  it("caps the axis at the everyday range when one day dwarfs the rest, and says so", () => {
    const vals30 = Array.from({ length: 30 }, (_, i) => (i === 29 ? 10_000 : 100));
    const ords = vals30.map((v, i) => o(0, 971 + i, v, 600));
    const D4 = makeD({ cust: [cust("א")], orders: ords });
    const s = dailySeries(D4, buildDaily(D4), 30);
    expect(s.p90).toBe(100); // the 28th of 30 sorted days
    expect(s.clipped).toBe(true);
    expect(s.mx).toBeCloseTo(100 * 1.3 * 1.1, 9);
    expect(s.peak).toBeNull(); // a clipped bar carries its own label
  });

  it("scales to the tallest day when nothing is out of line", () => {
    const ords = Array.from({ length: 30 }, (_, i) => o(0, 971 + i, i + 1, 600));
    const D5 = makeD({ cust: [cust("א")], orders: ords });
    const s = dailySeries(D5, buildDaily(D5), 30);
    expect(s.clipped).toBe(false);
    expect(s.mx).toBeCloseTo(33, 9);
  });
});

describe("retro table", () => {
  it("colours a day against its usual: quiet inside 10%, green above, red only far below on a business day", () => {
    expect(retroChip(5, false)).toBe("neu");
    expect(retroChip(-9.9, false)).toBe("neu");
    expect(retroChip(10, false)).toBe("ok");
    expect(retroChip(-10, false)).toBe("warn");
    expect(retroChip(-40, false)).toBe("warn");
    expect(retroChip(-40.1, false)).toBe("crit");
    expect(retroChip(-90, true)).toBe("warn"); // a quiet Saturday is the calendar, not a collapse
  });

  const rows = retroRows(D, daily, 14);

  it("lists the last 14 days newest first, today marked partial and never compared", () => {
    expect(rows).toHaveLength(14);
    expect(rows[0]).toMatchObject({ e: 1000, partial: true, base: null, p: null, rev: 25_000, cnt: 1 });
    expect(rows[13].e).toBe(987);
  });

  it("compares each closed day with its usual", () => {
    const thu = rows.find((r) => r.e === 997)!;
    expect(thu.base).toBe(15_000);
    expect(thu.p).toBeCloseTo((35_000 / 15_000) * 100, 6);
    expect(thu.chip).toBe("ok");
    expect(thu.avg).toBe(25_000); // 50,000 over two orders
  });

  it("has no comparison for a day whose usual is zero", () => {
    const fri = rows.find((r) => r.e === 998)!;
    expect(fri.base).toBe(0);
    expect(fri.p).toBeNull();
    expect(fri.off).toBe(true);
    expect(fri.avg).toBeNull(); // no orders, no average
  });

  it("names the customer that made the day", () => {
    expect(rows.find((r) => r.e === 997)?.top).toEqual(["לקוח א", 30_000]);
    expect(rows.find((r) => r.e === 993)?.top).toEqual(["לקוח א", 40_000]);
    expect(rows.find((r) => r.e === 998)?.top).toBeNull();
  });
});
