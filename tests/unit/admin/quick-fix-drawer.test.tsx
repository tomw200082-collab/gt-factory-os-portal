// QuickFixDrawer + SwapPrimaryConfirm tests for Actions A, B, C and the
// inline price-update on the primary row.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { QuickFixDrawer } from "@/components/admin/recipe-health/QuickFixDrawer";
import { SwapPrimaryConfirm } from "@/components/admin/recipe-health/SwapPrimaryConfirm";

function wrap() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const twoRows = [
  {
    supplier_item_id: "SI-A",
    supplier_id: "SUP-A",
    supplier_name: "ACME",
    component_id: "C-1",
    component_name: "Sugar",
    component_status: "ACTIVE",
    is_primary: false,
    std_cost_per_inv_uom: "2.50",
    lead_time_days: 7,
    moq: "10",
    updated_at: "2026-04-20T12:00:00Z",
  },
  {
    supplier_item_id: "SI-B",
    supplier_id: "SUP-B",
    supplier_name: "Sweet Co",
    component_id: "C-1",
    component_name: "Sugar",
    component_status: "ACTIVE",
    is_primary: false,
    std_cost_per_inv_uom: "2.10",
    lead_time_days: 14,
    moq: "50",
    updated_at: "2026-04-22T12:00:00Z",
  },
];

describe("QuickFixDrawer — Action A (set existing supplier primary)", () => {
  it("renders a radio row per existing supplier_item", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ rows: twoRows }), { status: 200 }),
    );
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, {
      wrapper: wrap(),
    });
    await screen.findByText(/ACME/);
    expect(screen.getByText(/Sweet Co/)).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("PATCHes is_primary: true with if_match_updated_at on save", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rows: twoRows }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            supplier_item_id: "SI-B",
            is_primary: true,
            updated_at: "2026-04-25T00:00:00Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ rows: [{ ...twoRows[1], is_primary: true }, twoRows[0]] }),
          { status: 200 },
        ),
      );
    const onClose = vi.fn();
    render(<QuickFixDrawer componentId="C-1" open onClose={onClose} />, {
      wrapper: wrap(),
    });
    await screen.findByText(/Sweet Co/);
    fireEvent.click(screen.getByLabelText("Sweet Co"));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) =>
            u === "/api/supplier-items/SI-B" &&
            (i as RequestInit | undefined)?.method === "PATCH",
        ),
      ).toBe(true),
    );
    const patchCall = fetchMock.mock.calls.find(
      ([u, i]) =>
        u === "/api/supplier-items/SI-B" &&
        (i as RequestInit | undefined)?.method === "PATCH",
    )!;
    const body = JSON.parse((patchCall[1] as RequestInit).body as string);
    expect(body.is_primary).toBe(true);
    expect(body.if_match_updated_at).toBe("2026-04-22T12:00:00Z");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("on 409 STALE_ROW: drawer stays open with refresh hint", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rows: twoRows }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: "STALE_ROW", message: "stale" }),
          { status: 409 },
        ),
      );
    const onClose = vi.fn();
    render(<QuickFixDrawer componentId="C-1" open onClose={onClose} />, {
      wrapper: wrap(),
    });
    await screen.findByText(/Sweet Co/);
    fireEvent.click(screen.getByLabelText("Sweet Co"));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await screen.findByText(/הספק עודכן/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("on 409 from partial unique index: shows 'Database invariant violation' banner", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rows: twoRows }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: "UNIQUE_VIOLATION", message: "unique" }),
          { status: 409 },
        ),
      );
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, {
      wrapper: wrap(),
    });
    await screen.findByText(/Sweet Co/);
    fireEvent.click(screen.getByLabelText("Sweet Co"));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    await screen.findByText(/Database invariant violation/);
  });
});

