"use client";

// ---------------------------------------------------------------------------
// useNow — shared wall-clock ticker for the dashboard (Tranche 059, DASH-T1).
//
// Replaces the frozen `useMemo(() => new Date(), [])` so relative labels
// ("updated 5m ago", "Triggered 2h ago"), the greeting, and day-boundary
// math stay truthful while the tab is open across a whole shift.
//
// Design:
//   - ONE module-level interval serves every subscriber (the page plus any
//     future band component) — never one timer per component.
//   - Beats are skipped while the tab is hidden (no background churn); a
//     visibilitychange listener fires an immediate catch-up tick the moment
//     the operator returns, so they never read a stale label.
//   - Built on useSyncExternalStore for tear-free React 18 reads.
// ---------------------------------------------------------------------------

import { useMemo, useSyncExternalStore } from "react";

export const NOW_TICK_MS = 30_000;

let nowMs = Date.now();
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let visibilityHooked = false;

function emit(): void {
  nowMs = Date.now();
  listeners.forEach((l) => l());
}

function onVisibilityChange(): void {
  if (typeof document !== "undefined" && !document.hidden && listeners.size > 0) {
    emit();
  }
}

function ensureTicker(): void {
  if (intervalId === null) {
    intervalId = setInterval(() => {
      // Skip beats while hidden; the visibility listener below catches the
      // tab back up the moment it becomes visible again.
      if (typeof document !== "undefined" && document.hidden) return;
      emit();
    }, NOW_TICK_MS);
  }
  if (!visibilityHooked && typeof document !== "undefined") {
    visibilityHooked = true;
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
}

function subscribe(listener: () => void): () => void {
  // First subscriber after an idle period: refresh the snapshot so the
  // initial render reads the real current time, not the module-load time.
  if (listeners.size === 0) nowMs = Date.now();
  listeners.add(listener);
  ensureTicker();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot(): number {
  return nowMs;
}

/** Current time as a Date, ticking every NOW_TICK_MS while the tab is visible. */
export function useNow(): Date {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => new Date(ms), [ms]);
}
