import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const router = { replace: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/apps",
}));

const sessionState = {
  current: {
    session: {
      user_id: "u1",
      email: "tom@gteveryday.com",
      display_name: "Tom",
      role: "admin",
      theme_preference: "light" as const,
    },
    setRole: vi.fn(),
    availableRoles: ["admin"],
    isLoading: false,
    loadError: null,
  },
};
vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => sessionState.current,
}));

import AppsPage from "@/app/apps/page";

function setRole(role: string) {
  sessionState.current = {
    ...sessionState.current,
    session: { ...sessionState.current.session, role },
  };
}

beforeEach(() => {
  router.replace.mockClear();
  document.cookie = "gt.app.v1=; max-age=0; path=/";
  setRole("admin");
  sessionState.current = { ...sessionState.current, isLoading: false };
});

afterEach(cleanup);

describe("/apps switchboard", () => {
  it("offers an admin both workspaces", () => {
    render(<AppsPage />);
    expect(screen.getByTestId("apps-card-factory")).toBeTruthy();
    expect(screen.getByTestId("apps-card-sales")).toBeTruthy();
  });

  it("sends a non-sales role straight on to the factory", () => {
    setRole("operator");
    render(<AppsPage />);
    expect(router.replace).toHaveBeenCalledWith("/home");
    expect(screen.queryByTestId("apps-card-sales")).toBeNull();
  });

  it("waits for the session before deciding anything", () => {
    sessionState.current = { ...sessionState.current, isLoading: true };
    render(<AppsPage />);
    // The provider reports viewer while loading; forwarding on that would
    // bounce an admin out of their own switchboard.
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("apps-card-sales")).toBeNull();
  });

  it("remembers the chosen workspace for next time", () => {
    render(<AppsPage />);
    act(() => {
      screen.getByTestId("apps-card-sales").click();
    });
    expect(document.cookie).toContain("gt.app.v1=sales");
  });

  it("honours a remembered choice without a second tap", () => {
    document.cookie = "gt.app.v1=sales; path=/";
    render(<AppsPage />);
    expect(router.replace).toHaveBeenCalledWith("/sales/today");
  });

  it("ignores a remembered sales choice once the role can no longer use it", () => {
    document.cookie = "gt.app.v1=sales; path=/";
    // operator, not planner: planner holds the sales axis since tranche 175, so
    // it is no longer an example of a role the cookie should be ignored for.
    // The behaviour under test is the cookie losing to the capability, which
    // needs a role that genuinely lacks it.
    setRole("operator");
    render(<AppsPage />);
    expect(router.replace).toHaveBeenCalledWith("/home");
  });
});
