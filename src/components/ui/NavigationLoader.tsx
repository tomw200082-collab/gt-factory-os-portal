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
//
// One continuous surface (UX gate L1). Root loading.tsx and the RoleGate
// fallback mount their own GTLoader (tagged data-gt-loader-boundary) once the
// pathname commits. This overlay therefore does NOT start its exit at the
// commit while any such boundary is on screen: it stays opaque, and leaves only
// when the last one is gone, so the user never sees a gap, a dip, or a cut.
// The 6 s safety valve still ends it regardless.
//
// Inside one world there is no overlay (tranche 206). A link that stays in the
// same world as the current page (factory to factory, sales to sales) keeps the
// shell mounted and usable and shows a 2 px bar along the top edge instead, in
// the world's accent. The bar appears only if the commit takes longer than
// 120 ms, creeps towards 80 %, completes and fades when the pathname commits,
// and <main> carries aria-busy while the navigation is pending. The GT overlay
// above is kept, unchanged, for a move across worlds, where the shell itself
// changes. Programmatic router.push() calls get no indicator.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  GTLoader,
  GT_LOADER_ENTRANCE_MS,
  GT_LOADER_REMOVE_MS,
} from "./GTLoader";
import { loaderVariantFor, type LoaderVariant } from "./loader-variant";

const SAFETY_MS = 6000;
/** The bar stays invisible this long, so a fast navigation never flashes it. */
export const NAV_BAR_DELAY_MS = 120;
/** Mirrors the done-state fade in globals.css (.gt-navbar, --motion-fast). */
export const NAV_BAR_FADE_MS = 140;
/** The fade starts a frame or two after the state change; remove with slack. */
const NAV_BAR_REMOVE_MS = NAV_BAR_FADE_MS + 100;
const WATCH_POLL_MS = 50;

/** A route-boundary loader that is on screen and not itself on its way out. */
const BOUNDARY_SELECTOR = ".gt-loader[data-gt-loader-boundary]:not([data-leaving])";
const hasBoundary = () => document.querySelector(BOUNDARY_SELECTOR) !== null;

// useLayoutEffect warns during server render; there is nothing to take over there.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * How long a server-rendered loader has been running: its real animation clock
 * when the browser exposes it, otherwise the age of the page (its HTML is what
 * started it).
 */
function elapsedOf(loader: HTMLElement): number {
  const anim =
    typeof loader.getAnimations === "function"
      ? loader.getAnimations().find((a) => (a as CSSAnimation).animationName === "gt-loader-in")
      : undefined;
  const t = anim?.currentTime;
  return typeof t === "number" ? t : performance.now();
}

/** Tags that carry no page content, and the route announcer (it must keep speaking). */
const SKIP_INERT = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "NEXT-ROUTE-ANNOUNCER"]);

/**
 * Make everything except the overlay's own ancestor chain inert, so focus and
 * taps cannot reach the page hidden behind it. Returns the elements it changed
 * (never touching anything that was already inert).
 */
function inertEverythingElse(overlay: Element): Element[] {
  const changed: Element[] = [];
  let node: Element = overlay;
  while (node.parentElement && node !== document.body) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || SKIP_INERT.has(sibling.tagName)) continue;
      if (sibling.hasAttribute("inert")) continue;
      sibling.setAttribute("inert", "");
      changed.push(sibling);
    }
    node = node.parentElement;
  }
  return changed;
}

