// ---------------------------------------------------------------------------
// ReceiptLandingPicker tests — Tranche 086 (Part B, express full-receive).
//
// Focused on the new "Receive all in full" express action:
//   L1 — when onReceiveAllInFull is provided, each open-PO row renders the
//        action and clicking it calls back with that PO (not onSelectPo).
//   L2 — when the handler is absent, the action is not rendered (back-compat).
//
// The picker renders POCardContents (a useQuery consumer) even though its
// query is disabled until expanded, so a QueryClientProvider wrapper is
// required to construct the component.
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReceiptLandingPicker } from "./ReceiptLandingPicker";
import type { PoOption, SupplierOption } from "./types";

afterEach(() => cleanup());

// A clearly past expected date keeps the PO in the "expected today / this
// week" bucket (overdue is <= 7 days) regardless of the test runner's TZ.
const PO: PoOption = {
  po_id: "po1",
  po_number: "PO-0001",
  supplier_id: "sup1",
  status: "OPEN",
  expected_receive_date: "2020-01-01",
};
const SUPPLIERS: SupplierOption[] = [
  { supplier_id: "sup1", supplier_name_official: "Acme Foods" },
];

function renderPicker(extra: Partial<Parameters<typeof ReceiptLandingPicker>[0]> = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const props = {
    openPos: [PO],
    suppliers: SUPPLIERS,
    onSelectPo: vi.fn(),
    onStartManual: vi.fn(),
    isLoadingPos: false,
    ...extra,
  };
  render(
    <QueryClientProvider client={qc}>
      <ReceiptLandingPicker {...props} />
    </QueryClientProvider>,
  );
  return props;
}

describe("ReceiptLandingPicker — express full receive", () => {
  it("calls onReceiveAllInFull with the PO and not onSelectPo", async () => {
    const onReceiveAllInFull = vi.fn();
    const props = renderPicker({ onReceiveAllInFull });

    await userEvent.click(
      screen.getByTestId("receipt-landing-receive-all-po1"),
    );

    expect(onReceiveAllInFull).toHaveBeenCalledTimes(1);
    expect(onReceiveAllInFull).toHaveBeenCalledWith(PO);
    expect(props.onSelectPo).not.toHaveBeenCalled();
  });

  it("omits the express action when no handler is provided", () => {
    renderPicker();
    expect(
      screen.queryByTestId("receipt-landing-receive-all-po1"),
    ).toBeNull();
  });
});
