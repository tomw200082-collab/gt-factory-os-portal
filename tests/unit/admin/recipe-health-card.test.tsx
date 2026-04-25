// Recipe-Health card + RecipeTrackSummary tests.
// Uses the codebase idiom of queryByText / getByText with toBeTruthy()
// (no @testing-library/jest-dom matchers wired into vitest setup).

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RecipeTrackSummary } from "@/components/admin/recipe-health/RecipeTrackSummary";
import type { TrackHealth } from "@/lib/admin/recipe-readiness.types";

afterEach(() => cleanup());

function track(over: Partial<TrackHealth> = {}): TrackHealth {
  return {
    color: "green",
    hasActiveVersion: true,
    lineCount: 5,
    warnings: [],
    blockers: [],
    ...over,
  };
}

describe("RecipeTrackSummary", () => {
  it("renders the track label and version metadata when active version exists", () => {
    render(
      <RecipeTrackSummary
        trackLabel="בסיס המוצר"
        activeVersionLabel="v3"
        health={track({ lineCount: 12 })}
      />,
    );
    expect(screen.getByText("בסיס המוצר")).toBeTruthy();
    expect(screen.getByText(/v3/)).toBeTruthy();
    expect(screen.getByText(/12/)).toBeTruthy();
  });

  it("renders 'אין גרסה פעילה' when hasActiveVersion is false", () => {
    render(
      <RecipeTrackSummary
        trackLabel="בסיס המוצר"
        activeVersionLabel={null}
        health={track({
          color: "red",
          hasActiveVersion: false,
          lineCount: 0,
          blockers: ["אין גרסה פעילה ל-בסיס המוצר"],
        })}
      />,
    );
    // Status line + blocker bullet both surface "אין גרסה פעילה" — getAllBy.
    expect(screen.getAllByText(/אין גרסה פעילה/).length).toBeGreaterThan(0);
  });

  it("renders warnings list when track is yellow", () => {
    render(
      <RecipeTrackSummary
        trackLabel="אריזת המוצר"
        activeVersionLabel="v2"
        health={track({
          color: "yellow",
          warnings: ["2 חומרים חסרי ספק ראשי", "חומר אחד עם מחיר ישן"],
        })}
      />,
    );
    // The list bullet renders "⚠ <text>", so use a flexible regex.
    expect(screen.getByText(/2 חומרים חסרי ספק ראשי/)).toBeTruthy();
    expect(screen.getByText(/חומר אחד עם מחיר ישן/)).toBeTruthy();
  });

  it("renders blockers list when track is red", () => {
    render(
      <RecipeTrackSummary
        trackLabel="אריזת המוצר"
        activeVersionLabel="v2"
        health={track({ color: "red", blockers: ["אריזת המוצר ריק (0 שורות)"] })}
      />,
    );
    expect(screen.getByText(/ריק \(0 שורות\)/)).toBeTruthy();
  });

  it("applies a color-keyed data attribute so visual tests can target it", () => {
    const { container } = render(
      <RecipeTrackSummary
        trackLabel="בסיס המוצר"
        activeVersionLabel="v3"
        health={track({ color: "yellow", warnings: ["w1"] })}
      />,
    );
    expect(container.querySelector('[data-track-color="yellow"]')).not.toBeNull();
  });
});
