import { describe, expect, it } from "vitest";

import { pickingDict, t, type PickingDictKey } from "./copy";

describe("pickingDict — shape + weak-reader discipline", () => {
  it("every key exposes a non-empty English string", () => {
    for (const key of Object.keys(pickingDict) as PickingDictKey[]) {
      expect(pickingDict[key].en.length).toBeGreaterThan(0);
    }
  });

  it("reserves the `ru` slot on every key but leaves it unbuilt (empty)", () => {
    for (const key of Object.keys(pickingDict) as PickingDictKey[]) {
      expect(pickingDict[key]).toHaveProperty("ru");
      expect(pickingDict[key].ru).toBe("");
    }
  });

  it("t() reads the English string for a key", () => {
    expect(t("pick_done_button")).toBe("Done collecting");
    expect(t("today_empty_title")).toBe("No production today.");
  });

  it("keeps action labels short (weak English reader)", () => {
    const actions: PickingDictKey[] = [
      "run_open",
      "pick_row_confirm",
      "pick_save",
      "unplanned_start",
      "pick_done_confirm_yes",
      "active_add",
    ];
    for (const key of actions) {
      const words = t(key).trim().split(/\s+/).length;
      expect(words).toBeLessThanOrEqual(5);
    }
  });

  it("never leaks developer/internal jargon into operator copy", () => {
    const forbidden = /\b(BOM|SKU|UOM|ledger|idempotency|payload|null|undefined)\b/i;
    for (const key of Object.keys(pickingDict) as PickingDictKey[]) {
      expect(pickingDict[key].en).not.toMatch(forbidden);
    }
  });
});
