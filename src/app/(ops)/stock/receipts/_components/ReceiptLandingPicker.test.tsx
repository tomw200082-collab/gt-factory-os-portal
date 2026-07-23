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
import { cleanup, render, screen, within } from "@testing-library/react";
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

describe("ReceiptLandingPicker — door mode default bucket (Tranche 137)", () => {
  it("leads with 'Expected today & this week' and excludes POs due beyond 7 days", async () => {
    const today = new Date();
    const iso = (daysFromNow: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + daysFromNow);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const overdue: PoOption = { ...PO, po_id: "po-overdue", po_number: "PO-OVERDUE", expected_receive_date: iso(-2) };
    const soon: PoOption = { ...PO, po_id: "po-soon", po_number: "PO-SOON", expected_receive_date: iso(3) };
    const later: PoOption = { ...PO, po_id: "po-later", po_number: "PO-LATER", expected_receive_date: iso(30) };

    renderPicker({ openPos: [later, soon, overdue] });

    // Door-mode default: the "Expected today & this week" card is the first
    // card on the picker (leads over search + manual).
    const cards = screen.getAllByTestId(/^receipt-landing-(expected|search|manual)$/);
    expect(cards[0].getAttribute("data-testid")).toBe("receipt-landing-expected");

    // Overdue and within-7-days rows appear in that bucket (getByTestId
    // throws if either is missing, so reaching the next line is the proof).
    screen.getByTestId("receipt-landing-expected-row-po-overdue");
    screen.getByTestId("receipt-landing-expected-row-po-soon");
    // ...sorted overdue-first (door priority: what's late gets attention first).
    const expectedCard = screen.getByTestId("receipt-landing-expected");
    const rowOrder = within(expectedCard)
      .getAllByTestId(/^receipt-landing-expected-row-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(rowOrder).toEqual([
      "receipt-landing-expected-row-po-overdue",
      "receipt-landing-expected-row-po-soon",
    ]);
    // ...while a PO due a month out is NOT in the default bucket (findable
    // only via search) — keeps the door-mode default list short.
    expect(screen.queryByTestId("receipt-landing-expected-row-po-later")).toBeNull();
  });

  it("demotes the manual/no-PO CTA to a secondary (outline) button, not the primary action", () => {
    renderPicker();
    const manualStart = screen.getByTestId("receipt-landing-manual-start");
    expect(manualStart.className).toContain("btn-outline");
    expect(manualStart.className).not.toContain("btn-primary");
  });
});

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
