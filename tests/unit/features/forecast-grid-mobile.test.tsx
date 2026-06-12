// ---------------------------------------------------------------------------
// forecast-grid-mobile.test.tsx — locks Tranche 053 FLOW-003 / FLOW-014 on the
// forecast MonthlyGrid component:
//   • Desktop (media query false): the original fixed-track grid renders, the
//     mobile list does not, and the remove button *requests* removal directly
//     (no window.confirm — the page owns the confirm sheet now).
//   • Mobile (media query true): a vertical collapsible per-item list renders
//     instead; expanding reveals ≥44px-tall numeric inputs wired to the SAME
//     onCellEdit pipeline (floor-to-int normalization included).
//
// useMediaQuery is mocked with a mutable slot so each test picks the viewport.
// Codebase idiom: queryByX / getByX with toBeTruthy() — no jest-dom matchers.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mq = { current: false };
vi.mock("@/lib/hooks/useMediaQuery", () => ({
  useMediaQuery: () => mq.current,
}));

import {
  MonthlyGrid,
  type ForecastLineLite,
  type ItemForGrid,
} from "@/app/(planning)/planning/forecast/[version_id]/_components/MonthlyGrid";
import type { MonthBucket } from "@/app/(planning)/planning/forecast/[version_id]/_lib/format";

const BUCKETS: MonthBucket[] = [
  { key: "2026-06-01", label: "Jun 2026", cadence: "monthly" },
  { key: "2026-07-01", label: "Jul 2026", cadence: "monthly" },
];

const ITEMS: ItemForGrid[] = [
  { item_id: "IT-1", item_name: "Calm 1L", supply_method: "MANUFACTURED" },
  { item_id: "IT-2", item_name: "Matcha 0.5L", supply_method: "BOUGHT_FINISHED" },
];

const LINES: ForecastLineLite[] = [
  { line_id: "l1", item_id: "IT-1", period_bucket_key: "2026-06-01", forecast_quantity: "120" },
  { line_id: "l2", item_id: "IT-1", period_bucket_key: "2026-07-01", forecast_quantity: "80" },
];

function renderGrid(over: Partial<Parameters<typeof MonthlyGrid>[0]> = {}) {
  const onCellEdit = vi.fn();
  const onItemRemove = vi.fn();
  render(
    <MonthlyGrid
      items={ITEMS}
      lines={LINES}
      localCells={{}}
      freshlyAddedItemIds={new Set()}
      buckets={BUCKETS}
      isEditable
      onCellEdit={onCellEdit}
      onItemRemove={onItemRemove}
      {...over}
    />,
  );
  return { onCellEdit, onItemRemove };
}

let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  confirmSpy.mockRestore();
  mq.current = false;
});

describe("forecast MonthlyGrid — desktop (FLOW-003 guard off)", () => {
  it("renders the original grid and not the mobile list", () => {
    mq.current = false;
    renderGrid();
    expect(screen.getByTestId("forecast-monthly-grid")).toBeTruthy();
    expect(screen.queryByTestId("forecast-mobile-list")).toBeNull();
  });

  it("requests item removal directly — no window.confirm (FLOW-014)", () => {
    mq.current = false;
    const { onItemRemove } = renderGrid();
    const removeBtns = screen.getAllByTestId("forecast-grid-row-remove");
    fireEvent.click(removeBtns[0]!);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onItemRemove).toHaveBeenCalledTimes(1);
    expect(onItemRemove).toHaveBeenCalledWith("IT-1");
  });
});

describe("forecast MonthlyGrid — mobile list (FLOW-003)", () => {
  it("replaces the grid with one collapsible row per item", () => {
    mq.current = true;
    renderGrid();
    expect(screen.queryByTestId("forecast-monthly-grid")).toBeNull();
    expect(screen.getByTestId("forecast-mobile-list")).toBeTruthy();
    const rows = screen.getAllByTestId("forecast-mobile-item");
    expect(rows.length).toBe(2);
    // Collapsed by default — no inputs yet.
    expect(screen.queryAllByTestId("forecast-mobile-cell-input").length).toBe(0);
    // Live row total shows on the collapsed row (120 + 80).
    const totals = screen.getAllByTestId("forecast-mobile-row-total");
    expect(totals[0]!.textContent).toBe("200");
  });

  it("expands to stacked month cells with ≥44px numeric inputs", () => {
    mq.current = true;
    renderGrid();
    const toggles = screen.getAllByTestId("forecast-mobile-item-toggle");
    expect(toggles[0]!.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggles[0]!);
    expect(toggles[0]!.getAttribute("aria-expanded")).toBe("true");

    const inputs = screen.getAllByTestId(
      "forecast-mobile-cell-input",
    ) as HTMLInputElement[];
    expect(inputs.length).toBe(BUCKETS.length);
    inputs.forEach((i) => {
      expect(i.className.includes("min-h-[44px]")).toBe(true);
      expect(i.getAttribute("inputmode")).toBe("numeric");
    });
    // Persisted values flow through the same effectiveValue resolution.
    expect(inputs[0]!.value).toBe("120");
  });

  it("wires the inputs to the same onCellEdit state machine (floor-to-int)", () => {
    mq.current = true;
    const { onCellEdit } = renderGrid();
    fireEvent.click(screen.getAllByTestId("forecast-mobile-item-toggle")[0]!);
    const inputs = screen.getAllByTestId("forecast-mobile-cell-input");

    fireEvent.change(inputs[0]!, { target: { value: "12.7" } });
    expect(onCellEdit).toHaveBeenCalledWith("IT-1", "2026-06-01", "12");

    fireEvent.change(inputs[1]!, { target: { value: "" } });
    expect(onCellEdit).toHaveBeenCalledWith("IT-1", "2026-07-01", "");

    // Negative input is rejected — no extra call.
    const calls = onCellEdit.mock.calls.length;
    fireEvent.change(inputs[0]!, { target: { value: "-3" } });
    expect(onCellEdit.mock.calls.length).toBe(calls);
  });

  it("local cell overlays win over persisted lines (mid-edit parity)", () => {
    mq.current = true;
    renderGrid({ localCells: { "IT-1|2026-06-01": "999" } });
    fireEvent.click(screen.getAllByTestId("forecast-mobile-item-toggle")[0]!);
    const inputs = screen.getAllByTestId(
      "forecast-mobile-cell-input",
    ) as HTMLInputElement[];
    expect(inputs[0]!.value).toBe("999");
  });

  it("offers a remove action that requests removal without window.confirm", () => {
    mq.current = true;
    const { onItemRemove } = renderGrid();
    fireEvent.click(screen.getAllByTestId("forecast-mobile-item-toggle")[1]!);
    fireEvent.click(screen.getByTestId("forecast-mobile-item-remove"));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onItemRemove).toHaveBeenCalledWith("IT-2");
  });

  it("read-only mode renders values, not inputs", () => {
    mq.current = true;
    renderGrid({ isEditable: false });
    fireEvent.click(screen.getAllByTestId("forecast-mobile-item-toggle")[0]!);
    expect(screen.queryAllByTestId("forecast-mobile-cell-input").length).toBe(0);
    expect(screen.queryByTestId("forecast-mobile-item-remove")).toBeNull();
  });
});
