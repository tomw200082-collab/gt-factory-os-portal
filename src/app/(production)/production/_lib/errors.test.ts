import { describe, expect, it } from "vitest";

import { pickingDict } from "./copy";
import { conflictCopyKey, isStaleCode } from "./errors";

// Every conflict code the backend declares in
// api/src/production-runs/schemas.ts (ProductionRunConflictReason). Kept here
// verbatim so a code added upstream shows up as a failing assertion rather
// than as a raw `detail` string on the operator's screen.
const BACKEND_CODES = [
  "RUN_NOT_FOUND",
  "RUN_NOT_PICKABLE",
  "RUN_ALREADY_REPORTED",
  "RUN_CANCELLED",
  "RUN_NOT_REPORTABLE",
  "ITEM_NOT_FOUND",
  "ITEM_INACTIVE",
  "WRONG_SUPPLY_METHOD",
  "NO_BOM_HEAD",
  "NO_ACTIVE_BOM_VERSION",
  "NO_ACTIVE_BASE_BOM_VERSION",
  "NO_BOM_LINES",
  "NO_BASE_BOM_LINES",
  "UOM_MISMATCH",
  "COMPONENT_NOT_FOUND",
  "IDEMPOTENCY_KEY_REUSED",
  "MULTIPLE_BASE_BOM_LINES",
  "BASE_BOM_LINE_QTY_NULL",
  "BASE_BOM_LINE_UOM_MISMATCH",
  "BASE_BOM_LINKAGE_INCONSISTENT",
] as const;

const STALE_CODES = ["STALE_BOM_VERSION", "STALE_BASE_BOM_VERSION"] as const;

describe("conflictCopyKey", () => {
  it("resolves every non-stale backend code to a real dict key", () => {
    for (const code of BACKEND_CODES) {
      const key = conflictCopyKey(code);
      expect(pickingDict[key], `${code} → ${key}`).toBeDefined();
    }
  });

  it("never leaves a non-stale backend code on the generic fallback", () => {
    // The point of the map is that the operator gets a sentence naming a next
    // step. A code silently falling through to `error_generic` is the bug.
    for (const code of BACKEND_CODES) {
      expect(conflictCopyKey(code), code).not.toBe("error_generic");
    }
  });

  it("falls back to the generic message for an unknown code", () => {
    expect(conflictCopyKey("SOMETHING_ADDED_LATER")).toBe("error_generic");
  });

  it("falls back to the generic message when the body carried no code", () => {
    expect(conflictCopyKey(undefined)).toBe("error_generic");
    expect(conflictCopyKey(null)).toBe("error_generic");
    expect(conflictCopyKey("")).toBe("error_generic");
  });

  it("routes the nine broken-recipe codes to one operator message", () => {
    const recipeCodes = BACKEND_CODES.filter((c) =>
      c.includes("BOM") && !c.startsWith("STALE"),
    );
    expect(recipeCodes.length).toBeGreaterThan(1);
    for (const code of recipeCodes) {
      expect(conflictCopyKey(code), code).toBe("err_recipe_missing");
    }
  });

  it("never resolves to a message containing an identifier or enum name", () => {
    for (const code of [...BACKEND_CODES, "WHATEVER"]) {
      const text = pickingDict[conflictCopyKey(code)].en;
      expect(text, code).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}/i); // uuid
      expect(text, code).not.toMatch(/[A-Z]{2,}_[A-Z]{2,}/); // SCREAMING_CASE
    }
  });
});

describe("isStaleCode", () => {
  it("catches both stale-recipe codes", () => {
    for (const code of STALE_CODES) expect(isStaleCode(code), code).toBe(true);
  });

  it("does not catch ordinary conflicts", () => {
    for (const code of BACKEND_CODES) expect(isStaleCode(code), code).toBe(false);
  });

  it("is safe on a missing code", () => {
    expect(isStaleCode(undefined)).toBe(false);
    expect(isStaleCode(null)).toBe(false);
    expect(isStaleCode("")).toBe(false);
  });
});
