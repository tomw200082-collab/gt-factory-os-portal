// Warning card Body — auto-resolve note + investigate links.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.6
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.6

"use client";

import Link from "next/link";
import { STATE_COPY } from "@/lib/inbox-copy";

export interface WarningBodyData {
  why: string;
  /** Optional list of "what you can do" actions — usually 1-2 deep links. */
  actions?: Array<{ label: string; href: string }>;
  /** Custom auto-resolve note (defaults to STATE_COPY.autoResolveNote). */
  autoResolveNote?: string;
}

export function WarningBody({ data }: { data: WarningBodyData }) {
  return (
    <div className="space-y-2">
      <p>{data.why}</p>
      {data.actions && data.actions.length > 0 ? (
        <ul className="flex flex-col gap-1 pr-4">
          {data.actions.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="text-blue-600 hover:underline"
              >
                → {a.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-slate-500 italic">
        {data.autoResolveNote ?? STATE_COPY.autoResolveNote}
      </p>
    </div>
  );
}
