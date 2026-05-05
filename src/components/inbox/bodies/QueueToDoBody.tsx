// Queue To-Do Body (variant 1) — bulk-process queue with count breakdown.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.8 (variant 1)
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.9

"use client";

import Link from "next/link";

export interface QueueToDoBodyData {
  why: string;
  counts: { pending: number; highConfidence?: number };
  cta: { label: string; href: string };
}

export function QueueToDoBody({ data }: { data: QueueToDoBodyData }) {
  return (
    <div className="space-y-2">
      <p>{data.why}</p>
      <ul className="flex flex-wrap gap-x-4 text-xs text-slate-600">
        <li>
          <span className="text-slate-500">Pending: </span>
          <span className="font-semibold tabular-nums">{data.counts.pending}</span>
        </li>
        {data.counts.highConfidence !== undefined ? (
          <li>
            <span className="text-slate-500">HIGH confidence: </span>
            <span className="font-semibold tabular-nums">
              {data.counts.highConfidence}/{data.counts.pending}
            </span>
          </li>
        ) : null}
      </ul>
      <Link
        href={data.cta.href}
        className="inline-flex items-center rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
      >
        {data.cta.label} →
      </Link>
    </div>
  );
}
