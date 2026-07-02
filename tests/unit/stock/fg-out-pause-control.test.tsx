// FgOutPauseControl — role-gated visibility + confirm→POST interaction.
//
// Contract:
//   - admin/planner, not paused → "Pause stock changes from deliveries" control
//   - operator/viewer, not paused → renders nothing
//   - paused → warning banner visible to EVERY role
//   - paused + admin/planner → banner also carries a "Resume" button
//   - confirm → POST /api/stock/fg-out-pause with { paused: true }
// Copy is English (Movement Log is not a Hebrew-exception surface).

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

// Mutable role holder so each test can pick the session role.
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

import { FgOutPauseControl } from "@/components/stock/FgOutPauseControl";

const fetchMock = vi.fn();
const postSpy = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  postSpy.mockReset();
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

function mockPause(state: {
  paused: boolean;
  since?: string | null;
  by?: string | null;
}) {
  fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          paused: state.paused,
          since: state.since ?? null,
          by: state.by ?? null,
          reason: null,
        }),
      });
    }
    const sent = JSON.parse((init?.body as string) ?? "{}");
    postSpy(sent);
    return Promise.resolve({
      ok: true,
      json: async () => ({ ...sent, since: null, by: null, changed: true }),
    });
  });
}

describe("FgOutPauseControl", () => {
  it("admin, not paused → shows the English pause control", async () => {
    mockPause({ paused: false });
    render(<FgOutPauseControl />, { wrapper: wrap() });
    expect(await screen.findByTestId("fg-out-pause-open")).toBeTruthy();
    expect(
      screen.getByText(/Pause stock changes from deliveries/i),
    ).toBeTruthy();
  });

  it("operator, not paused → renders nothing", async () => {
    h.role = "operator";
    mockPause({ paused: false });
    render(<FgOutPauseControl />, { wrapper: wrap() });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("fg-out-pause-control")).toBeNull();
    expect(screen.queryByTestId("fg-out-pause-open")).toBeNull();
    expect(screen.queryByTestId("fg-out-pause-banner")).toBeNull();
  });

  it("operator, paused → sees the banner but NO resume button", async () => {
    h.role = "operator";
    mockPause({ paused: true, since: "2026-07-02T06:00:00Z", by: "Tom" });
    render(<FgOutPauseControl />, { wrapper: wrap() });
    expect(await screen.findByTestId("fg-out-pause-banner")).toBeTruthy();
    expect(
      screen.getByText(/Delivery stock updates are paused/i),
    ).toBeTruthy();
    expect(screen.queryByTestId("fg-out-pause-resume-open")).toBeNull();
  });

  it("admin, paused → banner carries a resume button", async () => {
    mockPause({ paused: true, since: "2026-07-02T06:00:00Z", by: "Tom" });
    render(<FgOutPauseControl />, { wrapper: wrap() });
    expect(await screen.findByTestId("fg-out-pause-banner")).toBeTruthy();
    expect(screen.getByTestId("fg-out-pause-resume-open")).toBeTruthy();
  });

  it("admin, GET fails → shows a retry (never implies 'not paused')", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    render(<FgOutPauseControl />, { wrapper: wrap() });
    expect(await screen.findByTestId("fg-out-pause-load-error")).toBeTruthy();
    expect(screen.getByTestId("fg-out-pause-retry")).toBeTruthy();
    // Must NOT fall through to the "not paused" pause affordance.
    expect(screen.queryByTestId("fg-out-pause-open")).toBeNull();
  });

  it("operator, GET fails → renders nothing", async () => {
    h.role = "operator";
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    render(<FgOutPauseControl />, { wrapper: wrap() });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId("fg-out-pause-load-error")).toBeNull();
    expect(screen.queryByTestId("fg-out-pause-banner")).toBeNull();
  });

  it("admin confirms pause → POSTs { paused: true }", async () => {
    mockPause({ paused: false });
    render(<FgOutPauseControl />, { wrapper: wrap() });
    fireEvent.click(await screen.findByTestId("fg-out-pause-open"));
    expect(screen.getByTestId("fg-out-pause-confirm")).toBeTruthy();
    fireEvent.click(screen.getByTestId("fg-out-pause-confirm-btn"));
    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith({ paused: true }),
    );
  });
});
