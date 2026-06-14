// <QueryCountChip> — Tranche 067 (THEME B) tests.
//
// Coverage:
//   P1 — loading shows a skeleton, never "0 items"
//   P2 — error shows an em-dash count, never "0 items"
//   P3 — undefined count (settled but no data) shows em-dash, never "0 items"
//   P4 — a real count of 0 renders "0 items" (genuinely empty, not loading)
//   P5 — a real count renders the number + noun

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryCountChip } from "./QueryCountChip";

afterEach(() => {
  cleanup();
});

describe("QueryCountChip", () => {
  it("shows a skeleton (not '0 items') while loading", () => {
    render(<QueryCountChip isLoading count={undefined} noun="items" />);
    expect(screen.queryByText(/items/)).toBeNull();
    expect(screen.queryByText(/^0/)).toBeNull();
  });

  it("shows an em-dash count (not '0 items') on error", () => {
    render(
      <QueryCountChip isLoading={false} isError count={undefined} noun="items" />,
    );
    expect(screen.getByText(/—\s*items/)).toBeTruthy();
    expect(screen.queryByText("0 items")).toBeNull();
  });

  it("shows an em-dash count (not '0 items') when settled with no data", () => {
    render(
      <QueryCountChip isLoading={false} count={undefined} noun="items" />,
    );
    expect(screen.getByText(/—\s*items/)).toBeTruthy();
  });

  it("renders a genuine zero once data has loaded", () => {
    render(<QueryCountChip isLoading={false} count={0} noun="items" />);
    expect(screen.getByText(/0\s*items/)).toBeTruthy();
  });

  it("renders the real count and noun", () => {
    render(<QueryCountChip isLoading={false} count={42} noun="suppliers" />);
    expect(screen.getByText(/42\s*suppliers/)).toBeTruthy();
  });
});
