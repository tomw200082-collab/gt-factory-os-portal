// ReadinessPanel desktop + mobile-bottom-drawer tests.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ReadinessPanel } from "@/components/admin/recipe-health/ReadinessPanel";
import type { ComponentReadiness } from "@/lib/admin/recipe-readiness.types";

afterEach(() => cleanup());

const NOW = new Date("2026-04-25T12:00:00Z").getTime();

function comp(over: Partial<ComponentReadiness> = {}): ComponentReadiness {
  return {
    component_id: "C-1",
    component_name: "Sugar",
    component_status: "ACTIVE",
    primary_supplier_id: "SUP-1",
    primary_supplier_name: "ACME",
    active_price_value: "2.50",
    active_price_updated_at: "2026-04-20T12:00:00Z",
    ...over,
  };
}

describe("ReadinessPanel", () => {
  it("renders one row per unique component_id from the draft", () => {
    render(
      <ReadinessPanel
        readinessMap={
          new Map([
            ["C-1", comp({ component_id: "C-1" })],
            ["C-2", comp({ component_id: "C-2", component_name: "Bottle" })],
          ])
        }
        nowMs={NOW}
        onFix={vi.fn()}
      />,
    );
    expect(screen.getByText("Sugar")).toBeTruthy();
    expect(screen.getByText("Bottle")).toBeTruthy();
  });

  it("shows 'אין ספק' for missing primary supplier and offers [Fix]", () => {
    const onFix = vi.fn();
    render(
      <ReadinessPanel
        readinessMap={
          new Map([
            [
              "C-1",
              comp({ primary_supplier_id: null, primary_supplier_name: null }),
            ],
          ])
        }
        nowMs={NOW}
        onFix={onFix}
      />,
    );
    expect(screen.getByText(/no primary supplier/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Fix/ }));
    expect(onFix).toHaveBeenCalledWith("C-1");
  });

  it("shows 'אין מחיר' when active price is missing", () => {
    render(
      <ReadinessPanel
        readinessMap={
          new Map([
            [
              "C-1",
              comp({ active_price_value: null, active_price_updated_at: null }),
            ],
          ])
        }
        nowMs={NOW}
        onFix={vi.fn()}
      />,
    );
    expect(screen.getByText(/No active price/)).toBeTruthy();
  });

  it("shows price age in days when present", () => {
    render(
      <ReadinessPanel
        readinessMap={
          new Map([
            [
              "C-1",
              comp({ active_price_updated_at: "2026-01-25T12:00:00Z" }),
            ],
          ])
        }
        nowMs={NOW}
        onFix={vi.fn()}
      />,
    );
    expect(screen.getByText(/90 ימים/)).toBeTruthy();
  });

  it("does NOT show [Fix] when row is fully green (supplier + fresh price)", () => {
    render(
      <ReadinessPanel
        readinessMap={new Map([["C-1", comp()]])}
        nowMs={NOW}
        onFix={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Fix/ })).toBeNull();
  });

  it("renders 'אין רכיבים' empty state when map is empty", () => {
    render(
      <ReadinessPanel readinessMap={new Map()} nowMs={NOW} onFix={vi.fn()} />,
    );
    expect(screen.getByText(/No components/)).toBeTruthy();
  });

  it("warningCount equals number of yellow rows for the badge", () => {
    const { container } = render(
      <ReadinessPanel
        readinessMap={
          new Map([
            ["C-1", comp({ primary_supplier_id: null })],
            ["C-2", comp({ active_price_value: null })],
            ["C-3", comp()],
          ])
        }
        nowMs={NOW}
        onFix={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-warning-count="2"]')).not.toBeNull();
  });
});

describe("ReadinessPanel — mobile bottom drawer", () => {
  it("renders a sticky bottom button with the warning count when mobileMode=true", () => {
    render(
      <ReadinessPanel
        readinessMap={
          new Map([["C-1", comp({ primary_supplier_id: null })]])
        }
        nowMs={NOW}
        onFix={vi.fn()}
        mobileMode
      />,
    );
    expect(
      screen.getByRole("button", { name: /1 warning/i }),
    ).toBeTruthy();
    expect(screen.queryByText("Sugar")).toBeNull();
  });

  it("opens the bottom sheet when the badge button is clicked, closes via X", () => {
    render(
      <ReadinessPanel
        readinessMap={
          new Map([["C-1", comp({ primary_supplier_id: null })]])
        }
        nowMs={NOW}
        onFix={vi.fn()}
        mobileMode
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /1 warning/i }));
    expect(screen.getByText("Sugar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Close|✕/ }));
    expect(screen.queryByText("Sugar")).toBeNull();
  });

  it("hides the badge entirely when warningCount === 0 in mobile mode", () => {
    render(
      <ReadinessPanel
        readinessMap={new Map([["C-1", comp()]])}
        nowMs={NOW}
        onFix={vi.fn()}
        mobileMode
      />,
    );
    expect(screen.queryByRole("button", { name: /warning/i })).toBeNull();
  });
});
