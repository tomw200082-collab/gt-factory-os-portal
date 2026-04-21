// ---------------------------------------------------------------------------
// ReadinessCard unit tests — AMMC v1 Slice 3.
//
// Coverage:
//   T1 — renders the green tone + "Ready for operations" when is_ready=true + no blockers
//   T2 — renders the red tone + blockers list + Fix-now buttons when is_ready=false
//   T3 — Fix-now button fires onClick callback
//   T4 — Fix-now href renders as <a> (not button) when href is supplied
//   T5 — yellow tone when is_ready=true but blockers.length > 0
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadinessCard } from "./ReadinessCard";

afterEach(() => {
  cleanup();
});

describe("ReadinessCard", () => {
  it("T1 renders green pill when is_ready=true and blockers is empty", () => {
    render(
      <ReadinessCard
        readiness={{ is_ready: true, blockers: [] }}
        entity="item"
      />,
    );
    expect(screen.getByTestId("readiness-card-green")).toBeDefined();
    expect(screen.getByTestId("readiness-card-no-blockers")).toBeDefined();
  });

  it("T2 renders red tone + blockers list when is_ready=false", () => {
    render(
      <ReadinessCard
        readiness={{
          is_ready: false,
          blockers: [
            {
              code: "no_active_bom",
              label: "No active BOM version",
              detail: "This MANUFACTURED item has no active bom_version.",
              fixAction: {
                label: "Publish draft",
                onClick: () => {},
              },
            },
            {
              code: "missing_required_policy",
              label: "Missing required policy key: planning.horizon_weeks",
            },
          ],
        }}
        entity="item"
      />,
    );
    expect(screen.getByTestId("readiness-card-red")).toBeDefined();
    expect(screen.getByTestId("readiness-blocker-no_active_bom")).toBeDefined();
    expect(
      screen.getByTestId("readiness-blocker-missing_required_policy"),
    ).toBeDefined();
    // Fix-now button for the first blocker
    expect(screen.getByTestId("readiness-fix-no_active_bom")).toBeDefined();
  });

  it("T3 Fix-now button fires the onClick callback", async () => {
    const onClick = vi.fn();
    render(
      <ReadinessCard
        readiness={{
          is_ready: false,
          blockers: [
            {
              code: "missing_price",
              label: "Supplier-item has no price",
              fixAction: { label: "Edit price", onClick },
            },
          ],
        }}
        entity="supplier_item"
      />,
    );
    await userEvent.click(screen.getByTestId("readiness-fix-missing_price"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("T4 Fix-now renders as <a> when href is supplied", () => {
    render(
      <ReadinessCard
        readiness={{
          is_ready: false,
          blockers: [
            {
              code: "empty_version",
              label: "BOM version is empty",
              fixAction: {
                label: "Open editor",
                href: "/admin/boms/HEAD_X/versions/V1",
              },
            },
          ],
        }}
        entity="bom_version"
      />,
    );
    const fix = screen.getByTestId("readiness-fix-empty_version");
    expect(fix.tagName).toBe("A");
    expect(fix.getAttribute("href")).toBe("/admin/boms/HEAD_X/versions/V1");
  });

  it("T5 yellow tone when is_ready=true but blockers is non-empty (advisory)", () => {
    render(
      <ReadinessCard
        readiness={{
          is_ready: true,
          blockers: [
            {
              code: "ambiguous_primary",
              label: "Multiple is_primary markers (advisory)",
            },
          ],
        }}
        entity="component"
      />,
    );
    expect(screen.getByTestId("readiness-card-yellow")).toBeDefined();
  });
});
