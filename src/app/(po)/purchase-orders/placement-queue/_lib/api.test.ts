// Placement-queue data-layer tests.
//
// Tranche 157: Tom reported (with a screenshot) that scheduling a purchase
// order did not work — the panel showed the bare string
// PO_CHANGED_REVIEW_REQUIRED and the save never landed. Two defects, both
// pinned here: a machine reason code reaching the operator at all, and the
// staleness conflict having no way out.

import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { ApiError, useScheduleOrder } from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function mockScheduleFailure(body: unknown, status = 409) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    new Response(JSON.stringify(body), { status }),
  );
}

const ARGS = {
  poId: "po1",
  scheduled_order_date: "2026-08-04",
  expected_updated_at: "2026-07-29T14:12:00.123Z",
};

describe("useScheduleOrder — operator-facing failures", () => {
  it("never shows the raw reason code, even when the backend puts it in `detail`", async () => {
    // This is the exact shape schedule_handler returns: the code in `error`
    // AND embedded in the raw exception text in `detail`. The old mapper
    // preferred `detail`, so the code went straight to the screen.
    mockScheduleFailure({
      error: "PO_CHANGED_REVIEW_REQUIRED",
      detail: "PO_CHANGED_REVIEW_REQUIRED",
    });
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useScheduleOrder(), {
      wrapper: wrapper(qc),
    });

    result.current.mutate(ARGS);
    await waitFor(() => expect(result.current.isError).toBe(true));

    const err = result.current.error as ApiError;
    expect(err.message).not.toContain("PO_CHANGED_REVIEW_REQUIRED");
    expect(err.message).toContain("ההזמנה עודכנה");
    // The code is still available to code, just never to the operator.
    expect(err.code).toBe("PO_CHANGED_REVIEW_REQUIRED");
  });

  it("refetches the queue on the staleness conflict so the next save can succeed", async () => {
    mockScheduleFailure({ error: "PO_CHANGED_REVIEW_REQUIRED" });
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useScheduleOrder(), {
      wrapper: wrapper(qc),
    });

    result.current.mutate(ARGS);
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Without this the row keeps its stale updated_at and every retry 409s.
    expect(
      invalidate.mock.calls.some(
        (c) =>
          Array.isArray((c[0] as { queryKey?: unknown[] })?.queryKey) &&
          (c[0] as { queryKey: unknown[] }).queryKey[0] === "po-placement-queue",
      ),
    ).toBe(true);
  });

  it("degrades an unknown bare machine code to the Hebrew fallback", async () => {
    mockScheduleFailure({ error: "SOME_NEW_CODE_WE_DO_NOT_KNOW" });
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useScheduleOrder(), {
      wrapper: wrapper(qc),
    });

    result.current.mutate(ARGS);
    await waitFor(() => expect(result.current.isError).toBe(true));

    const err = result.current.error as Error;
    expect(err.message).toBe("שינוי מועד ההזמנה נכשל.");
  });

  it("still passes through genuinely human detail from the backend", async () => {
    mockScheduleFailure({ detail: "התאריך שנבחר חל אחרי סגירת החודש." });
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useScheduleOrder(), {
      wrapper: wrapper(qc),
    });

    result.current.mutate(ARGS);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as Error).message).toBe(
      "התאריך שנבחר חל אחרי סגירת החודש.",
    );
  });
});
