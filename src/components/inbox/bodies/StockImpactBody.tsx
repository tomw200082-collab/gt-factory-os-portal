// Stock-impact Body — used by GR over-receipt + count + waste subtypes.
// Center-stage shows current → after-this-action quantities with delta.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.5.2 + §1.5.3

"use client";

import { ArrowLeft } from "lucide-react";

export interface StockImpactBodyData {
  itemName: string;
  currentQty: number;
  afterQty: number;
  delta: number;
  unit?: string;
  reasonInInbox?: string;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function StockImpactBody({ data }: { data: StockImpactBodyData }) {
  const sign = data.delta > 0 ? "+" : "";
  const unit = data.unit ?? "";
  const deltaColor =
    data.delta > 0
      ? "text-emerald-700 dark:text-emerald-400"
      : data.delta < 0
        ? "text-red-700 dark:text-red-400"
        : "text-slate-500 dark:text-slate-400";
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3">
        <div className="text-sm font-medium mb-2 text-slate-900 dark:text-slate-100">
          {data.itemName}
        </div>
        <div className="grid grid-cols-[max-content_max-content_max-content_max-content] items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">במלאי כעת:</span>
          <span className="tabular-nums text-end text-slate-900 dark:text-slate-100">
            {fmt(data.currentQty)} {unit}
          </span>
          <ArrowLeft className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          <span className="tabular-nums text-end font-semibold text-slate-900 dark:text-slate-100">
            {fmt(data.afterQty)} {unit}
            <span className={`ms-2 ${deltaColor}`}>
              ({sign}
              {fmt(data.delta)})
            </span>
          </span>
        </div>
      </div>
      {data.reasonInInbox ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{data.reasonInInbox}</p>
      ) : null}
    </div>
  );
}
