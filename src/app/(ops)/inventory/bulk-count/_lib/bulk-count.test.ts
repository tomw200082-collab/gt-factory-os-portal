import { describe, expect, it } from "vitest";
import { NO_GROUP } from "@/lib/taxonomy/groups";
import {
  EMPTY_FILTERS,
  STALE_DAYS,
  STORAGE_PREFIX,
  anyFilterActive,
  buildSections,
  compareRows,
  isStale,
  parseStored,
  progressOf,
  rowMatches,
  storageKey,
  toBulkRow,
  type BulkCountRow,
  type BulkFilters,
  type BulkStockRow,
  type CountedMap,
} from "./bulk-count";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-12T12:00:00Z").getTime();

function stockRow(overrides: Partial<BulkStockRow> = {}): BulkStockRow {
  return {
    item_type: "RM",
    item_id: "RM-001",
    display_name: "תה ירוק",
    base_uom: "KG",
    last_event_at: null,
    ...overrides,
  };
}

function bulkRow(overrides: Partial<BulkStockRow> = {}): BulkCountRow {
  const r = toBulkRow(stockRow(overrides));
  if (!r) throw new Error("expected a bulk row");
  return r;
}

describe("toBulkRow", () => {
  it("classifies FG rows against product groups (pg vocab)", () => {
    const r = toBulkRow(
      stockRow({ item_type: "FG", item_id: "FG-9", product_group_key: "teas" }),
    );
    expect(r).toMatchObject({
      key: "FG:FG-9",
      vocab: "pg",
      group_key: "teas",
      section_key: "pg:teas",
    });
  });

  it("classifies RM/PKG rows against material groups (mg vocab)", () => {
    const r = toBulkRow(
      stockRow({ item_type: "PKG", item_id: "PKG-2", material_group_key: "packaging" }),
    );
    expect(r).toMatchObject({ vocab: "mg", section_key: "mg:packaging" });
  });

  it("buckets null group keys under NO_GROUP, never another category", () => {
    const r = toBulkRow(stockRow({ material_group_key: null }));
    expect(r?.group_key).toBe(NO_GROUP);
    expect(r?.section_key).toBe(`mg:${NO_GROUP}`);
  });

  it("rejects unknown item types (physical-count API accepts FG/RM/PKG only)", () => {
    expect(toBulkRow(stockRow({ item_type: "WIP" }))).toBeNull();
  });

  it("falls back to UNIT for unknown UOMs and item_id for missing names", () => {
    const r = toBulkRow(stockRow({ base_uom: "DOZEN", display_name: null }));
    expect(r?.default_uom).toBe("UNIT");
    expect(r?.name).toBe("RM-001");
  });
});

