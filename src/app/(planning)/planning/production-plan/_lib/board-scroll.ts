// Tranche 054 (FLOW-001) — pure geometry helpers for the production week
// board's TODAY-lane auto-centering and the "Today" jump button.
//
// All inputs are plain numbers measured by the caller (clientWidth,
// scrollWidth, getBoundingClientRect deltas + scrollLeft), so these stay
// trivially unit-testable without a DOM.

export interface LaneGeometry {
  /** Visible width of the horizontal scroll container (clientWidth). */
  containerWidth: number;
  /** Full scrollable content width of the container (scrollWidth). */
  scrollWidth: number;
  /**
   * The lane's left edge in content coordinates:
   * laneRect.left - containerRect.left + container.scrollLeft.
   */
  laneLeft: number;
  /** The lane's rendered width. */
  laneWidth: number;
}

/**
 * True when the board actually overflows horizontally and scrolling is
 * meaningful. A 1px tolerance absorbs subpixel rounding so desktop layouts
 * that fit exactly are never jolted.
 */
export function boardOverflows(
  containerWidth: number,
  scrollWidth: number,
): boolean {
  return scrollWidth > containerWidth + 1;
}

/**
 * scrollLeft that horizontally centers the lane inside the container,
 * clamped to the valid scroll range [0, scrollWidth - containerWidth].
 */
export function centeredScrollLeft(g: LaneGeometry): number {
  const target = g.laneLeft + g.laneWidth / 2 - g.containerWidth / 2;
  const max = Math.max(0, g.scrollWidth - g.containerWidth);
  return Math.min(Math.max(0, Math.round(target)), max);
}

/**
 * True when the lane is COMPLETELY outside the visible viewport of the
 * container at the given scrollLeft. A partially visible lane counts as
 * in view (the operator can already see it).
 */
export function isLaneOutOfView(
  scrollLeft: number,
  g: Pick<LaneGeometry, "containerWidth" | "laneLeft" | "laneWidth">,
): boolean {
  const viewStart = scrollLeft;
  const viewEnd = scrollLeft + g.containerWidth;
  return g.laneLeft + g.laneWidth <= viewStart || g.laneLeft >= viewEnd;
}
