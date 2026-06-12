"use client";

// ---------------------------------------------------------------------------
// useMediaQuery — SSR-safe media-query hook.
//
// Authored as substrate for Mode B-InventoryFlow (corridor amendment §C.4
// allow-list). Returns `boolean | null` for the given media query: `null`
// while unresolved (SSR + the first client render, before the effect has
// read `window.matchMedia`), then the live boolean.
//
// Tranche 057 (FLOW-M01): the return type widened from `boolean` to
// `boolean | null` so callers can keep rendering a skeleton until the
// viewport is actually known, instead of defaulting to the desktop branch.
// `null` is falsy, so existing truthiness checks (`isMobile ? A : B`)
// keep their previous pre-resolution behaviour unchanged.
//
// Caller should pair with a parallel `isMounted` flag (or check `=== null`)
// to avoid hydration mismatch — render the same skeleton on first paint
// regardless of viewport.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
