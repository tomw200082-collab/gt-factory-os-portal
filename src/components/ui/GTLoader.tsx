"use client";

import { usePathname } from "next/navigation";
import { loaderVariantFor, type LoaderVariant } from "./loader-variant";

// GTLoader — one loading system, two worlds (tranche 201).
//
// The same calm composition renders for the factory portal and for GT Pulse
// (/sales/*): the cropped GT mark, one thin orbit, a breathing glow, a
// glyph-only light sweep, a small label and a 2 px travelling progress line.
// Only the palette differs; it is set by [data-variant] in globals.css
// (.gt-loader). Entrance, exit and reduced motion are CSS-only as well.

/** Mirrors of the CSS timings in globals.css (.gt-loader). */
export const GT_LOADER_ENTRANCE_MS = 120;
export const GT_LOADER_EXIT_MS = 180;

const COPY: Record<
  LoaderVariant,
  { label: string; name: string; lang: string | undefined }
> = {
  factory: { label: "GT FACTORY OS", name: "Loading GT Factory OS", lang: undefined },
  sales: { label: "GT PULSE", name: "טוען", lang: "he" },
};

export function GTLoader({
  variant,
  leaving = false,
  message,
}: {
  /** Which world to show. Defaults to the one the current pathname belongs to. */
  variant?: LoaderVariant;
  /** Fade out (180 ms); the parent unmounts it afterwards. */
  leaving?: boolean;
  /** Replaces the small label under the orbit. */
  message?: string;
}) {
  const pathname = usePathname();
  const resolved = variant ?? loaderVariantFor(pathname ?? "");
  const copy = COPY[resolved];

  return (
    <div
      className="gt-loader"
      data-variant={resolved}
      data-leaving={leaving ? "true" : undefined}
      role="status"
      aria-live="polite"
      aria-label={copy.name}
      lang={copy.lang}
    >
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
    </div>
  );
}
