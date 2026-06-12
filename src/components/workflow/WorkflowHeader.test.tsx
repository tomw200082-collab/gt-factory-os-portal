// ---------------------------------------------------------------------------
// WorkflowHeader unit tests — Tranche 049 (VISUAL-010): the `size` prop.
//
// Coverage:
//   T1 — default size="page" keeps the original text-3xl sm:text-4xl scale
//   T2 — size="section" renders the smaller text-xl sm:text-2xl scale
//   T3 — eyebrow + description still render in section size
// ---------------------------------------------------------------------------

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WorkflowHeader } from "./WorkflowHeader";

afterEach(() => {
  cleanup();
});

describe("WorkflowHeader size prop", () => {
  it("T1 defaults to the page scale (text-3xl sm:text-4xl)", () => {
    render(<WorkflowHeader title="Dashboard" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Dashboard" });
    expect(h1.className).toContain("text-3xl");
    expect(h1.className).toContain("sm:text-4xl");
  });

  it("T2 renders the section scale when size='section'", () => {
    render(<WorkflowHeader title="Planning runs" size="section" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Planning runs" });
    expect(h1.className).toContain("text-xl");
    expect(h1.className).toContain("sm:text-2xl");
    expect(h1.className).not.toContain("text-3xl");
  });

  it("T3 still renders eyebrow and description in section size", () => {
    render(
      <WorkflowHeader
        title="Waste / Adjustment"
        eyebrow="Operator form"
        description="Report a loss or positive correction."
        size="section"
      />,
    );
    expect(screen.getByText("Operator form")).toBeDefined();
    expect(
      screen.getByText("Report a loss or positive correction."),
    ).toBeDefined();
  });
});