type Shown = { id: number; variant: LoaderVariant; leaving: boolean };
type Bar = { id: number; world: LoaderVariant };
type BarPhase = "idle" | "pending" | "visible" | "done";

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
  const watcherRef = useRef<MutationObserver | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The in-world progress bar (tranche 206). Its phase lives in a ref so the
  // click listener and the timers read the latest value without re-subscribing.
  const [bar, setBar] = useState<Bar | null>(null);
  const barPhaseRef = useRef<BarPhase>("idle");
  const barElRef = useRef<HTMLDivElement | null>(null);
  const barNextIdRef = useRef(1);
  const barDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barSafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barRemoveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The <main> this navigation marked busy, so only that attribute is removed.
  const busyMainRef = useRef<Element | null>(null);

  const set = useCallback((next: Shown | null) => {
    shownRef.current = next;
    setShown(next);
  }, []);

  const stopWatching = useCallback(() => {
    watcherRef.current?.disconnect();
    watcherRef.current = null;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    if (safetyRef.current) clearTimeout(safetyRef.current);
    if (unmountRef.current) clearTimeout(unmountRef.current);
    safetyRef.current = null;
    unmountRef.current = null;
    stopWatching();
  }, [stopWatching]);

  const clearBarTimers = useCallback(() => {
    if (barDelayRef.current) clearTimeout(barDelayRef.current);
    if (barSafetyRef.current) clearTimeout(barSafetyRef.current);
    if (barRemoveRef.current) clearTimeout(barRemoveRef.current);
    barDelayRef.current = null;
    barSafetyRef.current = null;
    barRemoveRef.current = null;
  }, []);

  const markBusy = useCallback(() => {
    if (busyMainRef.current) return;
    const main = document.querySelector("main");
    if (main && !main.hasAttribute("aria-busy")) {
      main.setAttribute("aria-busy", "true");
      busyMainRef.current = main;
    }
  }, []);

  const clearBusy = useCallback(() => {
    busyMainRef.current?.removeAttribute("aria-busy");
    busyMainRef.current = null;
  }, []);

  // Remove the bar outright (a cross-world click is taking over, or unmount).
  const dropBar = useCallback(() => {
    clearBarTimers();
    clearBusy();
    barPhaseRef.current = "idle";
    setBar(null);
  }, [clearBarTimers, clearBusy]);

  // The navigation ended (commit, abandoned click, or the safety valve):
  // complete the bar and fade it, or, if it was never shown, just clear busy.
  const completeBar = useCallback(() => {
    const phase = barPhaseRef.current;
    if (phase === "idle" || phase === "done") return;
    if (barDelayRef.current) clearTimeout(barDelayRef.current);
    if (barSafetyRef.current) clearTimeout(barSafetyRef.current);
    barDelayRef.current = null;
    barSafetyRef.current = null;
    clearBusy();
    if (phase === "pending") {
      barPhaseRef.current = "idle";
      return;
    }
    barPhaseRef.current = "done";
    barElRef.current?.setAttribute("data-state", "done");
    barRemoveRef.current = setTimeout(() => {
      barRemoveRef.current = null;
      barPhaseRef.current = "idle";
      setBar(null);
    }, NAV_BAR_REMOVE_MS);
  }, [clearBusy]);

  const startBar = useCallback(
    (world: LoaderVariant) => {
      const phase = barPhaseRef.current;
      if (phase === "pending" || phase === "visible") {
        // Already under way: keep the same bar, restart only the safety valve.
        if (barSafetyRef.current) clearTimeout(barSafetyRef.current);
        barSafetyRef.current = setTimeout(completeBar, SAFETY_MS);
        return;
      }
      clearBarTimers();
      setBar(null);
      barPhaseRef.current = "pending";
      markBusy();
      barDelayRef.current = setTimeout(() => {
        barDelayRef.current = null;
        barPhaseRef.current = "visible";
        setBar({ id: barNextIdRef.current++, world });
      }, NAV_BAR_DELAY_MS);
      barSafetyRef.current = setTimeout(completeBar, SAFETY_MS);
    },
    [clearBarTimers, completeBar, markBusy],
  );

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
    }, GT_LOADER_REMOVE_MS);
  }, [clearTimers, set]);

  // The new pathname has committed: leave now, unless a route-boundary loader is
  // still covering the page, in which case wait for the last one to go.
  const exitWhenClear = useCallback(() => {
    const cur = shownRef.current;
    if (!cur || cur.leaving || watcherRef.current) return;
    if (!hasBoundary()) {
      hide();
      return;
    }
    const check = () => {
      if (hasBoundary()) return;
      stopWatching();
      hide();
    };
    const watcher = new MutationObserver(check);
    watcher.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-leaving"],
    });
    watcherRef.current = watcher;
    // Belt and braces: a missed record (or a boundary removed in a way the
    // observer does not report) must not strand the overlay until the valve.
    pollRef.current = setInterval(check, WATCH_POLL_MS);
  }, [hide, stopWatching]);

  const show = useCallback(
    (variant: LoaderVariant, startedAt?: number) => {
      clearTimers();
      const cur = shownRef.current;
      if (cur && !cur.leaving) {
        // Already up: retarget the world, keep the same overlay (no restart).
        set({ ...cur, variant });
      } else {
        shownAtRef.current = startedAt ?? Date.now();
        set({ id: nextIdRef.current++, variant, leaving: false });
      }
      // Safety valve: always hide after 6 s even if navigation never completes.
      safetyRef.current = setTimeout(hide, SAFETY_MS);
    },
    [clearTimers, hide, set],
  );

  // A hard load of a route whose server HTML already carries a boundary loader
  // (the RoleGate fallback on /sales/*): take over from it before the first
  // paint. React will suspend, hide that loader and mount root loading.tsx's own
  // (each restarting its invisible phase), then remove them all in one commit;
  // this overlay bridges that and supplies the fade-out. Runs once, at mount.
  useIsoLayoutEffect(() => {
    if (shownRef.current) return;
    const server = document.querySelector<HTMLElement>(BOUNDARY_SELECTOR);
    if (!server) return;
    show(
      server.getAttribute("data-variant") === "sales" ? "sales" : "factory",
      Date.now() - elapsedOf(server),
    );
    exitWhenClear();
  }, []);

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
      if (normalize(url.pathname) === normalize(pathname ?? "")) {
        // If an overlay is up for a navigation this click just abandoned, no
        // commit is coming: let it go now rather than at the 6 s valve.
        hide();
        // Same for a bar left pending by a navigation this click abandoned.
        completeBar();
        return;
      }

      const destination = loaderVariantFor(url.pathname);
      const overlayUp = shownRef.current !== null && !shownRef.current.leaving;
      if (destination !== loaderVariantFor(pathname ?? "") || overlayUp) {
        // Across worlds the shell itself changes: the GT overlay. If one is
        // already up it simply re-targets, so there is never a second surface.
        dropBar();
        show(destination);
        return;
      }
      startBar(destination);
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () =>
      document.removeEventListener("click", handleClick, { capture: true });
  }, [pathname, show, hide, completeBar, dropBar, startBar]);

  // Fade out once Next.js commits the new pathname (and no boundary remains).
  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      exitWhenClear();
      completeBar();
    }
  }, [pathname, exitWhenClear, completeBar]);

  // A freshly mounted bar starts at its first frame, then creeps: the start
  // state is flushed so the CSS transition has something to run from.
  const barId = bar?.id;
  useIsoLayoutEffect(() => {
    const el = barElRef.current;
    if (!el || barPhaseRef.current !== "visible") return;
    void el.getBoundingClientRect();
    el.setAttribute("data-state", "creep");
  }, [barId]);

  // While the overlay is visibly up, the page behind it is inert. It is not
  // inert in the first 120 ms (nothing is shown yet, and a fast navigation
  // should never have cost the user their focus) and is released as the exit
  // starts, so the page is usable while the overlay fades.
  const active = shown !== null && !shown.leaving;
  const activeId = shown?.id;
  useEffect(() => {
    if (!active) return;
    let changed: Element[] = [];
    const delay = Math.max(0, GT_LOADER_ENTRANCE_MS - (Date.now() - shownAtRef.current));
    const id = setTimeout(() => {
      const overlay = document.querySelector(".gt-loader[data-gt-loader-nav]");
      if (overlay) changed = inertEverythingElse(overlay);
    }, delay);
    return () => {
      clearTimeout(id);
      for (const el of changed) el.removeAttribute("inert");
    };
  }, [active, activeId]);

  // Cleanup on unmount.
  useEffect(() => clearTimers, [clearTimers]);
  useEffect(
    () => () => {
      clearBarTimers();
      clearBusy();
    },
    [clearBarTimers, clearBusy],
  );

  return (
    <>
      {shown ? (
        <GTLoader
          key={shown.id}
          variant={shown.variant}
          leaving={shown.leaving}
          nav
          startedAt={shownAtRef.current}
        />
      ) : null}
      {bar ? (
        <div
          key={bar.id}
          ref={barElRef}
          className="gt-navbar"
          data-gt-navbar=""
          data-world={bar.world}
          data-state="start"
          aria-hidden="true"
        >
          <span className="gt-navbar__bar" />
        </div>
      ) : null}
    </>
  );
}
