import { describe, it, expect } from "vitest";
import { NAV_LABELS, REPORT_UI } from "@/app/(sales)/_lib/labels";

const HEBREW = /[֐-׿]/;
// Latin that may stand on a Hebrew screen: the product's own names, and the CSV button's format name.
const ALLOWED_LATIN = ["CSV", "GT"];

function strip(value: string): string {
  return ALLOWED_LATIN.reduce((acc, token) => acc.split(token).join(""), value);
}

function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === "string") yield [path, value];
  else if (typeof value === "function") yield [path, String((value as (...a: number[]) => unknown)(1, 2, 3, 4))];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}.${k}`);
}

describe("sales report labels", () => {
  it("ships no English word", () => {
    for (const [path, text] of strings(REPORT_UI, "REPORT_UI")) {
      expect(/[A-Za-z]{2,}/.test(strip(text)), `${path}: ${text}`).toBe(false);
    }
  });

  it("keeps the destination names in Hebrew", () => {
    expect(NAV_LABELS.report).toMatch(HEBREW);
    expect(NAV_LABELS.reportFull).toBe("דוח מכירות");
  });

  it("labels all five tabs in the Artifact's words", () => {
    expect(Object.values(REPORT_UI.tabs)).toEqual(["יומי", "לקוחות", "מוצרים", "רשתות", "מגמה"]);
  });

  it("never prints the project's internal 'not' mark on a screen", () => {
    for (const [path, text] of strings(REPORT_UI, "REPORT_UI")) expect(text.includes("⊥"), path).toBe(false);
  });

  it("agrees counts with their noun", () => {
    expect(REPORT_UI.orders(1)).toBe("הזמנה אחת");
    expect(REPORT_UI.orders(2)).toBe("2 הזמנות");
    expect(REPORT_UI.orders(1234)).toBe("1,234 הזמנות");
    expect(REPORT_UI.customers(1)).toBe("לקוח אחד");
    expect(REPORT_UI.paceExplain(1)).toContain("יום אחד שנותר");
    expect(REPORT_UI.paceExplain(3)).toContain("3 הימים שנותרו");
    expect(REPORT_UI.paceExplain(0)).toContain("לא נותרו ימים");
  });
});
