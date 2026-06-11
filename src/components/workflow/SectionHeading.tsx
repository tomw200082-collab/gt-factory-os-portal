import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// <SectionHeading> — Tranche 049 (VISUAL-013).
//
// The canonical in-page section heading: accent eyebrow above a bold h2,
// with an optional muted description below. Extracted verbatim from the
// dashboard's "Operational trends" inline pattern so every page that needs
// a non-card section break uses the same look instead of hand-rolling it.
// ---------------------------------------------------------------------------

interface SectionHeadingProps {
  /** Tiny uppercase accent line above the heading. */
  eyebrow?: string;
  /** The section heading itself (rendered as an h2). */
  title: ReactNode;
  /** Optional muted description under the heading. */
  description?: ReactNode;
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("min-w-0", className)}>
      {eyebrow ? (
        <div className="text-2xs font-semibold uppercase tracking-sops text-accent">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="text-lg font-bold tracking-tight text-fg-strong">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}
