// ---------------------------------------------------------------------------
// Unit tests — Groups v1 pure taxonomy helpers (Tranche 044).
//
// Covers: tone mapping (6 curated tokens + unknown fallback), label
// resolution (he → en → key fallback chain), NO_GROUP bucketing of the
// row→group-key classifier extracted from the /inventory page, and the
// key→label resolver used by chips / group-by headers.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import {
  GROUP_COLOR_TOKENS,
  NO_GROUP,
  NO_GROUP_LABEL,
  groupKeyLabel,
  groupLabel,
  groupTone,
  groupsByKey,
  stockRowGroupKey,
  type GroupLike,
} from "@/lib/taxonomy/groups";

function makeGroup(overrides: Partial<GroupLike> = {}): GroupLike {
  return {
    key: "tea_extracts",
    name_en: "Tea Extracts",
    name_he: "תמציות תה",
    color_token: "success",
    ...overrides,
  };
}

describe("groupTone", () => {
  it("maps each of the six curated tokens onto the matching Badge tone", () => {
    expect(groupTone("accent")).toBe("accent");
    expect(groupTone("success")).toBe("success");
    expect(groupTone("warning")).toBe("warning");
    expect(groupTone("info")).toBe("info");
    expect(groupTone("danger")).toBe("danger");
    expect(groupTone("neutral")).toBe("neutral");
  });

  it("covers exactly the curated token list", () => {
    for (const token of GROUP_COLOR_TOKENS) {
      expect(groupTone(token)).toBe(token);
    }
  });

  it("degrades unknown / missing tokens to neutral instead of throwing", () => {
    expect(groupTone("magenta")).toBe("neutral");
    expect(groupTone("")).toBe("neutral");
    expect(groupTone(null)).toBe("neutral");
    expect(groupTone(undefined)).toBe("neutral");
  });
});

describe("groupLabel", () => {
  it("prefers the Hebrew operator label (name_he)", () => {
    expect(groupLabel(makeGroup())).toBe("תמציות תה");
  });

  it("falls back to name_en when name_he is empty/whitespace", () => {
    expect(groupLabel(makeGroup({ name_he: "" }))).toBe("Tea Extracts");
    expect(groupLabel(makeGroup({ name_he: "   " }))).toBe("Tea Extracts");
  });

  it("falls back to the raw key when both names are empty", () => {
    expect(groupLabel(makeGroup({ name_he: "", name_en: "" }))).toBe(
      "tea_extracts",
    );
  });

  it("renders the NO_GROUP label for null/undefined groups", () => {
    expect(groupLabel(null)).toBe(NO_GROUP_LABEL);
    expect(groupLabel(undefined)).toBe(NO_GROUP_LABEL);
    expect(NO_GROUP_LABEL).toBe("ללא קבוצה");
  });
});

describe("stockRowGroupKey (row → group-key classifier)", () => {
  it("keys FG rows on product_group_key", () => {
    expect(
      stockRowGroupKey({
        item_type: "FG",
        product_group_key: "tea_extracts",
        material_group_key: null,
      }),
    ).toBe("tea_extracts");
  });

  it("keys RM and PKG rows on material_group_key", () => {
    expect(
      stockRowGroupKey({
        item_type: "RM",
        product_group_key: null,
        material_group_key: "syrups",
      }),
    ).toBe("syrups");
    expect(
      stockRowGroupKey({
        item_type: "PKG",
        product_group_key: null,
        material_group_key: "bottles",
      }),
    ).toBe("bottles");
  });

  it("buckets null keys honestly under NO_GROUP (never another category)", () => {
    expect(
      stockRowGroupKey({
        item_type: "FG",
        product_group_key: null,
        material_group_key: null,
      }),
    ).toBe(NO_GROUP);
    expect(
      stockRowGroupKey({
        item_type: "RM",
        product_group_key: null,
        material_group_key: null,
      }),
    ).toBe(NO_GROUP);
  });

  it("ignores the wrong-side key (FG never reads material_group_key)", () => {
    expect(
      stockRowGroupKey({
        item_type: "FG",
        product_group_key: null,
        material_group_key: "syrups",
      }),
    ).toBe(NO_GROUP);
    expect(
      stockRowGroupKey({
        item_type: "RM",
        product_group_key: "tea_extracts",
        material_group_key: null,
      }),
    ).toBe(NO_GROUP);
  });

  it("treats missing (old API deploy) fields as the NO_GROUP bucket", () => {
    expect(stockRowGroupKey({ item_type: "FG" })).toBe(NO_GROUP);
    expect(stockRowGroupKey({ item_type: "RM" })).toBe(NO_GROUP);
  });
});

describe("groupKeyLabel + groupsByKey", () => {
  const byKey = groupsByKey([
    makeGroup(),
    makeGroup({ key: "syrups", name_he: "סירופים", name_en: "Syrups" }),
  ]);

  it("resolves a known key to its Hebrew label", () => {
    expect(groupKeyLabel("tea_extracts", byKey)).toBe("תמציות תה");
    expect(groupKeyLabel("syrups", byKey)).toBe("סירופים");
  });

  it("resolves the NO_GROUP sentinel to its label", () => {
    expect(groupKeyLabel(NO_GROUP, byKey)).toBe(NO_GROUP_LABEL);
  });

  it("renders unknown keys verbatim (group created after vocab cached)", () => {
    expect(groupKeyLabel("brand_new_group", byKey)).toBe("brand_new_group");
  });

  it("groupsByKey tolerates undefined input", () => {
    expect(groupsByKey(undefined).size).toBe(0);
  });
});