describe("rowMatches", () => {
  const counted: CountedMap = {
    "RM:RM-counted": {
      qty: 4,
      unit: "KG",
      status: "posted",
      at: "2026-06-12T08:00:00Z",
    },
  };

  it("passes everything with empty filters", () => {
    expect(rowMatches(bulkRow(), EMPTY_FILTERS, {}, NOW)).toBe(true);
  });

  it("filters by item type", () => {
    const f: BulkFilters = { ...EMPTY_FILTERS, type: "FG" };
    expect(rowMatches(bulkRow(), f, {}, NOW)).toBe(false);
    expect(rowMatches(bulkRow({ item_type: "FG" }), f, {}, NOW)).toBe(true);
  });

  it("hides rows of the OTHER vocabulary while any group is selected", () => {
    const f: BulkFilters = { ...EMPTY_FILTERS, materialGroups: ["tea_leaves"] };
    const tea = bulkRow({ material_group_key: "tea_leaves" });
    const syrup = bulkRow({ item_id: "RM-2", material_group_key: "syrups" });
    const fg = bulkRow({ item_type: "FG", item_id: "FG-1", product_group_key: "teas" });
    expect(rowMatches(tea, f, {}, NOW)).toBe(true);
    expect(rowMatches(syrup, f, {}, NOW)).toBe(false);
    expect(rowMatches(fg, f, {}, NOW)).toBe(false);
  });

  it("supports multi-select across both vocabularies", () => {
    const f: BulkFilters = {
      ...EMPTY_FILTERS,
      materialGroups: ["tea_leaves"],
      productGroups: ["teas"],
    };
    expect(rowMatches(bulkRow({ material_group_key: "tea_leaves" }), f, {}, NOW)).toBe(true);
    expect(
      rowMatches(
        bulkRow({ item_type: "FG", item_id: "FG-1", product_group_key: "teas" }),
        f,
        {},
        NOW,
      ),
    ).toBe(true);
  });

  it("matches the NO_GROUP sentinel chip", () => {
    const f: BulkFilters = { ...EMPTY_FILTERS, materialGroups: [NO_GROUP] };
    expect(rowMatches(bulkRow({ material_group_key: null }), f, {}, NOW)).toBe(true);
    expect(rowMatches(bulkRow({ material_group_key: "syrups" }), f, {}, NOW)).toBe(false);
  });

  it("usedBy keeps only components consumed by that product line", () => {
    const f: BulkFilters = { ...EMPTY_FILTERS, usedBy: "cocktails" };
    expect(
      rowMatches(bulkRow({ used_by_product_groups: ["cocktails", "teas"] }), f, {}, NOW),
    ).toBe(true);
    expect(rowMatches(bulkRow({ used_by_product_groups: ["teas"] }), f, {}, NOW)).toBe(false);
    // FG rows never match a usedBy filter
    expect(
      rowMatches(bulkRow({ item_type: "FG", product_group_key: "cocktails" }), f, {}, NOW),
    ).toBe(false);
  });

  it("a rejected count stays in 'remaining', out of 'counted', and not done", () => {
    const rejectedMap: CountedMap = {
      "RM:RM-rej": { qty: 9, unit: "KG", status: "rejected", at: "2026-06-12T09:00:00Z" },
    };
    const row = bulkRow({ item_id: "RM-rej" });
    expect(rowMatches(row, { ...EMPTY_FILTERS, view: "remaining" }, rejectedMap, NOW)).toBe(true);
    expect(rowMatches(row, { ...EMPTY_FILTERS, view: "counted" }, rejectedMap, NOW)).toBe(false);
    expect(progressOf([row], rejectedMap)).toEqual({ done: 0, total: 1 });
  });

  it("view=remaining hides counted rows; view=counted shows only them", () => {
    const row = bulkRow({ item_id: "RM-counted" });
    expect(rowMatches(row, { ...EMPTY_FILTERS, view: "remaining" }, counted, NOW)).toBe(false);
    expect(rowMatches(row, { ...EMPTY_FILTERS, view: "counted" }, counted, NOW)).toBe(true);
    const other = bulkRow({ item_id: "RM-other" });
    expect(rowMatches(other, { ...EMPTY_FILTERS, view: "remaining" }, counted, NOW)).toBe(true);
    expect(rowMatches(other, { ...EMPTY_FILTERS, view: "counted" }, counted, NOW)).toBe(false);
  });

  it("neverCountedOnly and staleOnly quick filters", () => {
    const never = bulkRow({ never_counted: true });
    const stale = bulkRow({
      item_id: "RM-stale",
      last_event_at: new Date(NOW - (STALE_DAYS + 1) * DAY_MS).toISOString(),
    });
    const fresh = bulkRow({
      item_id: "RM-fresh",
      last_event_at: new Date(NOW - DAY_MS).toISOString(),
    });
    expect(rowMatches(never, { ...EMPTY_FILTERS, neverCountedOnly: true }, {}, NOW)).toBe(true);
    expect(rowMatches(fresh, { ...EMPTY_FILTERS, neverCountedOnly: true }, {}, NOW)).toBe(false);
    expect(rowMatches(stale, { ...EMPTY_FILTERS, staleOnly: true }, {}, NOW)).toBe(true);
    expect(rowMatches(fresh, { ...EMPTY_FILTERS, staleOnly: true }, {}, NOW)).toBe(false);
  });

  it("search matches name and code, case-insensitive", () => {
    const row = bulkRow({ display_name: "תה ירוק", item_id: "RM-GREEN-01" });
    expect(rowMatches(row, { ...EMPTY_FILTERS, search: "ירוק" }, {}, NOW)).toBe(true);
    expect(rowMatches(row, { ...EMPTY_FILTERS, search: "rm-green" }, {}, NOW)).toBe(true);
    expect(rowMatches(row, { ...EMPTY_FILTERS, search: "מאצ׳ה" }, {}, NOW)).toBe(false);
  });
});

