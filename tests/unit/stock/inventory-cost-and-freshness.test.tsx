import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Tranche 181 — what /inventory says about cost and about old numbers.
//
// P2: a row with no value row (never counted, or the value read still
//     loading) said "No cost", like a row whose cost is really missing. It
//     shows "—" now; "No cost" is what the Missing cost filter keeps.
// P7: Cost coverage mixed the value rollup (counted items) with the stock
//     lists (which add never-counted items): "196 / 276" next to "3 items have
//     no cost yet". All three numbers come from the rollup now.
// P6: a refresh that fails over cached value data says how old the value is.
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/inventory",
}));

import InventoryPage from "@/app/(shared)/inventory/page";

function stockRow(
  item_type: string,
  item_id: string,
  display_name: string,
  calculated_on_hand: string,
  extra: Record<string, unknown> = {},
) {
  return {
    site_id: "GT-MAIN",
    item_type,
    item_id,
    display_name,
    base_uom: "BOTTLE",
    calculated_on_hand,
    last_event_at: "2026-09-20T08:00:00Z",
    ...extra,
  };
}

const FG_ROWS = [
  stockRow("FG", "FG-COLA", "Priced cola", "10"),
  stockRow("FG", "FG-TONIC", "Unpriced tonic", "12"),
  stockRow("FG", "FG-SYRUP", "Uncounted syrup", "0", { never_counted: true, last_event_at: null }),
];
const RM_ROWS = [stockRow("RM", "RM-SUGAR", "Priced sugar", "40", { base_uom: "KG" })];

// The value read covers counted items only: no row for FG-SYRUP.
const VALUE_ROWS = [
  { item_type: "FG", item_id: "FG-COLA", unit_cost_ils: "2.5", total_value_ils: "25", supply_method: "BOUGHT_FINISHED" },
  { item_type: "FG", item_id: "FG-TONIC", unit_cost_ils: null, total_value_ils: null, supply_method: "BOUGHT_FINISHED" },
  { item_type: "RM", item_id: "RM-SUGAR", unit_cost_ils: "2.5", total_value_ils: "100", supply_method: null },
];

interface ApiOptions {
  value?: "ok" | "pending";
  rmFails?: boolean;
  asOf?: string;
  rollup?: { items_with_cost: number; items_without_cost: number };
}

const fetchMock = vi.fn();
let valueFails = false;

function ok(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}
function fails() {
  return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
}

function mockApi(opts: ApiOptions = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.startsWith("/api/stock/value")) {
      if (opts.value === "pending") return new Promise(() => {});
      if (valueFails) return fails();
      return ok({
        as_of: opts.asOf ?? new Date().toISOString(),
        rows: VALUE_ROWS,
        total_value_ils: "125.0000",
        items_with_cost: 2,
        items_without_cost: 1,
        row_count: VALUE_ROWS.length,
        ...opts.rollup,
      });
    }
    if (url.includes("item_type=FG")) return ok(FG_ROWS);
    if (url.includes("item_type=RM_PKG")) return opts.rmFails ? fails() : ok(RM_ROWS);
    return ok({});
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  valueFails = false;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => cleanup());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<InventoryPage />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
}

const card = (label: string) => screen.getByText(label).closest<HTMLElement>('[role="status"]')!;

/** The Unit cost cell of a desktop table row (Item, SKU, Category, On hand, Status, Unit cost, …). */
function unitCostCell(desktop: HTMLElement, name: string): HTMLElement {
  const row = within(desktop).getByText(name).closest("tr")!;
  return row.querySelectorAll<HTMLElement>("td")[5];
}

