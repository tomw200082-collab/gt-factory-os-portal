"use client";

// ---------------------------------------------------------------------------
// HomeTile — "The Line" card (Tranche 090, Slice B / Phase 2)
// + "Signature Glow" on the primary hero tile (Tranche 120, Tom-directed 2026-07-03).
//
// Signature element: a petrol-teal SPINE on the tile's leading edge that
// brightens and a faint teal wash that FILLS across the card on hover/focus —
// "liquid filling a vessel", grounded in the beverage-factory subject and
// echoing the SideNav active-item spine. One calm gesture; reduced-motion
// collapses the lift/slide to a static tint. Built on existing design tokens +
// Tailwind transitions only — no animation dependency.
//
// The primary (hero) tile additionally gets a restrained glass-and-glow
// treatment, mirroring the dashboard's own established `.dash-hero` recipe
// (globals.css) rather than inventing a new visual language: translucent
// backdrop-blurred surface, a static top-anchored accent radial glow, a
// hairline accent line at the top edge, and a layered ambient shadow. Static
// by design — the reference precedent explicitly retired a continuous
// "breathe" pulse on this exact kind of hero glow ("motion budget reserved
// for live-data elements"); the same restraint applies here.
//
// Direction-aware by prop (not Tailwind logical utilities) so the spine, wash
// gradient, and arrow flip correctly inside the bookkeeper's dir="rtl" cockpit.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { cn } from "@/lib/cn";
import { tileText, type HomeTile as HomeTileModel, type Lang } from "@/features/home/cockpit";

interface HomeTileProps {
  tile: HomeTileModel;
  lang: Lang;
  rtl: boolean;
  variant?: "standard" | "primary";
  /** Small uppercase eyebrow shown above a primary tile's label. */
  eyebrow?: string;
}

// Layered ambient shadow for the primary tile's resting state — mirrors
// .dash-hero's box-shadow recipe (globals.css) via inline style rather than
// an arbitrary Tailwind value, since the multi-stop hsl(var(...)) syntax
// doesn't survive Tailwind's bracket-value space-escaping cleanly.
const PRIMARY_GLOW_SHADOW =
  "inset 0 1px 0 0 hsl(0 0% 100% / 0.05), 0 1px 2px 0 hsl(var(--shadow-color) / 0.30), 0 20px 48px -20px hsl(var(--shadow-color-deep) / 0.16)";

export function HomeTile({ tile, lang, rtl, variant = "standard", eyebrow }: HomeTileProps) {
  const { label, blurb } = tileText(tile, lang);
  const Icon = tile.icon;
  const Arrow = rtl ? ArrowLeft : ArrowRight;
  const primary = variant === "primary";

  return (
    <Link
      href={tile.href}
      data-testid={`home-tile-${tile.href}`}
      style={primary ? { boxShadow: PRIMARY_GLOW_SHADOW } : undefined}
      className={cn(
        "group relative flex overflow-hidden rounded-xl border border-border/70",
        primary ? "bg-bg-raised/75 backdrop-blur-md backdrop-saturate-[1.4] dark:bg-bg-raised/65" : "bg-bg-raised",
        "transition-[transform,box-shadow,border-color] duration-200 ease-out-quart",
        "hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-pop",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "motion-reduce:transform-none motion-reduce:transition-none",
        primary ? "items-center gap-4 p-5 sm:p-6" : "items-start gap-3 p-4",
      )}
    >
      {primary ? (
        <>
          {/* Signature Glow — static top-anchored accent halo, mirrors
              .dash-hero::before. No animation (motion budget precedent).
              Anchor points flip in RTL so the main glow falls on the icon's
              side (right, in the RTL cockpit) like every other directional
              cue on this tile. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-0 h-28"
            style={{
              background: rtl
                ? "radial-gradient(65% 100% at 82% 0%, hsl(var(--accent) / 0.20) 0%, transparent 65%), " +
                  "radial-gradient(45% 100% at 12% 0%, hsl(var(--info) / 0.12) 0%, transparent 70%)"
                : "radial-gradient(65% 100% at 18% 0%, hsl(var(--accent) / 0.20) 0%, transparent 65%), " +
                  "radial-gradient(45% 100% at 88% 0%, hsl(var(--info) / 0.12) 0%, transparent 70%)",
            }}
          />
          {/* Hairline accent at the top edge — mirrors .dash-hero::after. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-0 h-px"
            style={{
              background:
                "linear-gradient(to right, transparent 0%, hsl(var(--accent) / 0.5) 25%, hsl(var(--accent) / 0.5) 75%, transparent 100%)",
            }}
          />
        </>
      ) : null}
      {/* Spine — the leading-edge accent line. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 z-0 bg-accent/35 transition-[width,background-color] duration-300 ease-out-quart",
          "group-hover:bg-accent group-focus-visible:bg-accent",
          primary ? "w-1 group-hover:w-1.5" : "w-[3px] group-hover:w-1",
          rtl ? "right-0" : "left-0",
        )}
      />
      {/* Fill — faint teal wash sweeping from the spine edge on hover/focus. */}
      <span
        aria-hidden
        className={cn(
          "z-0",
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 ease-out-quart",
          "group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none",
          rtl ? "bg-gradient-to-l" : "bg-gradient-to-r",
          "from-accent/[0.08] via-accent/[0.02] to-transparent",
        )}
      />
      {/* Icon chip */}
      <span
        className={cn(
          "relative z-[1] flex shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors duration-200 group-hover:bg-accent/15",
          primary ? "h-12 w-12" : "h-10 w-10",
        )}
      >
        <Icon className={primary ? "h-6 w-6" : "h-5 w-5"} strokeWidth={1.75} aria-hidden />
      </span>
      {/* Text */}
      <span className={cn("relative z-[1] min-w-0 flex-1", primary && "flex flex-col")}>
        {primary && eyebrow ? (
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-accent">
            {eyebrow}
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "font-semibold text-fg-strong",
              primary ? "text-lg tracking-tightish" : "text-md",
            )}
          >
            {label}
          </span>
          {/* Standard tiles reveal an inline arrow on hover; the primary uses a
              persistent trailing chevron instead (rendered after the text). */}
          {!primary ? (
            <Arrow
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-accent opacity-0 transition-all duration-200 ease-out-quart group-hover:opacity-100 motion-reduce:transition-none",
                rtl ? "translate-x-1 group-hover:translate-x-0" : "-translate-x-1 group-hover:translate-x-0",
              )}
              strokeWidth={2}
              aria-hidden
            />
          ) : null}
        </span>
        <span
          className={cn(
            "mt-0.5 block leading-relaxed text-fg-muted",
            primary ? "text-sm" : "text-xs",
          )}
        >
          {blurb}
        </span>
      </span>
      {/* Primary trailing chevron — spans the banner toward the destination. */}
      {primary ? (
        <Arrow
          className={cn(
            "relative z-[1] h-5 w-5 shrink-0 text-accent/70 transition-all duration-200 ease-out-quart group-hover:text-accent motion-reduce:transition-none",
            rtl ? "group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5",
          )}
          strokeWidth={2}
          aria-hidden
        />
      ) : null}
    </Link>
  );
}
