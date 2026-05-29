// ---------------------------------------------------------------------------
// FocusMode controller integration tests — Tranche 032.
//
// Session mutation hooks are mocked (skip/place auto-resolve via their
// onSuccess) so the controller logic is exercised without a network:
//   M1 — opens on the most-urgent queued order; shows progress
//   M2 — footer "next" advances the progress + card
//   M3 — skip optimistically auto-advances to the next order
//   M4 — paging past the end shows the completion screen
//   M5 — ArrowLeft advances (RTL next); Escape closes
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const noop = { mutate: vi.fn(), isPending: false, error: null };

vi.mock("../../purchase-session/_lib/api", () => ({
  useEditPo: () => noop,
  useApprovePo: () => noop,
  usePlacePo: () => ({
    mutate: (_args: unknown, opts?: { onSuccess?: (d: unknown) => void }) =>
      opts?.onSuccess?.({ po: { po_id: "po_placed" } }),
    isPending: false,
    error: null,
  }),
  useSkipPo: () => ({
    mutate: (_args: unknown, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    isPending: false,
    error: null,
  }),
}));

import { FocusMode } from "./FocusMode";
import type { PurchaseSessionPo } from "../../purchase-session/_lib/types";

const TODAY = "2026-05-29";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makePo(
  id: string,
  overrides: Partial<PurchaseSessionPo> = {},
): PurchaseSessionPo {
  return {
    session_po_id: id,
    supplier_id: `sup_${id}`,
    supplier_snapshot: `ספק ${id}`,
    tier: "must",
    status: "proposed",
    order_by_date: "2026-06-05",
    earliest_need_date: null,
    covered_through_date: null,
    currency: "ILS",
    total_cost: 100,
    order_document_text: null,
    po_id: null,
    blocking_issues: [],
    lines: [],
    ...overrides,
  };
}

// queue order: a (overdue, must_today) then b (future, can_wait)
const POS = [
  makePo("a", { order_by_date: "2026-05-26" }),
  makePo("b", { order_by_date: "2026-06-20" }),
];

describe("FocusMode", () => {
  it("M1 opens on the most-urgent order with progress", () => {
    render(<FocusMode pos={POS} today={TODAY} onClose={vi.fn()} />);
    expect(screen.getByTestId("focus-progress").textContent).toContain(
      "הזמנה 1 מתוך 2",
    );
    expect(screen.getByTestId("focus-card-a")).toBeTruthy();
  });

  it("M2 footer next advances to the second order", async () => {
    const user = userEvent.setup();
    render(<FocusMode pos={POS} today={TODAY} onClose={vi.fn()} />);
    await user.click(screen.getByTestId("focus-next"));
    expect(screen.getByTestId("focus-card-b")).toBeTruthy();
    expect(screen.getByTestId("focus-progress").textContent).toContain(
      "הזמנה 2 מתוך 2",
    );
  });

  it("M3 skip optimistically auto-advances to the next order", async () => {
    const user = userEvent.setup();
    render(<FocusMode pos={POS} today={TODAY} onClose={vi.fn()} />);
    await user.click(screen.getByTestId("focus-skip"));
    expect(screen.getByTestId("focus-card-b")).toBeTruthy();
  });

  it("M4 paging past the end shows the completion screen", async () => {
    const user = userEvent.setup();
    render(<FocusMode pos={POS} today={TODAY} onClose={vi.fn()} />);
    await user.click(screen.getByTestId("focus-next")); // → b
    await user.click(screen.getByTestId("focus-next")); // → past end
    expect(screen.getByTestId("focus-done")).toBeTruthy();
  });

  it("M5 ArrowLeft advances and Escape closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<FocusMode pos={POS} today={TODAY} onClose={onClose} />);
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("focus-card-b")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("M6 completion with work left offers 'continue to remaining'", async () => {
    const user = userEvent.setup();
    render(<FocusMode pos={POS} today={TODAY} onClose={vi.fn()} />);
    await user.click(screen.getByTestId("focus-next")); // → b
    await user.click(screen.getByTestId("focus-next")); // → done (none resolved)
    const resume = screen.getByTestId("focus-done-resume");
    expect(resume).toBeTruthy();
    await user.click(resume);
    // jumps back to the first still-open order
    expect(screen.getByTestId("focus-card-a")).toBeTruthy();
  });
});
