import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SwitchSupplierControl } from "./SwitchSupplierControl";
import type { SupplierCandidate } from "./CandidateSupplierList";

afterEach(cleanup);

function cand(over: Partial<SupplierCandidate>): SupplierCandidate {
  return {
    supplier_id: "SUP-X",
    supplier_name: "ספק",
    phone: null,
    is_primary: false,
    is_current: false,
    unit_cost: 10,
    lead_time_days: null,
    moq: null,
    ...over,
  };
}

const CURRENT = cand({
  supplier_id: "SUP-A",
  supplier_name: "ספק א׳",
  is_primary: true,
  is_current: true,
  unit_cost: 20,
});
const NEXT = cand({
  supplier_id: "SUP-B",
  supplier_name: "ספק ב׳",
  unit_cost: 15,
});

describe("SwitchSupplierControl", () => {
  it("shows the 'return to planner' state and no trigger when there is no alternative", () => {
    render(<SwitchSupplierControl candidates={[CURRENT]} onSwitch={vi.fn()} />);
    expect(screen.getByText(/אין ספק חלופי/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /החלף ספק/ })).toBeNull();
  });

  it("opens the chooser and confirms with the preselected next candidate, no reason", async () => {
    const onSwitch = vi.fn();
    render(
      <SwitchSupplierControl candidates={[CURRENT, NEXT]} onSwitch={onSwitch} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /החלף ספק/ }));
    // Candidate list shows both suppliers.
    expect(screen.getByText("ספק ב׳")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /העבר לספק/ }));
    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(onSwitch).toHaveBeenCalledWith({
      target_supplier_id: "SUP-B",
      reason: undefined,
    });
  });

  it("passes a typed reason through when provided", async () => {
    const onSwitch = vi.fn();
    render(
      <SwitchSupplierControl candidates={[CURRENT, NEXT]} onSwitch={onSwitch} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /החלף ספק/ }));
    await userEvent.click(screen.getByRole("button", { name: "אין במלאי" }));
    await userEvent.click(screen.getByRole("button", { name: /העבר לספק/ }));
    expect(onSwitch).toHaveBeenCalledWith({
      target_supplier_id: "SUP-B",
      reason: "אין במלאי",
    });
  });

  it("surfaces an error message inside the open panel", async () => {
    render(
      <SwitchSupplierControl
        candidates={[CURRENT, NEXT]}
        onSwitch={vi.fn()}
        error="אירעה שגיאה"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /החלף ספק/ }));
    expect(screen.getByRole("alert").textContent).toContain("אירעה שגיאה");
  });
});
