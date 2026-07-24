// ---------------------------------------------------------------------------
// FocusCard state-machine tests — Tranche 029.
//
// The session mutation hooks are mocked, so these assert the UI mapping from
// po.status to the right call-to-action (the heart of focus mode) without a
// network or QueryClient:
//   F1 — proposed   → approve CTA, no place CTA
//   F2 — approved   → place CTA + expected-date, order document copyable
//   F3 — placed     → success block, no actions
//   F4 — clicking place calls usePlacePo and resolves with the new po_id
//   F5 — skip is available on an unresolved order and resolves as skipped
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const approveMutate = vi.fn();
const placeMutate = vi.fn();
const skipMutate = vi.fn();
const editMutate = vi.fn();
const rerouteMutate = vi.fn();

vi.mock("../../purchase-session/_lib/api", () => ({
  useEditPo: () => ({ mutate: editMutate, isPending: false, error: null }),
  useApprovePo: () => ({ mutate: approveMutate, isPending: false, error: null }),
  usePlacePo: () => ({ mutate: placeMutate, isPending: false, error: null }),
  useSkipPo: () => ({ mutate: skipMutate, isPending: false, error: null }),
  useRerouteLine: () => ({
    mutate: rerouteMutate,
    isPending: false,
    variables: undefined,
  }),
}));

// Imported after the mock is registered.
import { FocusCard } from "./FocusCard";
import type { PurchaseSessionPo } from "../../purchase-session/_lib/types";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makePo(overrides: Partial<PurchaseSessionPo> = {}): PurchaseSessionPo {
  return {
    session_po_id: "spo_1",
    supplier_id: "sup_1",
    supplier_snapshot: "ספק לדוגמה",
    tier: "must",
    status: "proposed",
    order_by_date: "2026-06-05",
    earliest_need_date: "2026-06-12",
    covered_through_date: null,
    currency: "ILS",
    total_cost: 1234.5,
    order_document_text: null,
    po_id: null,
    blocking_issues: [],
    lines: [
      {
        session_po_line_id: "l1",
        component_id: "c1",
        item_id: null,
        line_label: "רכיב א",
        recommended_qty: 10,
        final_qty: 10,
        uom: "UNIT",
        unit_cost: 100,
        line_cost: 1000,
        earliest_need_date: null,
        coverage_trace: null,
        is_user_added: false,
        is_dropped: false,
      },
    ],
    ...overrides,
  };
}

describe("FocusCard", () => {
  it("F1 proposed shows approve, not place", () => {
    render(
      <FocusCard
        po={makePo({ status: "proposed" })}
        whyNow="חייב לצאת היום"
        isOverdue={false}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByTestId("focus-approve")).toBeTruthy();
    expect(screen.queryByTestId("focus-place")).toBeNull();
    expect(screen.getByTestId("focus-skip")).toBeTruthy();
  });

  it("F2 approved shows place + expected date + copyable document", () => {
    render(
      <FocusCard
        po={makePo({
          status: "approved",
          order_document_text: "שלום, נא לספק...",
        })}
        whyNow="אושר"
        isOverdue={false}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByTestId("focus-place")).toBeTruthy();
    expect(screen.getByTestId("focus-place-date")).toBeTruthy();
    expect(screen.getByTestId("focus-copy-doc")).toBeTruthy();
    expect(screen.queryByTestId("focus-approve")).toBeNull();
  });

  it("F3 placed shows success, no actions", () => {
    render(
      <FocusCard
        po={makePo({ status: "placed", po_id: "po_abcdef12" })}
        whyNow="הוזמן"
        isOverdue={false}
        onResolve={vi.fn()}
      />,
    );
    expect(screen.getByTestId("focus-placed")).toBeTruthy();
    expect(screen.queryByTestId("focus-place")).toBeNull();
    expect(screen.queryByTestId("focus-skip")).toBeNull();
  });

  it("F4 clicking place calls usePlacePo and resolves with po_id", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    render(
      <FocusCard
        po={makePo({ status: "approved" })}
        whyNow="אושר"
        isOverdue={false}
        onResolve={onResolve}
      />,
    );
    await user.click(screen.getByTestId("focus-place"));
    expect(placeMutate).toHaveBeenCalledTimes(1);
    // Simulate the mutation resolving via its onSuccess option.
    const [, opts] = placeMutate.mock.calls[0];
    opts.onSuccess({ po: { po_id: "po_new_123" } });
    expect(onResolve).toHaveBeenCalledWith({
      kind: "placed",
      poId: "po_new_123",
    });
  });

  it("F5 skip resolves as skipped", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    render(
      <FocusCard
        po={makePo({ status: "proposed" })}
        whyNow="חייב לצאת היום"
        isOverdue={false}
        onResolve={onResolve}
      />,
    );
    await user.click(screen.getByTestId("focus-skip"));
    expect(skipMutate).toHaveBeenCalledTimes(1);
    const [, opts] = skipMutate.mock.calls[0];
    opts.onSuccess();
    expect(onResolve).toHaveBeenCalledWith({ kind: "skipped" });
  });

  it("F6 cancel-with-reason: submit stays disabled until a reason is chosen, then sends skip_reason (Tom-directed 2026-07-16)", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    render(
      <FocusCard
        po={makePo({ status: "proposed" })}
        whyNow="חייב לצאת היום"
        isOverdue={false}
        onResolve={onResolve}
      />,
    );
    await user.click(screen.getByTestId("focus-cancel-toggle"));
    const submitBtn = screen.getByTestId(
      "focus-cancel-submit-spo_1",
    ) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    await user.selectOptions(
      screen.getByTestId("focus-cancel-reason-spo_1"),
      "כפילות",
    );
    expect(submitBtn.disabled).toBe(false);
    await user.click(submitBtn);

    expect(skipMutate).toHaveBeenCalledTimes(1);
    const [args, opts] = skipMutate.mock.calls[0];
    expect(args).toEqual({ poId: "spo_1", skip_reason: "כפילות" });
    opts.onSuccess();
    expect(onResolve).toHaveBeenCalledWith({ kind: "skipped" });
  });
});
