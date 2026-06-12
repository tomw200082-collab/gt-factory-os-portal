// ---------------------------------------------------------------------------
// SectionHeading unit tests — Tranche 049 (VISUAL-013).
//
// Coverage:
//   T1 — renders eyebrow + h2 title + description
//   T2 — omits eyebrow and description when not provided
//   T3 — title renders as an h2 (heading level preserved from the canonical
//        dashboard pattern this component was extracted from)
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SectionHeading } from "./SectionHeading";

afterEach(() => {
  cleanup();
});

describe("SectionHeading", () => {
  it("T1 renders eyebrow, title and description", () => {
    render(
      <SectionHeading
        eyebrow="Operational trends"
        title="The last 14 days at a glance"
        description="A shared range selector drives all charts."
      />,
    );
    expect(screen.getByText("Operational trends")).toBeDefined();
    expect(
      screen.getByRole("heading", { level: 2, name: "The last 14 days at a glance" }),
    ).toBeDefined();
    expect(
      screen.getByText("A shared range selector drives all charts."),
    ).toBeDefined();
  });

  it("T2 omits eyebrow and description when not provided", () => {
    const { container } = render(<SectionHeading title="Only a title" />);
    expect(screen.getByRole("heading", { level: 2, name: "Only a title" })).toBeDefined();
    // Only the h2 should be rendered inside the wrapper.
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.children.length).toBe(1);
    expect(wrapper.children[0]?.tagName).toBe("H2");
  });

  it("T3 renders the title as a level-2 heading", () => {
    render(<SectionHeading eyebrow="Eyebrow" title="Heading" />);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.textContent).toBe("Heading");
  });
});
