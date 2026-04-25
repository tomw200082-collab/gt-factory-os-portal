// BomLineDiff — pure-function classifier + collapsible component.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BomLineDiff, computeBomDiff } from "@/components/bom-edit/BomLineDiff";

afterEach(() => cleanup());

function line(
  bom_line_id: string,
  final_component_id: string,
  final_component_qty: string,
  final_component_name = final_component_id,
) {
  return {
    bom_line_id,
    final_component_id,
    final_component_name,
    final_component_qty,
    component_uom: "KG",
    updated_at: "",
  };
}

describe("computeBomDiff", () => {
  it("classifies added, removed, changed", () => {
    const r = computeBomDiff(
      [line("L1", "C-1", "1.0"), line("L2", "C-2", "2.0"), line("L3", "C-3", "3.0")],
      [line("L1", "C-1", "1.0"), line("Lx", "C-2", "1.0"), line("L4", "C-4", "4.0")],
    );
    expect(r.added.map((l) => l.final_component_id)).toEqual(["C-3"]);
    expect(r.removed.map((l) => l.final_component_id)).toEqual(["C-4"]);
    expect(r.changed.map((c) => c.component_id)).toEqual(["C-2"]);
    expect(r.changed[0].oldQty).toBe("1.0");
    expect(r.changed[0].newQty).toBe("2.0");
  });

  it("returns empty arrays when draft and active are identical", () => {
    const lines = [line("L1", "C-1", "1.0")];
    const r = computeBomDiff(lines, lines);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
    expect(r.changed).toEqual([]);
  });
});

describe("BomLineDiff component", () => {
  it("renders a collapsed summary by default and expands on click", () => {
    render(
      <BomLineDiff
        draftLines={[line("L1", "C-1", "2.0")]}
        activeLines={[line("L1", "C-1", "1.0")]}
        activeVersionLabel="v3"
      />,
    );
    expect(screen.getByText(/Changes from v3/)).toBeTruthy();
    expect(screen.queryByText(/1\.0 → 2\.0/)).toBeNull();
    fireEvent.click(screen.getByText(/Changes from v3/));
    expect(screen.getByText(/1\.0 → 2\.0/)).toBeTruthy();
  });
});
