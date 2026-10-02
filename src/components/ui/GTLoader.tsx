"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
} from "react";
import { usePathname } from "next/navigation";
import { loaderVariantFor, type LoaderVariant } from "./loader-variant";

// GTLoader — one loading system, two worlds (tranche 201).
//
// The same calm composition renders for the factory portal and for GT Pulse
// (/sales/*): the cropped GT mark, one thin orbit, a breathing glow, a
// glyph-only light sweep, a small label and a 2 px travelling progress line.
// Only the palette differs; it is set by [data-variant] in globals.css
// (.gt-loader). Entrance, exit and reduced motion are CSS-only as well.
//
// Two kinds of instance can be on screen for one navigation, and they must read
// as ONE surface (tranche 201, UX gate L1):
//   - the NavigationLoader overlay (`nav`), which covers the click-to-commit gap;
//   - a route-boundary loader (`boundary`): root loading.tsx, or the RoleGate
//     fallback while the session loads.
// The overlay stays up until no boundary remains (see NavigationLoader), and a
// boundary that mounts under a running overlay adopts the overlay's clock
// (--gt-elapsed) so every animation lands on the same frame rather than
// restarting its 120 ms invisible phase.

/** Mirrors of the CSS timings in globals.css (.gt-loader). */
export const GT_LOADER_ENTRANCE_MS = 120;
export const GT_LOADER_EXIT_MS = 180;
/**
 * When a leaving loader is removed from the DOM. The fade is 180 ms but starts a
 * frame or two after the state change, so removing on the dot would cut it short
 * while it is still visibly fading (measured: a jump from ~0.4 to 0).
 */
export const GT_LOADER_REMOVE_MS = GT_LOADER_EXIT_MS + 100;

const COPY: Record<
  LoaderVariant,
  {
    label: string;
    name: string;
    lang: string | undefined;
    slow: string;
    reload: string;
  }
> = {
  factory: {
    label: "GT FACTORY OS",
    name: "Loading GT Factory OS",
    lang: undefined,
    slow: "Taking longer than usual",
    reload: "Reload",
  },
  sales: {
    label: "GT CRM",
    name: "טוען את GT CRM",
    lang: "he",
    slow: "לוקח יותר זמן מהרגיל",
    reload: "טעינה מחדש",
  },
};

// useLayoutEffect warns during server render; the server has no overlay to join.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function GTLoader({
  variant,
  leaving = false,
  message,
  nav = false,
  startedAt,
  boundary = false,
  slowAfterMs,
}: {
  /** Which world to show. Defaults to the one the current pathname belongs to. */
  variant?: LoaderVariant;
  /** Fade out (180 ms); the parent unmounts it afterwards. */
  leaving?: boolean;
  /** Replaces the small label under the orbit. */
  message?: string;
  /** The NavigationLoader overlay. `startedAt` (Date.now()) lets boundaries join it. */
  nav?: boolean;
  startedAt?: number;
  /** A route-boundary or fallback loader: the overlay waits for these to go. */
  boundary?: boolean;
  /** After this many ms offer "taking longer than usual" and a Reload button. */
  slowAfterMs?: number;
}) {
  const pathname = usePathname();
  const resolved = variant ?? loaderVariantFor(pathname ?? "");
  const copy = COPY[resolved];

  // Join a running loader's timeline (see the header comment). An overlay that
  // takes over from a server-rendered loader is created with a `startedAt` in the
  // past: it starts that far into its own animations. Frozen at mount, so a later
  // re-render cannot shift animations that are already running.
  const [elapsed, setElapsed] = useState(() => {
    const lag = nav && startedAt !== undefined ? Date.now() - startedAt : 0;
    return lag > 50 ? lag : 0; // a click-time overlay is "now"; ignore render lag
  });
  useIsoLayoutEffect(() => {
    if (!boundary) return;
    const overlay = document.querySelector<HTMLElement>(
      ".gt-loader[data-gt-loader-nav]:not([data-leaving])",
    );
    const t0 = Number(overlay?.getAttribute("data-t0"));
    if (overlay && Number.isFinite(t0)) setElapsed(Math.max(0, Date.now() - t0));
  }, [boundary]);

  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!slowAfterMs) return;
    const id = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(id);
  }, [slowAfterMs]);

  return (
    <div
      className="gt-loader"
      data-variant={resolved}
      data-leaving={leaving ? "true" : undefined}
      role="status"
      aria-live="polite"
      aria-label={copy.name}
      lang={copy.lang}
      data-gt-loader-nav={nav ? "" : undefined}
      data-gt-loader-boundary={boundary ? "" : undefined}
      data-t0={nav && startedAt !== undefined ? String(startedAt) : undefined}
      style={
        elapsed > 0
          ? ({ "--gt-elapsed": `${elapsed}ms` } as CSSProperties)
          : undefined
      }
    >
      {/* The announcement: the stage below is decoration and stays hidden. */}
      <span className="sr-only" lang={copy.lang}>
        {copy.name}
      </span>
      <div className="gt-loader__stage" aria-hidden="true">
        <div className="gt-loader__emblem">
          <div className="gt-loader__glow" />
          <div className="gt-loader__orbit">
            <svg viewBox="0 0 200 200" focusable="false">
              <circle className="gt-loader__track" cx="100" cy="100" r="96" />
            </svg>
            <svg className="gt-loader__arc" viewBox="0 0 200 200" focusable="false">
              <circle
                cx="100"
                cy="100"
                r="96"
                pathLength={100}
                strokeDasharray="25 75"
              />
            </svg>
          </div>
          <div className="gt-loader__mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo-mark.png"
              alt=""
              aria-hidden="true"
              width={517}
              height={632}
              draggable={false}
            />
            <div className="gt-loader__sweep" />
          </div>
        </div>
        <div className="gt-loader__label" lang="en">
          {message ?? copy.label}
        </div>
        <div className="gt-loader__progress">
          <span />
        </div>
      </div>
      {slow ? (
        <div className="gt-loader__slow" dir={resolved === "sales" ? "rtl" : undefined}>
          <p>{copy.slow}</p>
          <button type="button" onClick={() => window.location.reload()}>
            {copy.reload}
          </button>
        </div>
      ) : null}
    </div>
  );
}
