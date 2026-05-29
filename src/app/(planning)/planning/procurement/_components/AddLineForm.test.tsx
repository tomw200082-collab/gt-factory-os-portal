// ---------------------------------------------------------------------------
// AddLineForm tests — Tranche 030.
//
// useOrderables is mocked to a fixed item + component so the form is
// deterministic without network. Coverage:
//   A1 — submit blocked until an orderable + a positive qty are present
//   A2 — emits component_id for a component pick
//   A3 — emits item_id for an item pick
//   A4 — picking an orderable auto-defaults the UoM
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrderableRow } from "@/components/purchase-orders/types";

const ORDERABLES: OrderableRow[] = [
  { kind: "component", id: "c_1", label: "קרטון", meta: "c_1", default_uom: "UNIT" },
  { kind: "item", id: "i_1", label: "מוצר מוגמר", meta: "SKU-1", default_uom: "KG" },
];

vi.mock("@/components/purchase-orders/useOrderables", () => ({
  useOrderables: () => ({
    supplierOptions: [],
    orderableOptions: ORDERABLES.map((r) => ({
      value: `${r.kind}:${r.id}`,
      label: r.label,
      meta: r.meta,
      group: r.kind === "item" ? "Finished goods" : "Components",
    })),
    orderableByKey: new Map(ORDERABLES.map((r) => [`${r.kind}:${r.id}`, r])),
    suppliersLoading: false,
    itemsLoading: false,
    componentsLoading: false,
    isLoading: false,
    isError: false,
    retry: vi.fn(),
  }),
}));

import { AddLineForm } from "./AddLineForm";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// SearchableSelect is a combobox; pick by opening and clicking the option label.
async function pickOrderable(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
): Promise<void> {
  await user.click(screen.getByTestId("add-line-orderable"));
  await user.click(await screen.findByText(label));
}

describe("AddLineForm", () => {
  it("A1 does not emit until orderable + positive qty are present", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLineForm onAdd={onAdd} onCancel={vi.fn()} />);

    await user.click(screen.getByTestId("add-line-submit"));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText("יש לבחור פריט או רכיב.")).toBeTruthy();
  });

  it("A2 emits component_id for a component pick", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLineForm onAdd={onAdd} onCancel={vi.fn()} />);

    await pickOrderable(user, "קרטון");
    await user.type(screen.getByTestId("add-line-qty"), "5");
    await user.click(screen.getByTestId("add-line-submit"));

    expect(onAdd).toHaveBeenCalledWith({ component_id: "c_1", final_qty: 5 });
  });

  it("A3 emits item_id for an item pick", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddLineForm onAdd={onAdd} onCancel={vi.fn()} />);

    await pickOrderable(user, "מוצר מוגמר");
    await user.type(screen.getByTestId("add-line-qty"), "2");
    await user.click(screen.getByTestId("add-line-submit"));

    expect(onAdd).toHaveBeenCalledWith({ item_id: "i_1", final_qty: 2 });
  });

  it("A4 auto-defaults the UoM from the picked orderable", async () => {
    const user = userEvent.setup();
    render(<AddLineForm onAdd={vi.fn()} onCancel={vi.fn()} />);

    const uom = screen.getByTestId("add-line-uom") as HTMLSelectElement;
    await pickOrderable(user, "מוצר מוגמר"); // default_uom KG
    expect(uom.value).toBe("KG");
  });
});
