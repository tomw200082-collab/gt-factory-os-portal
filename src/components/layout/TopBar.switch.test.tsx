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

  it("T5 — is labelled at every width, phone included", () => {
    renderAs("admin");
    const link = screen.getByLabelText("Switch to the sales workspace");
    expect(link.getAttribute("data-testid")).toBe("topbar-switch-sales");

    // Tranche 163 gated the word behind `sm:`, so on a phone this was one
    // unlabelled glyph among six — and Tom reported the feature as missing the
    // same day it shipped. A control nobody can find is a control nobody has.
    const label = link.querySelector("span");
    expect(label?.textContent).toBe("Sales");
    expect(label?.className ?? "").not.toContain("hidden");
  });

  it("T6 — reads as a control, not as a bare glyph", () => {
    renderAs("admin");
    const link = screen.getByLabelText("Switch to the sales workspace");
    expect(link.className).toContain("border");
  });
});
