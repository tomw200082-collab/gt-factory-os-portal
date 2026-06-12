// Tranche 059 (DASH-T2) — CountUp first-paint roll vs prev→new tween.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import { CountUp } from "./CountUp";

function setReducedMotion(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** Extract the numeric part of the rendered text (e.g. "₪ 1,250" → 1250). */
function shownNumber(el: HTMLElement): number {
  const m = el.textContent?.match(/-?[\d.,]+/);
  if (!m) throw new Error(`no number in "${el.textContent}"`);
  return Number(m[0].replace(/,/g, ""));
}

describe("CountUp", () => {
  beforeEach(() => {
    setReducedMotion(false);
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
        "performance",
        "requestAnimationFrame",
        "cancelAnimationFrame",
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders dash passthrough unchanged", () => {
    render(<CountUp value="—" />);
    expect(screen.getByText("—")).toBeDefined();
  });

  it("first paint rolls from 0 and lands exactly on the target string", () => {
    const { container } = render(<CountUp value="₪ 1,250" durationMs={400} />);
    const el = container.firstElementChild as HTMLElement;
    // Starts at the zero-formatted value, not the target.
    expect(shownNumber(el)).toBe(0);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(el.textContent).toBe("₪ 1,250");
  });

  it("a value change tweens from the previous number, never from 0", () => {
    const { container, rerender } = render(
      <CountUp value="100" durationMs={200} />,
    );
    const el = container.firstElementChild as HTMLElement;
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(el.textContent).toBe("100");

    rerender(<CountUp value="200" durationMs={200} />);
    // One frame into the change tween: already at or above the previous
    // value — the honest prev→new path (a 0-restart would show < 100).
    act(() => {
      vi.advanceTimersByTime(32);
    });
    expect(shownNumber(el)).toBeGreaterThanOrEqual(100);
    expect(shownNumber(el)).toBeLessThanOrEqual(200);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(el.textContent).toBe("200");
  });

  it("reduced motion renders the final value immediately", () => {
    setReducedMotion(true);
    const { container } = render(<CountUp value="₪ 9,000" />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect((container.firstElementChild as HTMLElement).textContent).toBe(
      "₪ 9,000",
    );
  });
});
