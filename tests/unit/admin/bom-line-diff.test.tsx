// BomLineDiff — pure-function classifier + collapsible component.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BomLineDiff, computeBomDiff } from "@/components/bom-edit/BomLineDiff";

afterEach(() => cleanup());

describe("computeBomDiff", () => {
  it("classifies added, removed, changed", () => {
    const r = computeBomDiff(
      [
        { bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "" },
        { bom_line_id: "L2", component_id: "C-2", qty: "2.0", updated_at: "" },
        { bom_line_id: "L3", component_id: "C-3", qty: "3.0", updated_at: "" },
      ],
      [
        { bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "" },
        { bom_line_id: "Lx", component_id: "C-2", qty: "1.0", updated_at: "" },
        { bom_line_id: "L4", component_id: "C-4", qty: "4.0", updated_at: "" },
      ],
    );
    expect(r.added.map((l) => l.component_id)).toEqual(["C-3"]);
    expect(r.removed.map((l) => l.component_id)).toEqual(["C-4"]);
    expect(r.changed.map((c) => c.component_id)).toEqual(["C-2"]);
    expect(r.changed[0].oldQty).toBe("1.0");
    expect(r.changed[0].newQty).toBe("2.0");
  });

  it("returns empty arrays when draft and active are identical", () => {
    const lines = [
      { bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "" },
    ];
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
        draftLines={[
          { bom_line_id: "L1", component_id: "C-1", qty: "2.0", updated_at: "" },
        ]}
        activeLines={[
          { bom_line_id: "L1", component_id: "C-1", qty: "1.0", updated_at: "" },
        ]}
        activeVersionLabel="v3"
      />,
    );
    expect(screen.getByText(/Changes from v3/)).toBeTruthy();
    expect(screen.queryByText(/1\.0 → 2\.0/)).toBeNull();
    fireEvent.click(screen.getByText(/Changes from v3/));
    expect(screen.getByText(/1\.0 → 2\.0/)).toBeTruthy();
  });
});
