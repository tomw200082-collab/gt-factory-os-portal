import { describe, expect, it } from "vitest";
import { addIsraelDays, israelDate, israelNineAM, israelNineAMAfter } from "./israelTime";

describe("Israel next touches", () => {
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
