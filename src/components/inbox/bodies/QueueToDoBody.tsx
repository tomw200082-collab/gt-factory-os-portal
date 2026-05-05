// Queue To-Do Body (variant 1) — bulk-process queue with count breakdown.

"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export interface QueueToDoBodyData {
  why: string;
  counts: { pending: number; highConfidence?: number };
  cta: { label: string; href: string };
}

export function QueueToDoBody({ data }: { data: QueueToDoBodyData }) {
  return (
    <div className="space-y-2">
      <p className="text-slate-700 dark:text-slate-300">{data.why}</p>
      <ul className="flex flex-wrap gap-x-4 text-xs text-slate-600 dark:text-slate-400">
        <li>
          <span>Pending: </span>
          <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {data.counts.pending}
          </span>
        </li>
        {data.counts.highConfidence !== undefined ? (
          <li>
            <span>HIGH confidence: </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {data.counts.highConfidence}/{data.counts.pending}
            </span>
          </li>
        ) : null}
      </ul>
      <Link
        href={data.cta.href}
        className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 transition-colors"
      >
        <span>{data.cta.label}</span>
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}
