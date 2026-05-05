// Single-task To-Do Body (variant 2) — one-click deep-link to elsewhere.

"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export interface SingleTaskToDoBodyData {
  why: string;
  what?: string;
  cta: { label: string; href: string };
}

export function SingleTaskToDoBody({ data }: { data: SingleTaskToDoBodyData }) {
  return (
    <div className="space-y-2">
      <p className="text-slate-700 dark:text-slate-300">{data.why}</p>
      {data.what ? (
        <p className="text-slate-500 dark:text-slate-400 text-xs">{data.what}</p>
      ) : null}
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
