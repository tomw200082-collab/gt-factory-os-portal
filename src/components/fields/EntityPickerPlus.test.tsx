// ---------------------------------------------------------------------------
// EntityPickerPlus unit tests — AMMC v1 Slice 3.
//
// Coverage:
//   T1 — renders `+ New <entityName>` row when onCreateNew is provided
//   T2 — clicking `+ New <entityName>` fires onCreateNew exactly once
//   T3 — renders readiness dots when readinessPerOption map is supplied
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EntityPickerPlus, type EntityOption } from "./EntityPickerPlus";

const OPTIONS: EntityOption[] = [
  { id: "CMP-SUGAR", label: "Sugar", sublabel: "raw material" },
  { id: "CMP-SALT", label: "Salt", sublabel: "raw material" },
  { id: "CMP-LIME", label: "Lime juice", sublabel: "raw material" },
];

afterEach(() => {
  cleanup();
});

describe("EntityPickerPlus", () => {
  it("T1 renders '+ New <entityName>' row when onCreateNew is provided", async () => {
    render(
      <EntityPickerPlus
        options={OPTIONS}
        onChange={() => {}}
        onCreateNew={() => {}}
        entityName="component"
        placeholder="Pick a component"
      />,
    );
    // Open the dropdown.
    await userEvent.click(screen.getByRole("button", { name: /Pick a component/i }));
    const createRow = screen.getByTestId("entity-picker-plus-create-new");
    expect(createRow).toBeDefined();
    expect(createRow.textContent?.toLowerCase()).toContain("new component");
  });

  it("T2 clicking '+ New <entityName>' fires the onCreateNew callback", async () => {
    const onCreateNew = vi.fn();
    render(
      <EntityPickerPlus
        options={OPTIONS}
        onChange={() => {}}
        onCreateNew={onCreateNew}
        entityName="supplier"
        placeholder="Pick a supplier"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Pick a supplier/i }));
    await userEvent.click(screen.getByTestId("entity-picker-plus-create-new"));
    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });

  it("T3 renders readiness dots when readinessPerOption map is supplied", async () => {
    render(
      <EntityPickerPlus
        options={OPTIONS}
        onChange={() => {}}
        readinessPerOption={{
          "CMP-SUGAR": "green",
          "CMP-SALT": "yellow",
          "CMP-LIME": "red",
        }}
        placeholder="Pick component"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Pick component/i }));
    // Dots rendered with data-testid per option id.
    expect(screen.getByTestId("readiness-dot-CMP-SUGAR")).toBeDefined();
    expect(screen.getByTestId("readiness-dot-CMP-SALT")).toBeDefined();
    expect(screen.getByTestId("readiness-dot-CMP-LIME")).toBeDefined();
  });

  it("T4 does NOT render create-new row when onCreateNew is omitted", async () => {
    render(
      <EntityPickerPlus
        options={OPTIONS}
        onChange={() => {}}
        placeholder="No create"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /No create/i }));
    expect(screen.queryByTestId("entity-picker-plus-create-new")).toBeNull();
  });
});
