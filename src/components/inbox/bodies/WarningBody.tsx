// Warning card Body — auto-resolve note + investigate links.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.6

"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { STATE_COPY } from "@/lib/inbox-copy";

export interface WarningBodyData {
  why: string;
  actions?: Array<{ label: string; href: string }>;
  autoResolveNote?: string;
}

export function WarningBody({ data }: { data: WarningBodyData }) {
  return (
    <div className="space-y-2">
      <p className="text-slate-700 dark:text-slate-300">{data.why}</p>
      {data.actions && data.actions.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {data.actions.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                <ArrowLeft className="h-3 w-3" aria-hidden />
                <span>{a.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-slate-500 dark:text-slate-400 italic">
        {data.autoResolveNote ?? STATE_COPY.autoResolveNote}
      </p>
    </div>
  );
}
