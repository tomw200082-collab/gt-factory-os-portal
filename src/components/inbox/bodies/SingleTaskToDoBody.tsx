// Single-task To-Do Body (variant 2) — one-click deep-link to elsewhere.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.8 (variant 2)
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.8

"use client";

import Link from "next/link";

export interface SingleTaskToDoBodyData {
  why: string;
  what?: string;
  cta: { label: string; href: string };
}

export function SingleTaskToDoBody({ data }: { data: SingleTaskToDoBodyData }) {
  return (
    <div className="space-y-2">
      <p>{data.why}</p>
      {data.what ? <p className="text-slate-500 text-xs">{data.what}</p> : null}
      <Link
        href={data.cta.href}
        className="inline-flex items-center rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
      >
        {data.cta.label} →
      </Link>
    </div>
  );
}
