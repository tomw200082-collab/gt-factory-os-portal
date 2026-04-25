// useComponentReadinessMap: TanStack Query useQueries fan-out test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useComponentReadinessMap } from "@/components/admin/recipe-health/useComponentReadinessMap";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe("useComponentReadinessMap", () => {
  it("fans out one fetch per unique component_id", async () => {
    fetchMock.mockImplementation((url: string) => {
      const id = new URL(url, "http://x").searchParams.get("component_id");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            rows: [
              {
                supplier_item_id: "SI-1",
                supplier_id: "SUP-1",
                supplier_name: "ACME",
                component_id: id,
                component_name: id,
                component_status: "ACTIVE",
                is_primary: true,
                std_cost_per_inv_uom: "1.00",
                updated_at: "2026-04-20T12:00:00Z",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    });
    const { result } = renderHook(
      () => useComponentReadinessMap(["C-1", "C-2", "C-1"]),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(2); // deduped
    expect(result.current.map.get("C-1")?.primary_supplier_id).toBe("SUP-1");
    expect(result.current.map.get("C-2")?.primary_supplier_id).toBe("SUP-1");
  });

  it("returns null primary fields when no supplier_items rows", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ rows: [] }), { status: 200 }),
    );
    const { result } = renderHook(
      () => useComponentReadinessMap(["C-9"]),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    const r = result.current.map.get("C-9")!;
    expect(r.primary_supplier_id).toBeNull();
    expect(r.active_price_value).toBeNull();
    expect(r.active_price_updated_at).toBeNull();
  });

  it("picks the row with is_primary=true even if it isn't first", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          rows: [
            {
              supplier_item_id: "SI-A",
              supplier_id: "SUP-A",
              supplier_name: "A",
              component_id: "C-1",
              component_name: "C-1",
              component_status: "ACTIVE",
              is_primary: false,
              std_cost_per_inv_uom: "5.00",
              updated_at: "2026-04-01T00:00:00Z",
            },
            {
              supplier_item_id: "SI-B",
              supplier_id: "SUP-B",
              supplier_name: "B",
              component_id: "C-1",
              component_name: "C-1",
              component_status: "ACTIVE",
              is_primary: true,
              std_cost_per_inv_uom: "9.00",
              updated_at: "2026-04-02T00:00:00Z",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const { result } = renderHook(
      () => useComponentReadinessMap(["C-1"]),
      { wrapper: wrap() },
    );
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.map.get("C-1")?.primary_supplier_id).toBe("SUP-B");
    expect(result.current.map.get("C-1")?.active_price_value).toBe("9.00");
  });

  it("isReady is false until all queries settle", async () => {
    let resolveOne: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolveOne = r;
        }),
    );
    const { result } = renderHook(
      () => useComponentReadinessMap(["C-1"]),
      { wrapper: wrap() },
    );
    expect(result.current.isReady).toBe(false);
    resolveOne(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it("returns an empty map and isReady=true when given an empty id list", () => {
    const { result } = renderHook(
      () => useComponentReadinessMap([]),
      { wrapper: wrap() },
    );
    expect(result.current.isReady).toBe(true);
    expect(result.current.map.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
