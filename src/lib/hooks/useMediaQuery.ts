"use client";

// ---------------------------------------------------------------------------
// useMediaQuery — SSR-safe media-query hook.
//
// Authored as substrate for Mode B-InventoryFlow (corridor amendment §C.4
// allow-list). Returns boolean for given media query; safely handles the
// SSR / pre-mount window where `window` is undefined.
//
// Caller should pair with a parallel `isMounted` flag to avoid hydration
// mismatch — render the same skeleton on first paint regardless of viewport.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

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
