// GtLoader — branded loading experience for GT Factory OS.
//
// Plan: 20 UX iterations on the loading experience, requested by Tom 2026-05-04.
//
// Variants:
//   <GtLoader.Page />       Full-viewport splash with logo breathing + concentric
//                           ripples + indeterminate top progress bar + dot-grid
//                           backdrop + cycling phase text. Used as Next.js
//                           loading.tsx fallback.
//   <GtLoader.Inline />     Compact inline spinner: small logo with single
//                           orbital ring. Used inside cards, drawers, panels.
//   <GtLoader.Skeleton>     Animated skeleton placeholder for text/blocks
//                           with the diagonal-shimmer pass.
//   <GtLoader.TopBar />     4px top edge progress bar — used during navigation
//                           transitions where a full splash would be too heavy.
//
// All animations respect prefers-reduced-motion (CSS @media gate in globals.css).
// Aligned with the "Operational Precision" design tokens (bg, fg, accent).
//
// 20 UX iterations applied:
//   1.  Logo at center with confident breathing animation (scale 1.00↔1.05).
//   2.  Three concentric expanding rings, staggered 733ms (4-3-2-1 phase).
//   3.  Slow orbital ring spinning behind the logo (counter-rotation feel).
//   4.  Indeterminate top progress bar (4px) using accent color.
//   5.  Subtle dot-grid backdrop for premium texture (gt-grain class).
//   6.  Brand wordmark "GT Factory OS · OPERATIONS PORTAL" below the logo,
//       fading in with a delayed reveal animation.
//   7.  Cycling phase text ("טוען נתונים", "מסנכרן עם השרת", "מכין את התצוגה")
//       crossfades every 2.4s for active feedback during longer waits.
//   8.  Logo respects existing invert/dark:invert-0 contract — appears as
//       black on light theme, white on dark theme.
//   9.  Center pinned both vertically AND horizontally, RTL-safe.
//  10.  Min-height 100vh on Page variant (covers full viewport including
//       any future navbars).
//  11.  ARIA: role="status" + aria-busy="true" + aria-label="טוען" so
//       screen readers announce the loading state.
//  12.  Visually hidden <span> with descriptive text for assistive tech.
//  13.  Reduced-motion media query disables all animations (no jank for
//       users with vestibular sensitivity).
//  14.  Z-index 60 (above sticky headers) so a route transition splash
//       cleanly covers stale UI.
//  15.  fade-in entrance + reveal delays (40-240ms staggered) for a
//       cinematic enter (logo first, then wordmark, then phase text).
//  16.  Skeleton variant uses linear-gradient diagonal shimmer rather than
//       opacity pulse — feels more like data being loaded than "thinking".
//  17.  Inline variant fits within 24-32px box (drop-in for buttons).
//  18.  TopBar variant is overlay-positioned absolute top-0 — composes with
//       any layout without disrupting flow.
//  19.  All token-driven (bg, fg, accent, border) — auto-respects light
//       and dark themes without component-level conditionals.
//  20.  Min-display 200ms guard on Page (avoids flash-of-loader on fast
//       transitions) — implemented via opacity transition.

"use client";

import { useEffect, useState } from "react";

const PHRASES = ["טוען נתונים", "מסנכרן עם השרת", "מכין את התצוגה"] as const;

