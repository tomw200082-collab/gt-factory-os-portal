"use client";

// NavigationLoader — shows GTLoader during client-side navigation.
//
// Problem: Next.js App Router's loading.tsx only triggers when a Server
// Component suspends. Because this portal fetches data client-side via
// TanStack Query, pages never suspend and loading.tsx is never shown.
// This component solves the problem by intercepting <a> clicks directly
// and showing the loader until the new pathname is committed.
//
// The loader's world (factory / GT Pulse) is chosen from the DESTINATION at
// click time, so a link into /sales shows the sales loader before the sales
// layout has mounted. Clicks that do not navigate this tab in place (modified
// or non-primary clicks, new-tab targets, downloads, external links, and links
// that keep the same pathname) never show it: usePathname() would not change
// and the loader would stick until the safety valve.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  GTLoader,
  GT_LOADER_ENTRANCE_MS,
  GT_LOADER_EXIT_MS,
} from "./GTLoader";
import { loaderVariantFor, type LoaderVariant } from "./loader-variant";

const SAFETY_MS = 6000;

type Shown = { id: number; variant: LoaderVariant; leaving: boolean };

/** Pathname without a trailing slash (except the root), for comparisons. */
function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function NavigationLoader() {
  const pathname = usePathname();
  const [shown, setShown] = useState<Shown | null>(null);
  // Mirror of `shown` for the timer callbacks and the click listener, which
  // must read the latest value without re-subscribing.
  const shownRef = useRef<Shown | null>(null);
  const shownAtRef = useRef(0);
  const nextIdRef = useRef(1);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPathRef = useRef(pathname);

  const set = useCallback((next: Shown | null) => {
    shownRef.current = next;
    setShown(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (safetyRef.current) clearTimeout(safetyRef.current);
    if (unmountRef.current) clearTimeout(unmountRef.current);
    safetyRef.current = null;
    unmountRef.current = null;
  }, []);

  // Fade out, then unmount.
  const hide = useCallback(() => {
    const cur = shownRef.current;
    if (!cur || cur.leaving) return;
    clearTimers();
    // Still inside the invisible entrance window: nothing has been seen, so
    // remove it outright rather than letting it fade in while it fades out.
    if (Date.now() - shownAtRef.current < GT_LOADER_ENTRANCE_MS) {
      set(null);
      return;
    }
    set({ ...cur, leaving: true });
    unmountRef.current = setTimeout(() => {
      unmountRef.current = null;
      set(null);
    }, GT_LOADER_EXIT_MS);
  }, [clearTimers, set]);

  const show = useCallback(
    (variant: LoaderVariant) => {
      clearTimers();
      const cur = shownRef.current;
      if (cur && !cur.leaving) {
        // Already up: retarget the world, keep the same overlay (no restart).
        set({ ...cur, variant });
      } else {
        shownAtRef.current = Date.now();
        set({ id: nextIdRef.current++, variant, leaving: false });
      }
      // Safety valve: always hide after 6 s even if navigation never completes.
      safetyRef.current = setTimeout(hide, SAFETY_MS);
    },
    [clearTimers, hide, set],
  );

  // Intercept any same-origin <a> click before navigation fires.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Modified and non-primary clicks open a new tab or window.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor) return;

      const linkTarget = anchor.getAttribute("target");
      if (linkTarget && linkTarget !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href") ?? "";
      // Only internal pathname links: starts with "/", not protocol-relative.
      if (!href.startsWith("/") || href.startsWith("//")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same page (query- or hash-only change): usePathname() will not change,
      // so the loader would never be told to hide.
      if (normalize(url.pathname) === normalize(pathname ?? "")) return;

      show(loaderVariantFor(url.pathname));
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () =>
      document.removeEventListener("click", handleClick, { capture: true });
  }, [pathname, show]);

  // Fade out once Next.js commits the new pathname.
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      hide();
    }
  }, [pathname, hide]);

  // Cleanup on unmount.
  useEffect(() => clearTimers, [clearTimers]);

  if (!shown) return null;
  return <GTLoader key={shown.id} variant={shown.variant} leaving={shown.leaving} />;
}
