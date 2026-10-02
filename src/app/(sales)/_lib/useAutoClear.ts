"use client";

import { useEffect } from "react";

/** Clears a transient message after `ms`, as the shell does for its own toast (§9: 4.5s). */
export function useAutoClear(value: unknown, clear: () => void, ms = 4500): void {
  useEffect(() => {
    if (!value) return;
    const id = setTimeout(clear, ms);
    return () => clearTimeout(id);
  }, [value, clear, ms]);
}
