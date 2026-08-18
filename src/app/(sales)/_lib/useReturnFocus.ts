"use client";

import { useEffect, useRef } from "react";

/**
 * Remembers what was focused when a dialog opened and puts focus back there
 * when it closes.
 *
 * The trap keeps Tab inside while the dialog is open; this is its other half.
 * Without it the closing dialog takes the focused element with it, the browser
 * drops focus to <body>, and someone working by keyboard 100 rows into a table
 * has to tab from the document root to find their place again.
 */
export function useReturnFocus(): void {
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    return () => {
      // The element can be gone by now — a row that scrolled out of a
      // re-rendered list — so this is best-effort by design.
      opener.current?.focus?.();
    };
  }, []);
}
