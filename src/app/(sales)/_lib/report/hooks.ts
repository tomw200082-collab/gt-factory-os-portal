"use client";

// Small browser hooks for the report. Everything that touches `window` lives here, so the
// computation modules stay pure and the screen renders without any of it.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { ReportTab } from "./types";

const TABS: readonly ReportTab[] = ["daily", "cust", "prod", "chain", "trend"];
/** The Artifact opens on the customers sheet. */
export const DEFAULT_TAB: ReportTab = "cust";
const TAB_KEY = "gt.sales.report.tab";

/** A CSS media query as a boolean. False on the server and before the first paint. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * The current time, ticking every `intervalMs` (a minute by default, for "updated N minutes ago").
 * A phone that slept, or a tab that was in the background, throttles timers: the clock is read again the
 * moment the viewer comes back, so "updated 12 minutes ago" is never an hour stale.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs]);
  return now;
}

/** The width of an element, kept current: charts draw in pixels so their text stays one size. */
export function useElementWidth<T extends HTMLElement>(fallback: number): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w0 = Math.round(el.getBoundingClientRect().width);
    if (w0 > 0) setWidth(w0);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref as RefObject<T>, width];
}

/**
 * A wide month table with a pinned first column. A month figure must never sit half under the pinned
 * column, so the table is tiled: the room beside the pinned column is divided into a whole number of equal
 * columns (`--s-rp-col`), the scroller snaps on their edges, and `--s-rp-pin` is the pinned column's
 * measured width (the snap line and scroll-padding). It opens on the newest end, which is a tile edge.
 */
export function usePinnedScroller(ref: RefObject<HTMLElement>, key: unknown): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>("th.s-rp-first");
    if (!first) return;
    const fit = () => {
      el.style.removeProperty("--s-rp-col");
      const pin = first.getBoundingClientRect().width;
      el.style.setProperty("--s-rp-pin", `${Math.round(pin)}px`);
      const heads = [...el.querySelectorAll<HTMLElement>("thead th:not(.s-rp-first)")];
      if (!heads.length) return;
      const widths = heads.map((h) => h.getBoundingClientRect().width);
      const room = el.clientWidth - pin;
      if (pin + widths.reduce((a, w) => a + w, 0) <= el.clientWidth + 1 || room <= 0) return; // it fits: nothing to tile
      const k = Math.max(1, Math.floor(room / Math.max(...widths)));
      const col = `${Math.round((room / k) * 100) / 100}px`;
      el.style.setProperty("--s-rp-col", col);
    };
    fit();
    const max = el.scrollWidth - el.clientWidth;
    if (max > 0) el.scrollLeft = getComputedStyle(el).direction === "rtl" ? -max : max;
    if (typeof ResizeObserver === "undefined") return;
    // only the scroller's own width matters (a rotation, a resized window); the pinned column's width follows from it
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === w) return;
      w = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, key]);
}

function readTab(): ReportTab | null {
  try {
    const v = window.localStorage.getItem(TAB_KEY);
    return TABS.includes(v as ReportTab) ? (v as ReportTab) : null;
  } catch {
    return null; // private window, blocked storage: the report works without it
  }
}

/**
 * The tab the viewer last had open, remembered on this device. Falls back to the Artifact's default.
 * Read once, before the first paint of the report: the report only mounts after its data arrives, so the
 * server render never depends on it, and there is no frame on the wrong tab.
 */
export function useReportTab(): [ReportTab, (tab: ReportTab) => void] {
  const [tab, setTab] = useState<ReportTab>(() => (typeof window === "undefined" ? DEFAULT_TAB : (readTab() ?? DEFAULT_TAB)));
  const choose = (next: ReportTab) => {
    setTab(next);
    try {
      window.localStorage.setItem(TAB_KEY, next);
    } catch {
      /* not remembering is fine */
    }
  };
  return [tab, choose];
}
