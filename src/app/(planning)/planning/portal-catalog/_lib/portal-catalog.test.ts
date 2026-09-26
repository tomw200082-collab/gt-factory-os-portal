import { describe, expect, it } from "vitest";
import {
  RESTOCK_TEXT,
  bodyOf,
  failureMessage,
  formatDay,
  groupRows,
  productName,
  restockWaLink,
  sibling,
  unavailableFor,
  type CatalogRow,
} from "./portal-catalog";

const row = (over: Partial<CatalogRow>): CatalogRow => ({
  key: "detox:1l",
  sku: "GT-LUI-LOW-1L",
  category: "tea",
  title: "DETOX",
  variant_title: "1000ml",
  on_hand: 67,
  available: true,
  headline: null,
  upcoming: false,
  back_on: null,
  back_on_passed: false,
  return_note: null,
  alternative_sku: null,
  note: null,
  changed_by: null,
  changed_at: null,
  unavailable_since: null,
  waiting: 0,
  history: [],
  ...over,
});

const ROWS = [
  row({}),
  row({ key: "detox:05", sku: "GT-LUI-LOW-0.5L", variant_title: "500ml" }),
  row({ key: "matcha:500", sku: "GT-SHI-CER-500", category: "matcha", title: "MATCHA", variant_title: null }),
  row({ key: "bowl:1", sku: "AP-BWL-MAT", category: "acc", title: "קערת מאצ׳ה", variant_title: null, available: true, waiting: 2 }),
];

describe("portal catalogue helpers", () => {
  it("names a product the way Shopify does, or by SKU when Shopify did not answer", () => {
    expect(productName(ROWS[0])).toBe("DETOX 1000ml");
    expect(productName(ROWS[2])).toBe("MATCHA");
    expect(productName(row({ title: null, variant_title: null }))).toBe("GT-LUI-LOW-1L");
  });

  it("groups as the customer page does; a product back with customers waiting goes first, out of its group", () => {
    const { back, groups } = groupRows(ROWS);
    expect(back.map((r) => r.sku)).toEqual(["AP-BWL-MAT"]);
    expect(groups.map((g) => [g.category, g.rows.map((r) => r.sku)])).toEqual([
      ["tea", ["GT-LUI-LOW-1L", "GT-LUI-LOW-0.5L"]],
      ["matcha", ["GT-SHI-CER-500"]],
    ]);
    // a product still unavailable keeps its place even with customers waiting
    expect(groupRows([row({ available: false, waiting: 3 })]).back).toEqual([]);
  });

  it("finds a tea's other size, and nothing for anything else", () => {
    expect(sibling(ROWS[0], ROWS)?.sku).toBe("GT-LUI-LOW-0.5L");
    expect(sibling(ROWS[1], ROWS)?.sku).toBe("GT-LUI-LOW-1L");
    expect(sibling(ROWS[2], ROWS)).toBeUndefined();
  });

  it("counts calendar days, not hours", () => {
    const now = new Date(2026, 8, 26, 8, 0);
    expect(unavailableFor(new Date(2026, 8, 26, 7, 0).toISOString(), now)).toBe("Not available since today");
    expect(unavailableFor(new Date(2026, 8, 25, 23, 0).toISOString(), now)).toBe("Not available for 1 day");
    expect(unavailableFor(new Date(2026, 8, 20, 12, 0).toISOString(), now)).toBe("Not available for 6 days");
  });

  it("shows the typed day, never shifted", () => {
    expect(formatDay("2026-10-02")).toBe("2 Oct 2026");
    expect(formatDay("oops")).toBe("oops");
  });

  it("builds the WhatsApp link with the approved text, the product named, to the phone's digits", () => {
    const url = restockWaLink("+972-50-000-0001", "DETOX 1000ml")!;
    expect(url.startsWith("https://wa.me/972500000001?text=")).toBe(true);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe("היי 🙂 DETOX 1000ml חזר למלאי ואפשר להזמין שוב בפורטל.");
    expect(RESTOCK_TEXT).toContain("{product}");
    // no digits, no link: never WhatsApp's contact picker
    expect(restockWaLink("", "DETOX 1000ml")).toBeNull();
  });

  it("a change is always the whole row, nothing more", () => {
    expect(bodyOf(row({ available: false, headline: "בקרוב", upcoming: true, back_on: "2026-10-02", return_note: "בייצור, חוזר בקרוב", note: "x" }))).toEqual({
      available: false,
      headline: "בקרוב",
      upcoming: true,
      back_on: "2026-10-02",
      return_note: "בייצור, חוזר בקרוב",
      alternative_sku: null,
      note: "x",
    });
  });

  it("explains each refusal in words a planner acts on, never a status code or the API's field names", () => {
    expect(failureMessage({ status: 0 })).toMatch(/Could not reach the server/);
    expect(failureMessage({ status: 403 })).toBe("Only a planner or an admin can change the portal catalogue.");
    expect(failureMessage({ status: 404 })).toMatch(/no longer there/);
    expect(failureMessage({ status: 422 })).toBe("The change was not accepted. Refresh the page and try again.");
    expect(failureMessage({ status: 502 })).toBe("Could not save. Try again. If the problem continues, contact the system administrator.");
  });
});
