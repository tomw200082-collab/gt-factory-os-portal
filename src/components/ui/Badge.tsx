"use client";

// ---------------------------------------------------------------------------
// <Badge> — the canonical status/label primitive for the portal.
//
// Tranche 0A of the portal UX/UI deep pass (2026-05-15) consolidated six
// divergent badge/status components onto this one primitive plus one shared
// tone-to-class lookup (BADGE_TONE_CLASSES).
//
// This module is the SOLE home of BADGE_TONE_CLASSES. It replaces the three
// duplicated tone maps that used to live in StatusBadge (TONE_CLASSES),
// ReadinessBadge (CONFIG), and the SectionCard border map (SectionCard is NOT
// folded in — its border-only tone map stays where it is).
//
// Wrappers that compose this primitive: StatusBadge, ReadinessBadge,
// ReadinessPill, ReconcileBadge. FreshnessBadge stays a standalone layout
// component but imports BADGE_TONE_CLASSES for its dot color.
//
// HARD RULE for Tranche 0A: no label-copy changes. Every consuming wrapper
// keeps its label strings verbatim.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "muted";

export type BadgeVariant = "soft" | "outline" | "solid";

export type BadgeSize = "xs" | "sm";

interface ToneClassSet {
  soft: string;
  outline: string;
  solid: string;
  dot: string;
  /** Non-empty only for tones that pulse (info, warning). Applied to the dot
   *  only when `animated` is true. Mirrors the animate-pulse-soft behavior the
   *  old StatusBadge applied to submitting / pending_approval dots. */
  pulse: string;
}

// ---------------------------------------------------------------------------
// Shared tone-to-class lookup — single source of truth.
//
// Class strings are taken verbatim from the pre-consolidation maps so the
// rendered output is byte-identical for every tone that previously existed:
//   - neutral / accent / success / warning / danger / info  -> old generic
//     Badge TONE_CLASSES.
//   - muted is NEW: absorbs the `discarded` strikethrough case. `discarded`
//     callers pass className="line-through" themselves (StatusBadge does).
// ---------------------------------------------------------------------------

export const BADGE_TONE_CLASSES: Record<BadgeTone, ToneClassSet> = {
  neutral: {
    soft: "bg-bg-muted text-fg-muted border-border/70",
    outline: "bg-transparent text-fg-muted border-border/80",
    solid: "bg-fg/10 text-fg-strong border-border/70",
    dot: "bg-fg-faint",
    pulse: "",
  },
  accent: {
    soft: "bg-accent-soft text-accent border-accent/30",
    outline: "bg-transparent text-accent border-accent/40",
    solid: "bg-accent text-accent-fg border-accent",
    dot: "bg-accent",
    pulse: "",
  },
  success: {
    soft: "bg-success-softer text-success-fg border-success/30",
    outline: "bg-transparent text-success-fg border-success/40",
    solid: "bg-success text-fg-inverted border-success",
    dot: "bg-success",
    pulse: "",
  },
  warning: {
    soft: "bg-warning-softer text-warning-fg border-warning/30",
    outline: "bg-transparent text-warning-fg border-warning/40",
    solid: "bg-warning text-fg-inverted border-warning",
    dot: "bg-warning",
    pulse: "animate-pulse-soft",
  },
  danger: {
    soft: "bg-danger-softer text-danger-fg border-danger/30",
    outline: "bg-transparent text-danger-fg border-danger/40",
    solid: "bg-danger text-fg-inverted border-danger",
    dot: "bg-danger",
    pulse: "",
  },
  info: {
    soft: "bg-info-softer text-info-fg border-info/30",
    outline: "bg-transparent text-info-fg border-info/40",
    solid: "bg-info text-fg-inverted border-info",
    dot: "bg-info",
    pulse: "animate-pulse-soft",
  },
  muted: {
    soft: "bg-bg-subtle text-fg-subtle border-border/70",
    outline: "bg-transparent text-fg-subtle border-border/70",
    solid: "bg-fg/10 text-fg-subtle border-border/70",
    dot: "bg-fg-faint",
    pulse: "",
  },
};

// ---------------------------------------------------------------------------
// Size-to-class lookup
//   xs = old StatusBadge / generic Badge geometry (uppercase, tracking-sops)
//   sm = old ReconcileBadge geometry (rounded-full pill, font-medium)
// ---------------------------------------------------------------------------

const SIZE_CLASSES: Record<BadgeSize, string> = {
  xs: "px-1.5 py-0.5 rounded-sm gap-1.5 text-3xs font-semibold uppercase tracking-sops",
  sm: "px-2 py-0.5 rounded-full gap-1 text-2xs font-medium",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface BadgeProps {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Render a leading colored status dot. Mutually exclusive with `icon`. */
  dot?: boolean;
  /** @deprecated Tranche 0A alias for `dot` — kept so pre-consolidation
   *  callers (e.g. ReadinessPill) do not break. Prefer `dot`. */
  dotted?: boolean;
  /** When true and tone has a pulse class, the dot animates. */
  animated?: boolean;
  /** Leading icon node. Mutually exclusive with `dot` — if both are supplied,
   *  `icon` wins. */
  icon?: ReactNode;
  /** Render as an interactive <button type="button"> with focus ring. */
  interactive?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** When set, wraps the badge in a Radix Tooltip. */
  tooltip?: string;
  /** Optional explicit aria-label (overrides text content for SRs). */
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

export function Badge({
  tone = "neutral",
  variant = "soft",
  size = "xs",
  dot,
  dotted,
  animated,
  icon,
  interactive,
  onClick,
  disabled,
  tooltip,
  ariaLabel,
  className,
  children,
}: BadgeProps) {
  const c = BADGE_TONE_CLASSES[tone];
  const showDot = (dot ?? dotted) && !icon;

  const baseClass = cn(
    "inline-flex items-center border",
    SIZE_CLASSES[size],
    c[variant],
    interactive &&
      "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
    disabled && "opacity-70 cursor-not-allowed",
    className,
  );

  const inner = (
    <>
      {showDot ? (
        <span
          className={cn("dot", c.dot, animated && c.pulse)}
          aria-hidden
        />
      ) : null}
      {icon ? <span aria-hidden>{icon}</span> : null}
      {children}
    </>
  );

  let node: ReactNode;
  if (interactive && !disabled) {
    // Interactive + enabled -> real <button>.
    node = (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={baseClass}
      >
        {inner}
      </button>
    );
  } else if (interactive && disabled) {
    // Interactive but disabled -> non-interactive <span role="status"> so
    // assistive tech and role-based queries do not treat it as actionable.
    node = (
      <span role="status" aria-label={ariaLabel} className={baseClass}>
        {inner}
      </span>
    );
  } else {
    // A non-interactive badge that carries a tooltip must still be
    // keyboard-reachable, or its tooltip content is mouse-hover-only
    // (ux-release-gate A11Y-001). Making the span a tab stop lets Radix wire
    // aria-describedby and fire the tooltip on focus. Only when it actually
    // has a tooltip — plain badges stay out of the tab order.
    const focusable = tooltip != null;
    node = (
      <span
        aria-label={ariaLabel}
        tabIndex={focusable ? 0 : undefined}
        className={cn(
          baseClass,
          focusable &&
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        )}
      >
        {inner}
      </span>
    );
  }

  if (!tooltip) return node;

  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>{node}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="top"
          sideOffset={6}
          className="z-50 rounded border border-border bg-bg-raised px-2 py-1 text-2xs text-fg shadow-md"
        >
          {tooltip}
          <Tooltip.Arrow className="fill-bg-raised" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
