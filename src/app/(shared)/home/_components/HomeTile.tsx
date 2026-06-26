"use client";

// ---------------------------------------------------------------------------
// HomeTile — "The Line" card (Tranche 090, Slice B / Phase 2).
//
// Signature element: a petrol-teal SPINE on the tile's leading edge that
// brightens and a faint teal wash that FILLS across the card on hover/focus —
// "liquid filling a vessel", grounded in the beverage-factory subject and
// echoing the SideNav active-item spine. One calm gesture; reduced-motion
// collapses the lift/slide to a static tint. Built on existing design tokens +
// Tailwind transitions only — no animation dependency.
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

export function HomeTile({ tile, lang, rtl, variant = "standard", eyebrow }: HomeTileProps) {
  const { label, blurb } = tileText(tile, lang);
  const Icon = tile.icon;
  const Arrow = rtl ? ArrowLeft : ArrowRight;
  const primary = variant === "primary";

  return (
    <Link
      href={tile.href}
      data-testid={`home-tile-${tile.href}`}
      className={cn(
        "group relative flex overflow-hidden rounded-xl border border-border/70 bg-bg-raised",
        "transition-[transform,box-shadow,border-color] duration-200 ease-out-quart",
        "hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-pop",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "motion-reduce:transform-none motion-reduce:transition-none",
        primary ? "items-center gap-4 p-5 sm:p-6" : "items-start gap-3 p-4",
      )}
    >
      {/* Spine — the leading-edge accent line. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 bg-accent/35 transition-[width,background-color] duration-300 ease-out-quart",
          "group-hover:bg-accent group-focus-visible:bg-accent",
          primary ? "w-1 group-hover:w-1.5" : "w-[3px] group-hover:w-1",
          rtl ? "right-0" : "left-0",
        )}
      />
      {/* Fill — faint teal wash sweeping from the spine edge on hover/focus. */}
      <span
        aria-hidden
        className={cn(
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