describe("compareRows / buildSections", () => {
  it("'oldest' floats never-moved rows first, then oldest movement", () => {
    const never = bulkRow({ item_id: "A", last_event_at: null });
    const old = bulkRow({
      item_id: "B",
      last_event_at: new Date(NOW - 30 * DAY_MS).toISOString(),
    });
    const recent = bulkRow({
      item_id: "C",
      last_event_at: new Date(NOW - DAY_MS).toISOString(),
    });
    const sorted = [recent, never, old].sort((a, b) => compareRows(a, b, "oldest"));
    expect(sorted.map((r) => r.item_id)).toEqual(["A", "B", "C"]);
  });

  it("sections follow the caller-provided walk order and sort rows within", () => {
    const tea1 = bulkRow({ item_id: "RM-2", display_name: "בבב", material_group_key: "tea" });
    const tea2 = bulkRow({ item_id: "RM-1", display_name: "אאא", material_group_key: "tea" });
    const syrup = bulkRow({ item_id: "RM-3", material_group_key: "syrups" });
    const fg = bulkRow({ item_type: "FG", item_id: "FG-1", product_group_key: "tea" });
    const order: Record<string, number> = {
      "pg:tea": 0,
      "mg:syrups": 1,
      "mg:tea": 2,
    };
    const sections = buildSections(
      [tea1, syrup, fg, tea2],
      (k) => order[k] ?? 999,
      "name",
    );
    expect(sections.map((s) => s.key)).toEqual(["pg:tea", "mg:syrups", "mg:tea"]);
    // identical group keys in different vocabularies never merge
    expect(sections[0].rows).toHaveLength(1);
    // rows inside a section are sorted
    expect(sections[2].rows.map((r) => r.item_id)).toEqual(["RM-1", "RM-2"]);
  });
});

describe("progress + persistence", () => {
  it("progressOf counts only rows present in the counted map", () => {
    const a = bulkRow({ item_id: "A" });
    const b = bulkRow({ item_id: "B" });
    const counted: CountedMap = {
      "RM:A": { qty: 1, unit: "KG", status: "posted", at: "2026-06-12T08:00:00Z" },
    };
    expect(progressOf([a, b], counted)).toEqual({ done: 1, total: 2 });
  });

  it("storageKey is per calendar day", () => {
    expect(storageKey(new Date(2026, 5, 12))).toBe(`${STORAGE_PREFIX}2026-06-12`);
  });

  it("parseStored round-trips valid entries and drops malformed ones", () => {
    const good = {
      "RM:A": { qty: 2, unit: "KG", status: "posted", at: "t", delta: "+1.00" },
      "RM:B": { qty: 1, unit: "L", status: "pending", at: "t", submission_id: "s1" },
      "RM:C": { qty: 4, unit: "L", status: "rejected", at: "t", submission_id: "s2" },
      "RM:bad-status": { qty: 1, unit: "L", status: "nope", at: "t" },
      "RM:bad-qty": { qty: "3", unit: "L", status: "posted", at: "t" },
    };
    const parsed = parseStored(JSON.stringify(good));
    expect(Object.keys(parsed).sort()).toEqual(["RM:A", "RM:B", "RM:C"]);
    expect(parsed["RM:A"].delta).toBe("+1.00");
    expect(parsed["RM:B"].submission_id).toBe("s1");
  });

  it("parseStored tolerates garbage", () => {
    expect(parseStored(null)).toEqual({});
    expect(parseStored("not json")).toEqual({});
    expect(parseStored('"a string"')).toEqual({});
    expect(parseStored("[1,2]")).toEqual({});
  });
});

describe("misc", () => {
  it("isStale boundary", () => {
    expect(isStale(new Date(NOW - STALE_DAYS * DAY_MS).toISOString(), NOW)).toBe(true);
    expect(isStale(new Date(NOW - (STALE_DAYS - 1) * DAY_MS).toISOString(), NOW)).toBe(false);
    expect(isStale(null, NOW)).toBe(false);
  });

  it("anyFilterActive", () => {
    expect(anyFilterActive(EMPTY_FILTERS)).toBe(false);
    expect(anyFilterActive({ ...EMPTY_FILTERS, staleOnly: true })).toBe(true);
    expect(anyFilterActive({ ...EMPTY_FILTERS, search: "  " })).toBe(false);
  });
});
