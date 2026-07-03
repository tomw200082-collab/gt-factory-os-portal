// FgOutPickUndoControl — role/type gating + status rendering + confirm→POST.
//
// Contract:
//   - not FG_OUT_PICK → renders nothing, regardless of role
//   - FG_OUT_PICK + operator/viewer → renders nothing (admin/planner only)
//   - FG_OUT_PICK + admin/planner, not reversed → "Undo this delivery" button
//   - FG_OUT_PICK + admin/planner, already reversed → "This delivery was undone." note
//   - confirm → POST /api/stock/fg-out-pick/:id/undo, calls onUndone
//   - dual_role_cover_warning=true response → shows the warning WITHOUT calling
//     onUndone (code review 2026-07-03: onUndone unmounts the whole drawer on
//     this page; calling it in the same tick as the warning setState meant the
//     warning never painted — React 18 batches them). onUndone only fires when
//     the operator explicitly dismisses the warning via its own Close button.
//   - the warning is also durable: a GET reversal-status carrying
//     dual_role_cover_warning=true shows the warning branch even without a
//     fresh POST in this mount (surviving a drawer close/reopen).
//   - failed status read → honest "couldn't check" state, never falls through
//     to offering Undo as if the row were known-not-reversed
// Copy is English.

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

const h = vi.hoisted(() => ({ role: "admin" as string }));
vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({
    session: {
      user_id: "u1",
      display_name: "Tom",
      email: "t@x.com",
      role: h.role,
      theme_preference: "light",
    },
    setRole: vi.fn(),
    availableRoles: [h.role],
  }),
}));

import { FgOutPickUndoControl } from "@/components/stock/FgOutPickUndoControl";

const fetchMock = vi.fn();
const postSpy = vi.fn();
const onUndone = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  postSpy.mockReset();
  onUndone.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  h.role = "admin";
});
afterEach(() => cleanup());

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function mockStatus(state: {
  reversed: boolean;
  reversed_at?: string | null;
  reversed_by?: string | null;
  dual_role_cover_warning?: boolean;
}) {
  fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          reversed: state.reversed,
          reversed_at: state.reversed_at ?? null,
          reversed_by: state.reversed_by ?? null,
          dual_role_cover_warning: state.dual_role_cover_warning ?? false,
        }),
      });
    }
    const sent = JSON.parse((init?.body as string) ?? "{}");
    postSpy(sent);
    return Promise.resolve({
      ok: true,
      json: async () => ({
        reversed: true,
        reversed_at: "2026-07-03T10:00:00Z",
        reversed_by: "Tom",
        dual_role_cover_warning: false,
      }),
    });
  });
}

