// useTrackData test: head/version/lines fetcher composition.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTrackData } from "@/components/admin/recipe-health/useTrackData";

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

function respond(url: string): Response {
  if (url.includes("/api/boms/versions")) {
    return new Response(
      JSON.stringify({
        rows: [
          { bom_version_id: "V-3", version_label: "v3", status: "ACTIVE" },
          { bom_version_id: "V-2", version_label: "v2", status: "SUPERSEDED" },
          { bom_version_id: "V-4", version_label: "v4", status: "DRAFT" },
        ],
      }),
      { status: 200 },
    );
  }
  if (url.includes("/api/boms/lines")) {
    return new Response(
      JSON.stringify({
        rows: [
          { bom_line_id: "L1", component_id: "C-1", qty: "1.5", updated_at: "2026-04-20T00:00:00Z" },
          { bom_line_id: "L2", component_id: "C-2", qty: "0.5", updated_at: "2026-04-20T00:00:00Z" },
        ],
      }),
      { status: 200 },
    );
  }
  return new Response("not mocked", { status: 500 });
}

describe("useTrackData", () => {
  it("identifies the ACTIVE version, the DRAFT version, and fetches active lines", async () => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(respond(url)));
    const { result } = renderHook(() => useTrackData("BH-1"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.activeVersionId).toBe("V-3");
    expect(result.current.activeVersionLabel).toBe("v3");
    expect(result.current.draftVersionId).toBe("V-4");
    expect(result.current.lines).toHaveLength(2);
    expect(result.current.lines[0].component_id).toBe("C-1");
  });

  it("returns null active version and empty lines when only DRAFT exists", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/boms/versions")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [{ bom_version_id: "V-1", version_label: "v1", status: "DRAFT" }],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    });
    const { result } = renderHook(() => useTrackData("BH-1"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.activeVersionId).toBeNull();
    expect(result.current.activeVersionLabel).toBeNull();
    expect(result.current.draftVersionId).toBe("V-1");
    expect(result.current.lines).toEqual([]);
  });

  it("returns isReady=true with empty fields when bom_head_id is null", () => {
    const { result } = renderHook(() => useTrackData(null), { wrapper: wrap() });
    expect(result.current.isReady).toBe(true);
    expect(result.current.activeVersionId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
