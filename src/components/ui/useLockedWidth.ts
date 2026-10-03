"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

// useLayoutEffect warns during server render; there is nothing to measure there.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Keep a control the same width while it is pending, so swapping its icon for
 * a spinner never makes the row jump. The width is the one it had on the last
 * commit before `locked` turned true; `min-width` is set while locked and the
 * previous inline value is put back afterwards.
 *
 * `Button` uses it. Sales `.s-btn` buttons can use it too:
 *   const ref = useLockedWidth<HTMLButtonElement>(m.isPending);
 */
export function useLockedWidth<T extends HTMLElement>(
  locked: boolean,
  ref?: RefObject<T>,
): RefObject<T> {
  const own = useRef<T>(null);
  const target = ref ?? own;
  const lastWidth = useRef(0);

  // Track the natural width while not pending (runs on every commit).
  useIsoLayoutEffect(() => {
    const el = target.current;
    if (!locked && el) lastWidth.current = el.getBoundingClientRect().width;
  });

  useIsoLayoutEffect(() => {
    const el = target.current;
    const width = lastWidth.current;
    if (!locked || !el || !width) return;
    const previous = el.style.minWidth;
    el.style.minWidth = `${width}px`;
    return () => {
      el.style.minWidth = previous;
    };
  }, [locked, target]);

  return target;
}
