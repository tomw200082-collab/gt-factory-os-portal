import { describe, expect, it } from "vitest";

import type { PickListLine } from "../../../_lib/types";
import {
  allResolved,
  buildConfirmBody,
  buildPicks,
  confirmResolution,
  editResolution,
  groupPickLines,
  isResolved,
  lineKey,
  notCollectedResolution,
  requiredNum,
  resolvedCount,
  rowSignals,
  unresolvedCount,
  type ResolutionMap,
} from "./pick";

function line(overrides: Partial<PickListLine> = {}): PickListLine {
  return {
    component_id: "C1",
    component_name: "Sugar",
    source: "base",
    item_type: "RM",
    required_qty: "14",
    uom: "kg",
    on_hand: "50",
    ...overrides,
  };
}

describe("grouping — liquids above packaging", () => {
  it("splits RM into liquids and PKG into packaging, preserving order", () => {
    const lines = [
      line({ component_id: "L1", item_type: "RM" }),
      line({ component_id: "P1", item_type: "PKG", source: "pack" }),
      line({ component_id: "L2", item_type: "RM" }),
    ];
    const g = groupPickLines(lines);
    expect(g.liquids.map((l) => l.component_id)).toEqual(["L1", "L2"]);
    expect(g.packaging.map((l) => l.component_id)).toEqual(["P1"]);
  });

  it("keys a line by source + component (base vs pack never collide)", () => {
    expect(lineKey({ component_id: "C1", source: "base" })).toBe("base:C1");
    expect(lineKey({ component_id: "C1", source: "pack" })).toBe("pack:C1");
  });
});

describe("resolution builders", () => {
  it("confirm → PICKED at the required amount", () => {
    expect(confirmResolution(line({ required_qty: "14" }))).toEqual({
      state: "PICKED",
      picked_qty: 14,
    });
  });

  it("edit below required → EDITED", () => {
    expect(editResolution(line({ required_qty: "14" }), 10)).toEqual({
      state: "EDITED",
      picked_qty: 10,
    });
  });

  it("edit to exactly required collapses back to PICKED", () => {
    expect(editResolution(line({ required_qty: "14" }), 14)).toEqual({
      state: "PICKED",
      picked_qty: 14,
    });
  });

  it("edit to zero (or less) → NOT_COLLECTED", () => {
    expect(editResolution(line(), 0)).toEqual({ state: "NOT_COLLECTED", picked_qty: 0 });
    expect(editResolution(line(), -3)).toEqual({ state: "NOT_COLLECTED", picked_qty: 0 });
  });

  it("explicit not-collected → zero", () => {
    expect(notCollectedResolution()).toEqual({ state: "NOT_COLLECTED", picked_qty: 0 });
  });

  it("requiredNum tolerates a bad numeric string", () => {
    expect(requiredNum(line({ required_qty: "" }))).toBe(0);
  });
});

describe("rowSignals — physical truth flags (never block)", () => {
  it("flags shortage when the edited amount is below the requirement", () => {
    const l = line({ required_qty: "14", on_hand: "50" });
    expect(rowSignals(l, editResolution(l, 10))).toEqual({ shortage: true, excess: false });
  });

  it("flags excess when the amount is above on-hand", () => {
    const l = line({ required_qty: "14", on_hand: "12" });
    expect(rowSignals(l, editResolution(l, 20))).toEqual({ shortage: false, excess: true });
  });

  it("can flag both when on-hand is below the requirement", () => {
    const l = line({ required_qty: "14", on_hand: "8" });
    // took 10: less than needed (14) AND more than stock (8)
    expect(rowSignals(l, editResolution(l, 10))).toEqual({ shortage: true, excess: true });
  });

  it("a plain confirm is clean; an unresolved row has no flags", () => {
    const l = line();
    expect(rowSignals(l, confirmResolution(l))).toEqual({ shortage: false, excess: false });
    expect(rowSignals(l, undefined)).toEqual({ shortage: false, excess: false });
  });
});

describe("resolve-gate math", () => {
  const lines = [
    line({ component_id: "C1", source: "base" }),
    line({ component_id: "C2", source: "base" }),
    line({ component_id: "P1", source: "pack", item_type: "PKG" }),
  ];

  it("counts resolved / unresolved and gates only when all are resolved", () => {
    const resolutions: ResolutionMap = {};
    expect(allResolved(lines, resolutions)).toBe(false);
    expect(resolvedCount(lines, resolutions)).toBe(0);
    expect(unresolvedCount(lines, resolutions)).toBe(3);

    resolutions[lineKey(lines[0])] = confirmResolution(lines[0]);
    resolutions[lineKey(lines[1])] = editResolution(lines[1], 5);
    expect(isResolved(lines[0], resolutions)).toBe(true);
    expect(isResolved(lines[2], resolutions)).toBe(false);
    expect(allResolved(lines, resolutions)).toBe(false);

    resolutions[lineKey(lines[2])] = notCollectedResolution();
    expect(allResolved(lines, resolutions)).toBe(true);
    expect(unresolvedCount(lines, resolutions)).toBe(0);
  });

  it("an empty line set never gates open", () => {
    expect(allResolved([], {})).toBe(false);
  });
});

describe("confirm-payload builder", () => {
  const lines = [
    line({ component_id: "C1", source: "base", required_qty: "14" }),
    line({ component_id: "P1", source: "pack", item_type: "PKG", required_qty: "1000", on_hand: "1200" }),
  ];
  const resolutions: ResolutionMap = {
    "base:C1": editResolution(lines[0], 10),
    "pack:P1": confirmResolution(lines[1]),
  };

  it("buildPicks maps each resolved line to a pick", () => {
    expect(buildPicks(lines, resolutions)).toEqual([
      { component_id: "C1", source: "base", picked_qty: 10, state: "EDITED" },
      { component_id: "P1", source: "pack", picked_qty: 1000, state: "PICKED" },
    ]);
  });

  it("buildPicks throws on an unresolved line (state-machine guard)", () => {
    expect(() => buildPicks(lines, { "base:C1": confirmResolution(lines[0]) })).toThrow(
      /Unresolved/,
    );
  });

  it("buildConfirmBody threads the injected key + timestamp + pinned versions", () => {
    const body = buildConfirmBody({
      lines,
      resolutions,
      packBomVersionId: "PBV1",
      baseBomVersionId: "BBV1",
      idempotencyKey: "idem-123",
      eventAt: "2026-07-24T08:00:00.000Z",
    });
    expect(body.idempotency_key).toBe("idem-123");
    expect(body.event_at).toBe("2026-07-24T08:00:00.000Z");
    expect(body.pack_bom_version_id).toBe("PBV1");
    expect(body.base_bom_version_id).toBe("BBV1");
    expect(body.picks).toHaveLength(2);
  });
});
