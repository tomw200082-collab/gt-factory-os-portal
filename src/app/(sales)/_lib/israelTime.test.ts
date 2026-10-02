import { describe, expect, it } from "vitest";
import { addIsraelDays, israelDate, israelFirstSchedulableDate, israelNineAM, israelNineAMAfter, daysSinceIsrael } from "./israelTime";

describe("Israel next touches", () => {
  it("schedules today only while 09:00 Israel is still ahead", () => {
    expect(israelFirstSchedulableDate(new Date("2026-10-01T05:59:00Z"))).toBe("2026-10-01"); // 08:59
    expect(israelFirstSchedulableDate(new Date("2026-10-01T06:00:00Z"))).toBe("2026-10-02"); // 09:00
  });

  it("keeps 09:00 in Israel through both daylight saving offsets", () => {
    expect(israelNineAM("2026-01-15")).toBe("2026-01-15T07:00:00.000Z");
    expect(israelNineAM("2026-09-30")).toBe("2026-09-30T06:00:00.000Z");
    expect(israelNineAM("2026-10-26")).toBe("2026-10-26T07:00:00.000Z");
  });

  it("chooses the Israel calendar date when a browser is elsewhere", () => {
    expect(israelDate(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10-01");
    expect(israelNineAMAfter(1, new Date("2026-09-30T22:30:00Z"))).toBe("2026-10-02T06:00:00.000Z");
    expect(addIsraelDays("2026-10-30", 3)).toBe("2026-11-02");
  });
});

describe("daysSinceIsrael", () => {
  it("counts Israeli calendar days, not 24-hour blocks", () => {
    // 23:30 UTC on 30 June is 02:30 on 1 July in Israel (IDT, +3)
    expect(daysSinceIsrael("2026-06-30T23:30:00Z", new Date("2026-07-01T06:00:00Z"))).toBe(0);
    expect(daysSinceIsrael("2026-06-30T20:30:00Z", new Date("2026-07-01T06:00:00Z"))).toBe(1);
  });
  it("never goes negative", () => {
    expect(daysSinceIsrael("2026-07-05T08:00:00Z", new Date("2026-07-01T06:00:00Z"))).toBe(0);
  });
});