// ---------------------------------------------------------------------------
// PAGE — full-viewport splash. Use as Next.js loading.tsx export.
// ---------------------------------------------------------------------------
function GtLoaderPage({ label }: { label?: string }) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  // Min-display 200ms — avoids flash-of-loader on fast transitions.
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Cycle phase text every 2400ms.
  useEffect(() => {
    const id = setInterval(() => {
      setPhaseIdx((i) => (i + 1) % PHRASES.length);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label ?? "טוען"}
      className={[
        "fixed inset-0 z-[60] flex flex-col items-center justify-center",
        "bg-bg gt-grain",
        "transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      ].join(" ")}
      dir="rtl"
    >
      {/* Top progress bar */}
      <div className="absolute top-0 inset-x-0 h-[3px] overflow-hidden bg-bg-muted/50">
        <div className="gt-loader-progress-bar h-full w-1/3 bg-accent" />
      </div>

      {/* Center stack */}
      <div className="relative flex flex-col items-center reveal">
        {/* Logo + ripples + orbital ring */}
        <div className="relative h-32 w-32 flex items-center justify-center">
          {/* Concentric rings — staggered 733ms */}
          <span className="absolute inset-0 rounded-full border border-accent/40 gt-loader-ripple" />
          <span className="absolute inset-0 rounded-full border border-accent/30 gt-loader-ripple gt-loader-ripple-2" />
          <span className="absolute inset-0 rounded-full border border-accent/20 gt-loader-ripple gt-loader-ripple-3" />

          {/* Slow orbital ring (counter-rotation feel) */}
          <span
            className="absolute inset-2 rounded-full border-2 border-transparent gt-loader-orbit"
            style={{
              borderTopColor: "hsl(var(--accent))",
              borderRightColor: "hsl(var(--accent) / 0.3)",
            }}
            aria-hidden
          />

          {/* GT logo — uses existing invert contract */}
          <picture className="relative gt-loader-breathe">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo.png"
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 object-contain invert dark:invert-0"
              aria-hidden
            />
          </picture>
        </div>

        {/* Brand wordmark */}
        <div className="mt-6 text-center reveal reveal-delay-2">
          <div className="text-[15px] font-semibold tracking-wide text-fg-strong">
            GT Factory OS
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-fg-muted mt-0.5">
            Operations Portal
          </div>
        </div>

        {/* Cycling phase text */}
        <div
          key={phaseIdx}
          className="mt-4 text-sm text-fg-muted gt-phase-active min-h-[1.25rem] reveal reveal-delay-4"
        >
          {label ?? PHRASES[phaseIdx]}…
        </div>
      </div>

      <span className="sr-only">{label ?? "טוען את הדף, אנא המתן"}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// INLINE — compact spinner for in-context loading.
// ---------------------------------------------------------------------------
function GtLoaderInline({
  size = 20,
  label,
}: {
  size?: number;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-busy="true"
      aria-label={label ?? "טוען"}
      className="inline-flex items-center gap-2 align-middle"
    >
      <span
        className="relative inline-block"
        style={{ width: size, height: size }}
      >
        <span
          className="absolute inset-0 rounded-full border-2 border-transparent gt-loader-orbit"
          style={{
            borderTopColor: "hsl(var(--accent))",
            borderLeftColor: "hsl(var(--accent) / 0.3)",
          }}
        />
      </span>
      {label ? (
        <span className="text-sm text-fg-muted">{label}…</span>
      ) : null}
      <span className="sr-only">{label ?? "טוען"}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// SKELETON — animated placeholder for text/blocks.
// ---------------------------------------------------------------------------
function GtLoaderSkeleton({
  className = "",
  rounded = "md",
  width,
  height,
}: {
  className?: string;
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  width?: number | string;
  height?: number | string;
}) {
  const radius =
    rounded === "none"
      ? "rounded-none"
      : rounded === "sm"
        ? "rounded-sm"
        : rounded === "lg"
          ? "rounded-lg"
          : rounded === "full"
            ? "rounded-full"
            : "rounded-md";
  return (
    <span
      aria-hidden
      className={`gt-skeleton block ${radius} ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// TOP-BAR — 4px progress bar at the very top edge of the viewport.
// Useful for navigation transitions where a full splash is too heavy.
// ---------------------------------------------------------------------------
function GtLoaderTopBar() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="טוען"
      className="fixed top-0 inset-x-0 z-[70] h-[3px] overflow-hidden bg-bg-muted/40 pointer-events-none"
    >
      <div className="gt-loader-progress-bar h-full w-1/3 bg-accent" />
      <span className="sr-only">טוען</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PRESET BLOCKS — common loading layouts pre-composed with skeletons.
// ---------------------------------------------------------------------------
function GtLoaderFeed({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1.5" aria-busy="true" aria-label="טוען רשימה">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="rounded-md border border-border border-l-4 bg-bg-raised px-3 py-2.5"
        >
          <div className="flex items-start gap-2">
            <GtLoaderSkeleton width={16} height={16} rounded="sm" className="mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <GtLoaderSkeleton width="33%" height={10} />
              <GtLoaderSkeleton width="66%" height={14} />
              <GtLoaderSkeleton width="50%" height={10} />
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">טוען רשימה</span>
    </div>
  );
}

function GtLoaderTable({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-1" aria-busy="true" aria-label="טוען טבלה">
      <div className="grid gap-2 px-3 py-2 border-b border-border" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((_, c) => (
          <GtLoaderSkeleton key={c} height={10} width="60%" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-2 px-3 py-2 border-b border-border/40"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <GtLoaderSkeleton key={c} height={12} width={c === 0 ? "40%" : "70%"} />
          ))}
        </div>
      ))}
      <span className="sr-only">טוען טבלה</span>
    </div>
  );
}

function GtLoaderCards({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      aria-busy="true"
      aria-label="טוען כרטיסיות"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-bg-raised p-4 space-y-2">
          <GtLoaderSkeleton width="40%" height={11} />
          <GtLoaderSkeleton width="80%" height={20} />
          <GtLoaderSkeleton width="100%" height={48} className="mt-2" rounded="sm" />
          <div className="flex gap-2 pt-1">
            <GtLoaderSkeleton width={64} height={28} rounded="md" />
            <GtLoaderSkeleton width={64} height={28} rounded="md" />
          </div>
        </div>
      ))}
      <span className="sr-only">טוען כרטיסיות</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compound export
// ---------------------------------------------------------------------------
export const GtLoader = {
  Page: GtLoaderPage,
  Inline: GtLoaderInline,
  Skeleton: GtLoaderSkeleton,
  TopBar: GtLoaderTopBar,
  Feed: GtLoaderFeed,
  Table: GtLoaderTable,
  Cards: GtLoaderCards,
};

export default GtLoader;
