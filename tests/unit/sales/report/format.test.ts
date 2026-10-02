import { describe, it, expect } from "vitest";
import { amount, amountUnit, cell, compact, fmtInt, money, monthYear, pctChip, pctTone, shortDate, signedPct } from "@/app/(sales)/_lib/report/format";

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
    // sign and tone come from the rounded figure: a change that prints as 0% is neither up nor down
    expect(signedPct(0)).toBe("0%");
    expect(signedPct(0.3)).toBe("0%");
    expect(signedPct(-0.3)).toBe("0%");
    expect(signedPct(0.5)).toBe("+1%");
    expect(signedPct(-0.5)).toBe("-1%");
  });

  it("turns a percentage into a chip: green at or above zero, red below, nothing without a base", () => {
    expect(pctChip(12.4)).toEqual({ text: "+12%", tone: "up" });
    expect(pctChip(-8.6)).toEqual({ text: "-9%", tone: "dn" });
    expect(pctChip(0)).toEqual({ text: "0%", tone: "mt" });
    expect(pctChip(-0.4)).toEqual({ text: "0%", tone: "mt" });
    expect(pctChip(0.4)).toEqual({ text: "0%", tone: "mt" });
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

  it("says units with the word, shekels with the sign", () => {
    expect(amountUnit(12_345_600, "rev")).toBe("₪123,456");
    expect(amountUnit(1234, "units")).toBe("1,234 יח׳");
  });

  it("names the tone of a percentage from its rounded value", () => {
    expect(pctTone(12.4)).toBe("up");
    expect(pctTone(-8.6)).toBe("dn");
    expect(pctTone(0.49)).toBe("mt");
    expect(pctTone(-0.49)).toBe("mt");
  });

  it("writes a month the way the table headers do", () => {
    expect(monthYear("2026-02")).toBe("פבר׳ 26");
    expect(monthYear("")).toBe("");
  });
});
