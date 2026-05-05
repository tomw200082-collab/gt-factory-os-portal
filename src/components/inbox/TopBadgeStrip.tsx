// Top badge strip — at-a-glance "12 החלטות · 4 משימות · 2 התראות".
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.10
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.3
//
// UX iterations:
//   - Dark-mode aware.
//   - Each pill is interactive: clicking filters to that single type.
//   - Critical-severity counts get a subtle ping animation.
//   - Zero-counts hidden (only show what's actionable).
//   - Empty-state: "הכל מטופל" with a green checkmark.
//   - Tabular-num for stable column widths during count changes.

"use client";

import { CheckCircle2 } from "lucide-react";
import { copyForCardType, type CardType } from "@/lib/inbox-copy";

export interface TopBadgeStripCounts {
  decision: number;
  to_do: number;
  warning: number;
  info: number;
}

const VISIBLE_TYPES: ReadonlyArray<CardType> = ["decision", "to_do", "warning"];

const TYPE_DOT: Record<CardType, string> = {
  decision: "bg-blue-500",
  to_do: "bg-violet-500",
  warning: "bg-amber-500",
  info: "bg-slate-400",
};

const TYPE_BG: Record<CardType, string> = {
  decision:
    "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60",
  to_do:
    "bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/60",
  warning:
    "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60",
  info: "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
};

export function TopBadgeStrip({
  counts,
  onTypeClick,
}: {
  counts: TopBadgeStripCounts;
  onTypeClick?: (t: CardType) => void;
}) {
  const total = counts.decision + counts.to_do + counts.warning;
  if (total === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        <span>הכל מטופל</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm" role="navigation" aria-label="Inbox counts">
      {VISIBLE_TYPES.map((t) => {
        const n = counts[t];
        if (n === 0) return null;
        const interactive = Boolean(onTypeClick);
        const Element = interactive ? "button" : "span";
        return (
          <Element
            key={t}
            type={interactive ? "button" : undefined}
            onClick={interactive ? () => onTypeClick?.(t) : undefined}
            className={[
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 transition-colors",
              TYPE_BG[t],
              interactive ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" : "",
            ].join(" ")}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[t]}`} aria-hidden />
            <span className="tabular-nums font-semibold">{n}</span>
            <span>{copyForCardType(t, true)}</span>
          </Element>
        );
      })}
    </div>
  );
}