function hhmm(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

describe("inventory — cost cells (P2)", () => {
  it("shows — for a never-counted row and No cost only for a missing cost", async () => {
    mockApi();
    renderPage();
    const desktop = await screen.findByTestId("inventory-desktop");
    // Wait for the value read: the missing-cost row says so once it lands.
    await waitFor(() => expect(unitCostCell(desktop, "Unpriced tonic")).toHaveTextContent("No cost"));
    expect(unitCostCell(desktop, "Uncounted syrup")).toHaveTextContent("—");
    expect(unitCostCell(desktop, "Uncounted syrup")).not.toHaveTextContent("No cost");
    expect(within(desktop).getAllByText("No cost")).toHaveLength(1);

    const mobile = screen.getByTestId("inventory-mobile");
    const uncounted = within(mobile).getByText("Uncounted syrup").closest("article")!;
    const unpriced = within(mobile).getByText("Unpriced tonic").closest("article")!;
    expect(within(uncounted).queryByText("No cost")).not.toBeInTheDocument();
    // Two dashes: the cost, and the last-movement date it has never had.
    expect(within(uncounted).getAllByText("—")).toHaveLength(2);
    expect(within(unpriced).getByText("No cost")).toBeInTheDocument();
  });

  it("says No cost on no row while the value read is still loading", async () => {
    mockApi({ value: "pending" });
    renderPage();
    const desktop = await screen.findByTestId("inventory-desktop");
    expect(within(desktop).getByText("Unpriced tonic")).toBeInTheDocument();
    expect(unitCostCell(desktop, "Unpriced tonic")).toHaveTextContent("—");
    expect(screen.queryByText("No cost")).not.toBeInTheDocument();
  });
});

describe("inventory — Cost coverage card (P7)", () => {
  it("takes the ratio and the text from the value rollup, not the stock lists", async () => {
    mockApi();
    renderPage();
    // Four stock rows, three counted: the ratio is over the three.
    expect(await within(card("Cost coverage")).findByText("2 / 3")).toBeInTheDocument();
    expect(
      within(card("Cost coverage")).getByText("1 counted item has no cost yet — see the Missing cost filter."),
    ).toBeInTheDocument();
    await waitFor(() => expect(card("Items")).toHaveTextContent("4"));
  });

  it("gives the all-clear only when the ratio is full", async () => {
    mockApi({ rollup: { items_with_cost: 3, items_without_cost: 0 } });
    renderPage();
    expect(await within(card("Cost coverage")).findByText("3 / 3")).toBeInTheDocument();
    expect(within(card("Cost coverage")).getByText("Every counted item has a cost.")).toBeInTheDocument();
  });

  it("still reads the rollup when a stock list fails", async () => {
    mockApi({ rmFails: true });
    renderPage();
    expect(await within(card("Cost coverage")).findByText("2 / 3")).toBeInTheDocument();
  });
});

describe("inventory — Stock value after a failed refresh (P6)", () => {
  async function failRefresh() {
    const refresh = screen.getByRole("button", { name: "Refresh inventory" });
    await waitFor(() => expect(refresh).not.toBeDisabled());
    valueFails = true;
    fireEvent.click(refresh);
  }

  it("keeps the cached value and says when it is from", async () => {
    const asOf = new Date();
    mockApi({ asOf: asOf.toISOString() });
    renderPage();
    expect(
      await within(card("Stock value")).findByText("Items without a cost are not included."),
    ).toBeInTheDocument();

    await failRefresh();

    expect(
      await within(card("Stock value")).findByText(`Couldn't refresh — showing ${hhmm(asOf)}`),
    ).toBeInTheDocument();
    expect(card("Stock value")).toHaveTextContent("125.00");
    expect(within(card("Stock value")).queryByText("We couldn't load this. Try Refresh.")).not.toBeInTheDocument();
  });

  it("adds the date when the cached value is from an earlier day", async () => {
    const asOf = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    mockApi({ asOf: asOf.toISOString() });
    renderPage();
    await within(card("Stock value")).findByText("Items without a cost are not included.");

    await failRefresh();

    const day = asOf.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    expect(
      await within(card("Stock value")).findByText(`Couldn't refresh — showing ${day} ${hhmm(asOf)}`),
    ).toBeInTheDocument();
  });
});
