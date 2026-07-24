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

  it("exposes the end-of-run report copy (tranche 142)", () => {
    expect(t("report_title")).toBe("Finish the run");
    expect(t("report_output")).toBe("How many good units?");
    expect(t("report_scrap")).toBe("How many bad / thrown?");
    expect(t("report_qc_heading")).toBe("Quality check (optional)");
    expect(t("report_submit")).toBe("Finish run");
    expect(t("report_success")).toBe("Run finished. Good job.");
    expect(t("report_cta")).toBe("Report production");
    // The two output questions phrase output/scrap plainly (good/bad units).
    expect(t("report_output").endsWith("?")).toBe(true);
    expect(t("report_scrap").endsWith("?")).toBe(true);
  });
});
