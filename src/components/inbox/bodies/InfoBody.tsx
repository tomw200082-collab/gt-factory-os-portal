// Info card Body — minimal description.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.9

"use client";

export interface InfoBodyData {
  description: string;
}

export function InfoBody({ data }: { data: InfoBodyData }) {
  return (
    <p className="text-slate-600 dark:text-slate-400">{data.description}</p>
  );
}
