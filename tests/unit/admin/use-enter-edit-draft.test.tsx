// useEnterEditDraft — clone/resume/empty-draft mutation hook.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEnterEditDraft } from "@/components/bom-edit/useEnterEditDraft";

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

describe("useEnterEditDraft", () => {
  it("clones from active when no draft exists → returns new draft id", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          bom_version_id: "BV-NEW",
          version_label: "v4",
          status: "DRAFT",
        }),
        { status: 200 },
      ),
    );
    const { result } = renderHook(() => useEnterEditDraft(), { wrapper: wrap() });
    let target: string | null = null;
    await act(async () => {
      target = await result.current.enterEdit({
        bomHeadId: "BH-1",
        activeVersionId: "BV-3",
        existingDraftId: null,
      });
    });
    expect(target).toBe("BV-NEW");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.head_id).toBe("BH-1");
    expect(callBody.clone_from_version_id).toBe("BV-3");
    expect(typeof callBody.idempotency_key).toBe("string");
  });

  it("returns existing draft id without calling API when DRAFT already exists", async () => {
    const { result } = renderHook(() => useEnterEditDraft(), { wrapper: wrap() });
    let target: string | null = null;
    await act(async () => {
      target = await result.current.enterEdit({
        bomHeadId: "BH-1",
        activeVersionId: "BV-3",
        existingDraftId: "BV-DRAFT-EXISTING",
      });
    });
    expect(target).toBe("BV-DRAFT-EXISTING");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates an empty draft when no active version exists", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          bom_version_id: "BV-NEW",
          version_label: "v1",
          status: "DRAFT",
        }),
        { status: 200 },
      ),
    );
    const { result } = renderHook(() => useEnterEditDraft(), { wrapper: wrap() });
    let target: string | null = null;
    await act(async () => {
      target = await result.current.enterEdit({
        bomHeadId: "BH-1",
        activeVersionId: null,
        existingDraftId: null,
      });
    });
    expect(target).toBe("BV-NEW");
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.head_id).toBe("BH-1");
    expect("clone_from_version_id" in callBody).toBe(false);
  });

  it("propagates server error as a thrown promise", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );
    const { result } = renderHook(() => useEnterEditDraft(), { wrapper: wrap() });
    await expect(
      result.current.enterEdit({
        bomHeadId: "BH-1",
        activeVersionId: "BV-3",
        existingDraftId: null,
      }),
    ).rejects.toThrow();
  });
});
