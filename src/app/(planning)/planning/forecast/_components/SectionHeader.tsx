"use client";

// ---------------------------------------------------------------------------
// SectionHeader — accent dot + icon + uppercase label + count chip + a
// fading hairline rule that radiates from the section accent toward the
// edge. Three semantic tones: active (success), drafts (warning), archived
// (neutral). Composes .fc-list-section-header utilities.
// ---------------------------------------------------------------------------

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

type SectionTone = "active" | "drafts" | "archived";

interface SectionHeaderProps {
  tone: SectionTone;
  icon: ReactNode;
  label: string;
  count: number;
  trailing?: ReactNode;
  asButton?: boolean;
  onClick?: () => void;
  ariaExpanded?: boolean;
  className?: string;
  testId?: string;
}

const TONE_STYLE: Record<
  SectionTone,
  { accent: string; soft: string; fg: string }
> = {
  active: {
    accent: "var(--success)",
    soft: "var(--success-soft)",
    fg: "var(--success-fg)",
  },
  drafts: {
    accent: "var(--warning)",
    soft: "var(--warning-softer)",
    fg: "var(--warning-fg)",
  },
  archived: {
    accent: "var(--border-strong)",
    soft: "var(--bg-subtle)",
    fg: "var(--fg-muted)",
  },
};

export function SectionHeader({
  tone,
  icon,
  label,
  count,
  trailing,
  asButton,
  onClick,
  ariaExpanded,
  className,
  testId,
}: SectionHeaderProps) {
  const style: CSSProperties = {
    ["--section-accent" as string]: TONE_STYLE[tone].accent,
    ["--section-accent-soft" as string]: TONE_STYLE[tone].soft,
    ["--section-accent-fg" as string]: TONE_STYLE[tone].fg,
  } as CSSProperties;

  const content = (
    <>
      <span className="fc-list-section-icon-host" aria-hidden>
        {icon}
      </span>
      <span className="fc-list-section-label">{label}</span>
      <span
        className="fc-list-section-count tabular-nums"
        aria-label={`${count} ${count === 1 ? "item" : "items"}`}
      >
        {count}
      </span>
      {trailing ? (
        <span className="ml-auto inline-flex items-center gap-2">
          {trailing}
        </span>
      ) : null}
    </>
  );

  if (asButton) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={ariaExpanded}
        className={cn(
          "fc-list-section-header w-full text-left transition-colors hover:bg-bg-subtle/40",
          className,
        )}
        style={style}
        data-testid={testId}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn("fc-list-section-header", className)}
      style={style}
      data-testid={testId}
    >
      {content}
    </div>
  );
}
