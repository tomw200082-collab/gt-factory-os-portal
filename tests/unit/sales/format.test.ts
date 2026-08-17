import { describe, it, expect } from "vitest";
import {
  fmtCount,
  fmtDate,
  fmtMoney,
  fmtPhone,
  fmtRelative,
  phoneSearchKey,
  toDateInputValue,
} from "@/app/(sales)/_lib/format";

describe("sales formatting", () => {
  it("renders an Israeli mobile the way it is dialled", () => {
    expect(fmtPhone("+972521234567")).toBe("052-1234567");
    expect(fmtPhone("+97221234567")).toBe("02-1234567");
  });

  it("shows an unparseable number rather than hiding it", () => {
    expect(fmtPhone("+15551234567")).toBe("+15551234567");
    expect(fmtPhone(null)).toBe("—");
  });

  it("matches a typed phone against the stored E.164 form", () => {
    const stored = phoneSearchKey("+972521234567");
    expect(phoneSearchKey("052-1234567")).toBe(stored);
    expect(phoneSearchKey("0521234567")).toBe(stored);
    expect(phoneSearchKey("972-52-123-4567")).toBe(stored);
    expect(phoneSearchKey("")).toBe("");
  });

  it("reads relative time in Hebrew, past and future", () => {
    const now = new Date("2026-08-17T12:00:00Z");
    expect(fmtRelative("2026-08-17T10:00:00Z", now)).toBe("לפני שעתיים");
    expect(fmtRelative("2026-08-16T12:00:00Z", now)).toBe("אתמול");
    expect(fmtRelative("2026-08-18T12:00:00Z", now)).toBe("מחר");
    expect(fmtRelative("2026-08-14T12:00:00Z", now)).toBe("לפני 3 ימים");
    expect(fmtRelative("2026-07-18T12:00:00Z", now)).toBe("לפני חודש");
  });

  it("degrades gracefully on missing or broken input", () => {
    expect(fmtRelative(null)).toBe("—");
    expect(fmtRelative("not-a-date")).toBe("—");
    expect(fmtDate(undefined)).toBe("—");
    expect(fmtMoney(null)).toBe("—");
    expect(fmtCount("")).toBe("—");
  });

  it("formats shekels without decimals, from the snapshot's strings", () => {
    // Snapshot values arrive as strings; that is the shape the tracker wrote.
    expect(fmtMoney("2152")).toContain("2,152");
    expect(fmtMoney(2152)).toContain("2,152");
    expect(fmtMoney("2152")).toMatch(/₪/);
  });

  it("produces a date-input value in the local calendar day", () => {
    expect(toDateInputValue(new Date(2026, 7, 5))).toBe("2026-08-05");
  });
});
