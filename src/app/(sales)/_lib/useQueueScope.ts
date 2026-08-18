"use client";

// Whose queue is on screen.
//
// The backend has scoped the Today queue by assignee since v1 — "mine or
// unclaimed" — and nothing ever sent the parameter (audit P0-2). This is the
// switch, and it remembers, because the answer to "whose queue am I looking
// at" should not reset every time the app is reopened.

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sales.queueScope";

export type QueueScope = "all" | "mine";

export function useQueueScope(): [QueueScope, (next: QueueScope) => void] {
  // Starts "all" on the server and on the first client render, so the markup
  // matches; the stored preference is applied after mount.
  const [scope, setScope] = useState<QueueScope>("all");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "mine" || stored === "all") setScope(stored);
    } catch {
      /* private mode: the toggle simply will not persist */
    }
  }, []);

  const update = useCallback((next: QueueScope) => {
    setScope(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* as above */
    }
  }, []);

  return [scope, update];
}
