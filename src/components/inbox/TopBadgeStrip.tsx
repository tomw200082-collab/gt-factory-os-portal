// Top badge strip — at-a-glance "12 החלטות · 4 משימות · 2 התראות".
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.10
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.3

"use client";

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

export function TopBadgeStrip({ counts }: { counts: TopBadgeStripCounts }) {
  return (
    <div className="flex items-center gap-3 text-sm" aria-label="Inbox counts">
      {VISIBLE_TYPES.map((t) => (
        <div key={t} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${TYPE_DOT[t]}`} aria-hidden />
          <span className="tabular-nums font-medium">{counts[t]}</span>
          <span className="text-slate-600">{copyForCardType(t, true)}</span>
        </div>
      ))}
    </div>
  );
}
