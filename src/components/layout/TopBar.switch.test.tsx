// ---------------------------------------------------------------------------
// Tranche 163 — the operations → sales switch.
//
// The control is admin-only, and the whole point of the tranche is that it is
// reachable without typing a URL, so the cases that matter are: does the right
// role see it, do the other three see nothing, and does it point where it
// claims to.
//
//   T1 — admin sees the control, pointing at /sales/today
//   T2/T3/T4 — operator, planner and viewer see nothing at all
//   T5 — the accessible name survives the width at which the label is hidden
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Role } from "@/lib/contracts/enums";

// Only `role` is read by the component under test; the rest of the session
// shape is supplied so the mock stays structurally honest.
const currentRole = { value: "admin" as Role };
vi.mock("@/lib/auth/session-provider", () => ({
  useSession: () => ({
    session: {
      role: currentRole.value,
      display_name: "Test User",
      email: "test@example.com",
    },
    setRole: vi.fn(),
    isLoading: false,
  }),
}));

import { SalesSwitch } from "./TopBar";

function renderAs(role: Role) {
  currentRole.value = role;
  return render(<SalesSwitch />);
}

afterEach(() => {
  cleanup();
  currentRole.value = "admin";
});

describe("SalesSwitch", () => {
  it("T1 — renders for admin and points at the sales queue", () => {
    renderAs("admin");
    const link = screen.getByTestId("topbar-switch-sales");
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/sales/today");
  });

  for (const role of ["operator", "planner", "viewer"] as Role[]) {
    it(`renders nothing for ${role}`, () => {
      renderAs(role);
      expect(screen.queryByTestId("topbar-switch-sales")).toBeNull();
    });
  }

  it("T5 — keeps an accessible name at the width where the label is hidden", () => {
    renderAs("admin");
    // The visible word is `sm:`-gated, so on a phone the control is icon-only.
    // Without the aria-label it would reach a screen reader as an unnamed link.
    const link = screen.getByLabelText("Switch to the sales workspace");
    expect(link.getAttribute("data-testid")).toBe("topbar-switch-sales");
    const label = link.querySelector("span");
    expect(label?.className).toContain("hidden");
    expect(label?.className).toContain("sm:inline");
  });
});