describe("QuickFixDrawer — Action B (add new sourcing link)", () => {
  it("renders [+ Add new supplier] button alongside the radio list", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ rows: twoRows }), { status: 200 }),
    );
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, {
      wrapper: wrap(),
    });
    await screen.findByText(/ACME/);
    expect(
      screen.getByRole("button", { name: /Add new supplier/i }),
    ).toBeTruthy();
  });

  it("when component has 0 supplier_items: shows Action B form directly with 'Set as primary' default-checked", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ rows: [] }), { status: 200 }),
    );
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, {
      wrapper: wrap(),
    });
    // useEffect flips mode to "add" once rowsQuery is success — wait for the
    // form to mount.
    const setPrimary = (await screen.findByLabelText(/Set as primary/i)) as HTMLInputElement;
    expect(setPrimary.checked).toBe(true);
  });

  it("submitting Action B POSTs /api/supplier-items, then PATCHes is_primary if checked", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rows: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            supplier_item_id: "SI-NEW",
            supplier_id: "SUP-N",
            component_id: "C-1",
            is_primary: false,
            updated_at: "2026-04-25T00:00:00Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            supplier_item_id: "SI-NEW",
            is_primary: true,
            updated_at: "2026-04-25T00:01:00Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rows: [] }), { status: 200 }),
      );
    const onClose = vi.fn();
    render(<QuickFixDrawer componentId="C-1" open onClose={onClose} />, {
      wrapper: wrap(),
    });
    await screen.findByLabelText(/supplier_id/i);
    fireEvent.change(screen.getByLabelText(/supplier_id/i), {
      target: { value: "SUP-N" },
    });
    fireEvent.change(screen.getByLabelText(/std_cost/i), {
      target: { value: "1.99" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add link/i }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([u, i]) =>
          u === "/api/supplier-items" &&
          (i as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeTruthy();
    });
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([u, i]) =>
          u === "/api/supplier-items/SI-NEW" &&
          (i as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patch).toBeTruthy();
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("SwapPrimaryConfirm (Action C step 2)", () => {
  it("renders both current and new primaries with cost/lead/MOQ/supplier", () => {
    const currentRow = { ...twoRows[0], is_primary: true };
    const newRow = twoRows[1];
    render(
      <SwapPrimaryConfirm
        currentPrimary={currentRow}
        newPrimary={newRow}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/Current primary/)).toBeTruthy();
    expect(screen.getByText(/New primary/)).toBeTruthy();
    expect(screen.getByText(/ACME/)).toBeTruthy();
    expect(screen.getByText(/Sweet Co/)).toBeTruthy();
    expect(screen.getByText(/2\.50/)).toBeTruthy();
    expect(screen.getByText(/2\.10/)).toBeTruthy();
  });

  it("Confirm button is disabled until the checkbox is checked", () => {
    const onConfirm = vi.fn();
    render(
      <SwapPrimaryConfirm
        currentPrimary={twoRows[0]}
        newPrimary={twoRows[1]}
        onConfirm={onConfirm}
        onBack={vi.fn()}
      />,
    );
    const confirmBtn = screen.getByRole("button", { name: /^Confirm/ }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("QuickFixDrawer — Action C entry path", () => {
  it("clicking [Swap primary] from a row routes to the SwapPrimaryConfirm panel", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          rows: [{ ...twoRows[0], is_primary: true }, twoRows[1]],
        }),
        { status: 200 },
      ),
    );
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, {
      wrapper: wrap(),
    });
    await screen.findByText(/ACME/);
    fireEvent.click(screen.getByLabelText("Sweet Co"));
    fireEvent.click(screen.getByRole("button", { name: /^Swap primary$/ }));
    await screen.findByText(/Current primary/);
    expect(screen.getByText(/אני מאשר/)).toBeTruthy();
  });
});

describe("QuickFixDrawer — inline price update on primary row", () => {
  it("renders an [Update price] inline form on the primary row when price is missing", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          rows: [{ ...twoRows[0], is_primary: true, std_cost_per_inv_uom: null }],
        }),
        { status: 200 },
      ),
    );
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, {
      wrapper: wrap(),
    });
    await screen.findByText(/ACME/);
    expect(
      screen.getByRole("button", { name: /Update price/i }),
    ).toBeTruthy();
  });

  it("PATCHes std_cost_per_inv_uom only (without is_primary), with if_match_updated_at", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            rows: [{ ...twoRows[0], is_primary: true, std_cost_per_inv_uom: null }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            supplier_item_id: "SI-A",
            std_cost_per_inv_uom: "3.99",
            updated_at: "2026-04-25T00:00:00Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rows: [] }), { status: 200 }),
      );
    render(<QuickFixDrawer componentId="C-1" open onClose={vi.fn()} />, {
      wrapper: wrap(),
    });
    await screen.findByText(/ACME/);
    fireEvent.click(screen.getByRole("button", { name: /Update price/i }));
    fireEvent.change(screen.getByLabelText(/new price/i), {
      target: { value: "3.99" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Save price/ }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, i]) =>
          u === "/api/supplier-items/SI-A" &&
          (i as RequestInit | undefined)?.method === "PATCH",
      );
      expect(call).toBeTruthy();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.std_cost_per_inv_uom).toBe("3.99");
      expect("is_primary" in body).toBe(false);
      expect(body.if_match_updated_at).toBe("2026-04-20T12:00:00Z");
    });
  });
});
