import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Tranche 180 — "Needs attention" says when it cannot see.
//
// A stock list that failed to load is undefined, not empty. The card used to
// count it as empty and show a green "Nothing is out…" while the stock read
// was down. It must say the stock did not load instead.
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/inventory",
}));

import InventoryPage from "@/app/(shared)/inventory/page";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => cleanup());

function mockApi(rmFails: boolean) {
  fetchMock.mockImplementation((url: string) => {
    if (rmFails && url.includes("item_type=RM_PKG")) {
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
}

describe("inventory — Needs attention card", () => {
  it("says the stock did not load when one list fails, never 'Nothing is out'", async () => {
    mockApi(true);
    renderPage();
    expect(await screen.findByText(/Stock didn't load, so this can't be checked/)).toBeInTheDocument();
    expect(screen.queryByText("Nothing is out, critical or below floor.")).not.toBeInTheDocument();
  });

  it("still gives the all-clear when both lists load and nothing needs attention", async () => {
    mockApi(false);
    renderPage();
    expect(await screen.findByText("Nothing is out, critical or below floor.")).toBeInTheDocument();
  });
});
