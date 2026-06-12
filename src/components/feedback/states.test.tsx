// ---------------------------------------------------------------------------
// Shared feedback states unit tests — Tranche 049 (VISUAL-014).
//
// Covers the components moved from the dashboard page into this module:
//   T1 — AllClearRibbon renders title + description inside the dash-allclear shell
//   T2 — SkeletonRow renders three shimmer cells
//   T3 — ErrorAlert renders label, role="alert", and a Retry button that
//        fires onRetry
//   T4 — Skel honors height/width props
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AllClearRibbon, ErrorAlert, Skel, SkeletonRow } from "./states";

afterEach(() => {
  cleanup();
});

describe("AllClearRibbon", () => {
  it("T1 renders title and description in the dash-allclear shell", () => {
    const { container } = render(
      <AllClearRibbon
        title="All clear · no critical issues today."
        description="Nothing to act on."
      />,
    );
    expect(
      screen.getByText("All clear · no critical issues today."),
    ).toBeDefined();
    expect(screen.getByText("Nothing to act on.")).toBeDefined();
    expect(container.querySelector(".dash-allclear")).not.toBeNull();
    expect(container.querySelector(".dash-allclear-icon")).not.toBeNull();
  });
});

describe("SkeletonRow", () => {
  it("T2 renders three shimmer cells", () => {
    const { container } = render(<SkeletonRow />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.children.length).toBe(3);
  });
});

describe("ErrorAlert", () => {
  it("T3 renders label with role=alert and fires onRetry", async () => {
    const onRetry = vi.fn();
    render(<ErrorAlert label="Recent movements unavailable." onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Recent movements unavailable.");
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("Skel", () => {
  it("T4 honors height and width props", () => {
    const { container } = render(<Skel h={12} w={80} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.height).toBe("12px");
    expect(el.style.width).toBe("80px");
  });
});
