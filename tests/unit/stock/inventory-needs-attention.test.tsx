import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Tranche 180 — the headline cards say when they cannot see.
//
// A stock list that failed to load is undefined, not empty. "Needs attention"
// used to count it as empty and show a green "Nothing is out…" while the stock
// read was down; while loading it showed that line under the skeleton too.
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/inventory",
}));

import InventoryPage from "@/app/(shared)/inventory/page";

const ALL_CLEAR = "Nothing is out, critical or below floor.";
const UNAVAILABLE = "We couldn't load this. Try Refresh.";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => cleanup());

function mockApi(stock: "ok" | "rm-fails" | "pending") {
  fetchMock.mockImplementation((url: string) => {
    if (stock === "pending") return new Promise(() => {});
    if (stock === "rm-fails" && url.includes("item_type=RM_PKG")) {
      return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
    }
    const body = url.startsWith("/api/stock/value")
      ? { rows: [], total_value_ils: "0", items_with_cost: 0, items_without_cost: 0 }
      : url.startsWith("/api/stock")
        ? []
        : {};
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<InventoryPage />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
  return () => screen.getByText("Needs attention").closest<HTMLElement>('[role="status"]')!;
}

describe("inventory — Needs attention card", () => {
  it("shows — and says it could not load when one stock list fails", async () => {
    mockApi("rm-fails");
    const card = renderPage();
    expect(await within(card()).findByText(UNAVAILABLE)).toBeInTheDocument();
    expect(within(card()).getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(ALL_CLEAR)).not.toBeInTheDocument();
  });

  it("states nothing while the stock is still loading", async () => {
    mockApi("pending");
    const card = renderPage();
    await new Promise((r) => setTimeout(r, 50));
    // Label and skeleton only: no count, no tone line, no error.
    expect(card().textContent).toBe("Needs attention");
  });

  it("gives the all-clear when both lists load and nothing needs attention", async () => {
    mockApi("ok");
    const card = renderPage();
    expect(await within(card()).findByText(ALL_CLEAR)).toBeInTheDocument();
  });
});
