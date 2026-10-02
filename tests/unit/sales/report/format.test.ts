import { describe, it, expect } from "vitest";
import { amount, cell, compact, fmtInt, money, pctChip, shortDate, signedPct } from "@/app/(sales)/_lib/report/format";

describe("report number formats", () => {
  it("prints agorot as whole shekels, and a real zero as zero", () => {
    expect(money(12_345_600)).toBe("₪123,456");
    expect(money(149)).toBe("₪1");
    expect(money(0)).toBe("₪0");
    expect(fmtInt(1234.6)).toBe("1,235");
    expect(amount(1_000_000, "rev")).toBe("₪10,000");
    expect(amount(1234, "units")).toBe("1,234");
  });

  it("shortens axis labels the way the Artifact does", () => {
    expect(compact(150_000_000, "rev")).toBe("₪1.5M");
    expect(compact(12_345_600, "rev")).toBe("₪123K");
    expect(compact(45_000, "rev")).toBe("₪450");
    expect(compact(2_500, "units")).toBe("3K");
    expect(compact(40, "units")).toBe("40");
  });

  it("signs a percentage and never prints negative zero", () => {
    expect(signedPct(243.5)).toBe("+244%");
    expect(signedPct(-3.3)).toBe("-3%");
    expect(signedPct(0)).toBe("+0%");
    expect(signedPct(0.3)).toBe("+0%");
    expect(signedPct(-0.3)).toBe("0%");
  });

  it("turns a percentage into a chip: green at or above zero, red below, nothing without a base", () => {
    expect(pctChip(12.4)).toEqual({ text: "+12%", tone: "up" });
    expect(pctChip(-8.6)).toEqual({ text: "-9%", tone: "dn" });
    expect(pctChip(0)).toEqual({ text: "+0%", tone: "up" });
    expect(pctChip(null)).toBeNull();
  });

  it("prints a table cell as the bare number, blank for zero", () => {
    expect(cell(12_345_600, "rev")).toBe("123,456");
    expect(cell(0, "rev")).toBe("");
    expect(cell(1234, "units")).toBe("1,234");
  });

  it("shortens an ISO date", () => {
    expect(shortDate("2026-09-24")).toBe("24/09/26");
    expect(shortDate("")).toBe("");
  });
});
