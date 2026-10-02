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

/** The current time, ticking every `intervalMs` (a minute by default, for "updated N minutes ago"). */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
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

/** Scrolls a wide table to its newest end (the left, in a right-to-left page) when it mounts or `key` changes. */
export function useScrollToEnd(ref: RefObject<HTMLElement>, key: unknown): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    el.scrollLeft = getComputedStyle(el).direction === "rtl" ? -max : max;
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

/** The tab the viewer last had open, remembered on this device. Falls back to the Artifact's default. */
export function useReportTab(): [ReportTab, (tab: ReportTab) => void] {
  const [tab, setTab] = useState<ReportTab>(DEFAULT_TAB);
  useEffect(() => {
    const saved = readTab();
    if (saved) setTab(saved);
  }, []);
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
