import { describe, expect, it } from "vitest";
import { fmtNumStr, formatQty, formatPercent, formatPrice } from "./format-quantity";

describe("fmtNumStr", () => {
  it("strips trailing zeros from 8-dp NUMERIC strings", () => {
    expect(fmtNumStr("440.00000000")).toBe("440");
    expect(fmtNumStr("1.50000000")).toBe("1.5");
    expect(fmtNumStr("0.12340000")).toBe("0.1234");
  });

  it("rounds to at most 4 decimal places (the portal's hard rule)", () => {
    // Real-world trigger: a computed qty_8dp value with genuine precision
    // beyond 4dp used to render at full length and overflow fixed-width
    // displays (PickRow's number button) — the row's overflow-hidden then
    // clipped it, which read to the operator as a cut-off number.
    expect(fmtNumStr("12.34567891")).toBe("12.3457");
    expect(fmtNumStr("0.999999")).toBe("1"); // rounds up, then strips the now-trailing zeros
    expect(fmtNumStr("100.00005")).toBe("100.0001"); // rounds up at the 4th place (half-up)
  });

  it("passes through integers unchanged", () => {
    expect(fmtNumStr("144")).toBe("144");
    expect(fmtNumStr(144)).toBe("144");
  });

  it("is safe for null/undefined/empty", () => {
    expect(fmtNumStr(null)).toBe("");
    expect(fmtNumStr(undefined)).toBe("");
    expect(fmtNumStr("")).toBe("");
  });

  it("returns non-numeric input unchanged rather than fabricating a value", () => {
    expect(fmtNumStr("n/a")).toBe("n/a");
  });
});

describe("formatQty", () => {
  it("formats unit-like UOMs as integers or 3dp", () => {
    expect(formatQty(5, "UNIT")).toBe("5");
    expect(formatQty(5.5, "PCS")).toBe("5.5");
  });

  it("formats weight/volume UOMs at 3dp", () => {
    expect(formatQty(1.2345, "KG")).toBe("1.234");
  });
});

describe("formatPrice / formatPercent", () => {
  it("formats a shekel price to 2dp", () => {
    expect(formatPrice(12.3)).toBe("₪12.30");
  });

  it("formats a percent to 1dp", () => {
    expect(formatPercent(12.34)).toBe("12.3%");
  });
});