describe("FgOutPickUndoControl", () => {
  it("not FG_OUT_PICK → renders nothing", async () => {
    mockStatus({ reversed: false });
    render(
      <FgOutPickUndoControl
        movementId="m1"
        movementType="GR_POSTED"
        onUndone={onUndone}
      />,
      { wrapper: wrap() },
    );
    expect(screen.queryByTestId("fg-out-pick-undo-control")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("operator, FG_OUT_PICK → renders nothing", async () => {
    h.role = "operator";
    mockStatus({ reversed: false });
    render(
      <FgOutPickUndoControl
        movementId="m1"
        movementType="FG_OUT_PICK"
        onUndone={onUndone}
      />,
      { wrapper: wrap() },
    );
    // The status query is enabled: isPickRow && canUndo — flush a microtask
    // so any effect TanStack Query scheduled on mount has run, then assert.
    // (waitFor() resolves on its first successful check, so a bare
    // `waitFor(() => expect(...).not.toHaveBeenCalled())` would pass
    // trivially without actually waiting anything out — not a real guard.)
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId("fg-out-pick-undo-control")).toBeNull();
  });

  it("admin, FG_OUT_PICK, not reversed → shows the Undo button", async () => {
    mockStatus({ reversed: false });
    render(
      <FgOutPickUndoControl
        movementId="m1"
        movementType="FG_OUT_PICK"
        onUndone={onUndone}
      />,
      { wrapper: wrap() },
    );
    expect(await screen.findByTestId("fg-out-pick-undo-open")).toBeTruthy();
    expect(screen.getByText(/Undo this delivery/i)).toBeTruthy();
  });

  it("admin, FG_OUT_PICK, already reversed → shows the undone note, no button", async () => {
    mockStatus({
      reversed: true,
      reversed_at: "2026-07-03T09:00:00Z",
      reversed_by: "Tom",
    });
    render(
      <FgOutPickUndoControl
        movementId="m1"
        movementType="FG_OUT_PICK"
        onUndone={onUndone}
      />,
      { wrapper: wrap() },
    );
    expect(
      await screen.findByTestId("fg-out-pick-undo-already-reversed"),
    ).toBeTruthy();
    expect(screen.getByText(/This delivery was undone/i)).toBeTruthy();
    expect(screen.queryByTestId("fg-out-pick-undo-open")).toBeNull();
  });

  it("admin confirms undo → POSTs { reason: undefined } and calls onUndone", async () => {
    mockStatus({ reversed: false });
    render(
      <FgOutPickUndoControl
        movementId="m1"
        movementType="FG_OUT_PICK"
        onUndone={onUndone}
      />,
      { wrapper: wrap() },
    );
    fireEvent.click(await screen.findByTestId("fg-out-pick-undo-open"));
    expect(screen.getByTestId("fg-out-pick-undo-confirm")).toBeTruthy();
    fireEvent.click(screen.getByTestId("fg-out-pick-undo-confirm"));
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith({}));
    await waitFor(() => expect(onUndone).toHaveBeenCalled());
  });

  it("admin types a reason and confirms → POSTs it trimmed", async () => {
    mockStatus({ reversed: false });
    render(
      <FgOutPickUndoControl
        movementId="m1"
        movementType="FG_OUT_PICK"
        onUndone={onUndone}
      />,
      { wrapper: wrap() },
    );
    fireEvent.click(await screen.findByTestId("fg-out-pick-undo-open"));
    fireEvent.change(screen.getByTestId("fg-out-pick-undo-reason"), {
      target: { value: "  counted before this posted  " },
    });
    fireEvent.click(screen.getByTestId("fg-out-pick-undo-confirm"));
    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith({
        reason: "counted before this posted",
      }),
    );
  });

  it("dual_role_cover_warning=true → shows the warning WITHOUT calling onUndone (drawer stays open)", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            reversed: false,
            reversed_at: null,
            reversed_by: null,
            dual_role_cover_warning: false,
          }),
        });
      }
      postSpy(JSON.parse((init?.body as string) ?? "{}"));
      return Promise.resolve({
        ok: true,
        json: async () => ({
          reversed: true,
          reversed_at: "2026-07-03T10:00:00Z",
          reversed_by: "Tom",
          dual_role_cover_warning: true,
        }),
      });
    });
    render(
      <FgOutPickUndoControl
        movementId="m1"
        movementType="FG_OUT_PICK"
        onUndone={onUndone}
      />,
      { wrapper: wrap() },
    );
    fireEvent.click(await screen.findByTestId("fg-out-pick-undo-open"));
    fireEvent.click(screen.getByTestId("fg-out-pick-undo-confirm"));
    expect(
      await screen.findByTestId("fg-out-pick-undo-dual-role-warning"),
    ).toBeTruthy();
    expect(screen.getByText(/NOT automatically adjusted/i)).toBeTruthy();
    // The bug this regression-tests: onUndone must NOT fire here — on the
    // real page it's the drawer's onReversed, which unmounts this component;
    // firing it in the same tick as the warning setState would mean the
    // warning never paints (React 18 batches both setStates together).
    expect(onUndone).not.toHaveBeenCalled();

    // The warning's own Close button is the only thing that dismisses it.
    fireEvent.click(screen.getByTestId("fg-out-pick-undo-dual-role-close"));
    expect(onUndone).toHaveBeenCalledTimes(1);
  });

  it("dual-role warning survives a remount (durable via GET reversal-status, not just the POST response)", async () => {
    mockStatus({
      reversed: true,
      reversed_at: "2026-07-03T09:00:00Z",
      reversed_by: "Tom",
      dual_role_cover_warning: true,
    });
    render(
      <FgOutPickUndoControl
        movementId="m1"
        movementType="FG_OUT_PICK"
        onUndone={onUndone}
      />,
      { wrapper: wrap() },
    );
    // No POST ever happened in this mount — the warning comes purely from
    // the status GET, proving it's not lost across a drawer close/reopen.
    expect(
      await screen.findByTestId("fg-out-pick-undo-dual-role-warning"),
    ).toBeTruthy();
    expect(screen.queryByTestId("fg-out-pick-undo-already-reversed")).toBeNull();
  });

  it("status read fails → honest 'couldn't check' state, never offers Undo as if not-reversed", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    render(
      <FgOutPickUndoControl
        movementId="m1"
        movementType="FG_OUT_PICK"
        onUndone={onUndone}
      />,
      { wrapper: wrap() },
    );
    expect(
      await screen.findByTestId("fg-out-pick-undo-load-error"),
    ).toBeTruthy();
    expect(screen.queryByTestId("fg-out-pick-undo-open")).toBeNull();
  });

  it("POST failure (genuine error) → shows an inline error, stays open", async () => {
    mockStatus({ reversed: false });
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            reversed: false,
            reversed_at: null,
            reversed_by: null,
            dual_role_cover_warning: false,
          }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({ reason_code: "NOT_UNDOABLE_TYPE", detail: "wrong movement type" }),
      });
    });
    render(
      <FgOutPickUndoControl
        movementId="m1"
        movementType="FG_OUT_PICK"
        onUndone={onUndone}
      />,
      { wrapper: wrap() },
    );
    fireEvent.click(await screen.findByTestId("fg-out-pick-undo-open"));
    fireEvent.click(screen.getByTestId("fg-out-pick-undo-confirm"));
    expect(await screen.findByTestId("fg-out-pick-undo-error")).toBeTruthy();
    expect(screen.getByText(/wrong movement type/i)).toBeTruthy();
    expect(onUndone).not.toHaveBeenCalled();
  });

  it("POST failure ALREADY_REVERSED (double-click / retry) → soft-success, no scary error", async () => {
    mockStatus({ reversed: false });
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            reversed: false,
            reversed_at: null,
            reversed_by: null,
            dual_role_cover_warning: false,
          }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({ reason_code: "ALREADY_REVERSED", detail: "already undone" }),
      });
    });
    render(
      <FgOutPickUndoControl
        movementId="m1"
        movementType="FG_OUT_PICK"
        onUndone={onUndone}
      />,
      { wrapper: wrap() },
    );
    fireEvent.click(await screen.findByTestId("fg-out-pick-undo-open"));
    fireEvent.click(screen.getByTestId("fg-out-pick-undo-confirm"));
    // The confirm form closes and no scary inline error is shown — the
    // delivery genuinely IS undone by the time this response lands.
    await waitFor(() =>
      expect(screen.queryByTestId("fg-out-pick-undo-confirm")).toBeNull(),
    );
    expect(screen.queryByTestId("fg-out-pick-undo-error")).toBeNull();
  });
});
