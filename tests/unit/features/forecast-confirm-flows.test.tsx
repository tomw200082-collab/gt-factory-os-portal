// ---------------------------------------------------------------------------
// forecast-confirm-flows.test.tsx — locks Tranche 053 FLOW-014 on the forecast
// version detail page: both window.confirm calls are gone, replaced by
//   • item removal → a bottom sheet naming the item (Cancel / Remove item),
//     confirm zeroes every bucket cell via the SAME auto-save queue;
//   • discard local edits → an inline two-step confirm in the sticky bottom
//     bar (FirmPanel pattern: state reveals Keep editing / Discard edits).
//
// useAutoSave is mocked (controllable pendingCount so the bottom bar shows);
// fetch is mocked per-URL; everything else renders real.
// Codebase idiom: queryByX / getByX with toBeTruthy() — no jest-dom matchers.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({
  useParams: () => ({ version_id: "v1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({
    session: { user_id: "u1", display_name: "Tom", email: "t@x.com", role: "planner", theme_preference: "light" },
    setRole: vi.fn(),
    availableRoles: ["planner"],
    isLoading: false,
    loadError: null,
  }),
}));

const autoSaveState = {
  current: {
    state: "idle" as const,
    lastSavedAt: null as Date | null,
    errorMessage: null as string | null,
    pendingCount: 2,
    queueChange: vi.fn(),
    flush: vi.fn(async () => true),
    cancel: vi.fn(),
    clearError: vi.fn(),
  },
};
vi.mock(
  "@/app/(planning)/planning/forecast/[version_id]/_lib/use-auto-save",
  () => ({
    useAutoSave: () => autoSaveState.current,
  }),
);

import ForecastVersionDetailPage from "@/app/(planning)/planning/forecast/[version_id]/page";

const VERSION = {
  version_id: "v1",
  site_id: "s1",
  cadence: "monthly",
  horizon_start_at: "2026-06-01",
  horizon_weeks: 2,
  status: "draft",
  created_by_user_id: "u1",
  created_by_snapshot: "Tom",
  created_at: "2026-06-01T08:00:00.000Z",
  updated_at: "2026-06-01T08:00:00.000Z",
  published_by_user_id: null,
  published_by_snapshot: null,
  published_at: null,
  supersedes_version_id: null,
  superseded_at: null,
  notes: null,
};

const LINES = [
  { line_id: "l1", item_id: "IT-1", period_bucket_key: "2026-06-01", forecast_quantity: "120" },
  { line_id: "l2", item_id: "IT-1", period_bucket_key: "2026-07-01", forecast_quantity: "80" },
];

const ITEMS = {
  rows: [
    { item_id: "IT-1", item_name: "Calm 1L", status: "ACTIVE", supply_method: "MANUFACTURED", sales_uom: "unit" },
  ],
  count: 1,
};

function json(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

let confirmSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
  autoSaveState.current = {
    state: "idle",
    lastSavedAt: null,
    errorMessage: null,
    pendingCount: 2,
    queueChange: vi.fn(),
    flush: vi.fn(async () => true),
    cancel: vi.fn(),
    clearError: vi.fn(),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/forecasts/versions/v1")) {
        return json({ version: VERSION, lines: LINES });
      }
      if (url.includes("/api/items")) return json(ITEMS);
      if (url.includes("/api/forecasts/versions")) return json({ versions: [] });
      return json({});
    }),
  );
});

afterEach(() => {
  cleanup();
  confirmSpy.mockRestore();
  vi.unstubAllGlobals();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ForecastVersionDetailPage />
    </QueryClientProvider>,
  );
}

describe("forecast detail — item-removal bottom sheet (FLOW-014)", () => {
  it("opens a sheet naming the item instead of window.confirm; cancel closes it", async () => {
    renderPage();
    const remove = await screen.findByTestId("forecast-grid-row-remove");
    fireEvent.click(remove);

    expect(confirmSpy).not.toHaveBeenCalled();
    const sheet = screen.getByTestId("forecast-remove-sheet");
    expect(sheet.textContent).toContain("Calm 1L");
    expect(sheet.getAttribute("role")).toBe("dialog");

    fireEvent.click(screen.getByTestId("forecast-remove-sheet-cancel"));
    expect(screen.queryByTestId("forecast-remove-sheet")).toBeNull();
    expect(autoSaveState.current.queueChange).not.toHaveBeenCalled();
  });

  it("confirm zeroes every bucket cell through the same auto-save queue", async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId("forecast-grid-row-remove"));
    fireEvent.click(screen.getByTestId("forecast-remove-sheet-confirm"));

    expect(screen.queryByTestId("forecast-remove-sheet")).toBeNull();
    const calls = autoSaveState.current.queueChange.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      { item_id: "IT-1", period_bucket_key: "2026-06-01", forecast_quantity: "0" },
      { item_id: "IT-1", period_bucket_key: "2026-07-01", forecast_quantity: "0" },
    ]);
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe("forecast detail — discard two-step inline confirm (FLOW-014)", () => {
  it("reveals Keep editing / Discard edits inline; no window.confirm", async () => {
    renderPage();
    const discard = await screen.findByTestId("forecast-bottom-bar-discard");
    fireEvent.click(discard);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("forecast-bottom-bar-discard-confirm")).toBeTruthy();
    const bar = screen.getByTestId("forecast-bottom-action-bar");
    expect(bar.textContent).toContain("unsaved change");

    // Cancel path restores the default bar.
    fireEvent.click(screen.getByTestId("forecast-bottom-bar-discard-cancel"));
    expect(screen.queryByTestId("forecast-bottom-bar-discard-confirm")).toBeNull();
    expect(screen.getByTestId("forecast-bottom-bar-discard")).toBeTruthy();
  });

  it("confirm clears the two-step state and returns to the default bar", async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId("forecast-bottom-bar-discard"));
    fireEvent.click(screen.getByTestId("forecast-bottom-bar-discard-confirm"));

    expect(screen.queryByTestId("forecast-bottom-bar-discard-confirm")).toBeNull();
    expect(screen.getByTestId("forecast-bottom-bar-discard")).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
    // INTER-007: discard must cancel the armed autosave timer + pending buffer,
    // otherwise the discarded values get POSTed ~800ms later.
    expect(autoSaveState.current.cancel).toHaveBeenCalledTimes(1);
  });
});
