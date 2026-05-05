// Supplier price-change Decision Body.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.5.1

"use client";

import Link from "next/link";
import { ArrowLeft, FileText, TrendingDown, TrendingUp } from "lucide-react";
import { copyForConfidence, colorForPriceDelta } from "@/lib/inbox-copy";

export interface PriceProposalBodyData {
  currentPrice: number | null;
  proposedPrice: number;
  pctDelta: number;
  absDelta: number;
  confidence: "HIGH" | "MEDIUM";
  supplierName: string;
  componentName: string;
  quantityMode?:
    | { mode: "quantity_units"; quantity: number; totalNet: number }
    | { mode: "unit_price_net_override" };
  lastChange?: { date: string; from: number; to: number };
  daysSinceLastChange?: number;
  evidenceUrl?: string;
}

function fmtIls(n: number): string {
  return `₪${n.toFixed(4)}`;
}

function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

export function PriceProposalBody({ data }: { data: PriceProposalBodyData }) {
  const color = colorForPriceDelta(data.pctDelta);
  const colorClass =
    color === "green"
      ? "text-emerald-700 dark:text-emerald-400"
      : color === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : color === "red"
          ? "text-red-700 dark:text-red-400"
          : "text-slate-700 dark:text-slate-300";
  const trendIcon =
    data.pctDelta > 0 ? (
      <TrendingUp className="h-4 w-4" aria-hidden />
    ) : data.pctDelta < 0 ? (
      <TrendingDown className="h-4 w-4" aria-hidden />
    ) : null;

  return (
    <div className="space-y-3">
      {/* Comparison strip — center stage */}
      <div
        className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3"
        data-color={color}
      >
        <div className="grid grid-cols-3 items-center gap-2 text-sm">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">מחיר נוכחי</div>
            <div className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {data.currentPrice !== null ? fmtIls(data.currentPrice) : "—"}
            </div>
          </div>
          <div className="text-center text-slate-400">
            <ArrowLeft className="inline h-4 w-4" aria-hidden />
          </div>
          <div className="text-end">
            <div className="text-xs text-slate-500 dark:text-slate-400">מחיר מוצע</div>
            <div className={`text-base font-semibold tabular-nums ${colorClass}`}>
              {fmtIls(data.proposedPrice)}
            </div>
          </div>
        </div>
        <div className={`mt-2 flex items-center justify-end gap-1 text-sm font-medium ${colorClass}`}>
          {trendIcon}
          <span>{fmtPct(data.pctDelta)}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            (₪{(data.proposedPrice - (data.currentPrice ?? 0)).toFixed(4)})
          </span>
        </div>
      </div>

      {/* Supplier-match confidence */}
      <dl className="text-xs grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-400">
        <dt>ספק:</dt>
        <dd className="text-slate-900 dark:text-slate-100">{data.supplierName}</dd>
        <dt>רכיב:</dt>
        <dd className="text-slate-900 dark:text-slate-100">{data.componentName}</dd>
        <dt>{copyForConfidence(data.confidence).split(":")[0]}:</dt>
        <dd className="text-slate-900 dark:text-slate-100">
          {copyForConfidence(data.confidence).split(":")[1]?.trim()}
        </dd>
      </dl>

      {/* Quantity mode */}
      {data.quantityMode ? (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {data.quantityMode.mode === "quantity_units"
            ? `${data.quantityMode.quantity.toLocaleString()} יח' · ${fmtIls(data.quantityMode.totalNet)} סה"כ נטו = ${fmtIls(data.proposedPrice)}/יח'`
            : `הזנת מחיר ידנית: ${fmtIls(data.proposedPrice)}/יח'`}
        </div>
      ) : null}

      {/* Last-change context */}
      {data.lastChange ? (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          שינוי קודם: {data.lastChange.date} · {fmtIls(data.lastChange.from)}{" "}
          → {fmtIls(data.lastChange.to)}
          {data.daysSinceLastChange !== undefined
            ? ` (${data.daysSinceLastChange} ימים)`
            : ""}
        </div>
      ) : null}

      {/* Evidence link */}
      {data.evidenceUrl ? (
        <Link
          href={data.evidenceUrl}
          target="_blank"
          className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          <FileText className="h-3 w-3" aria-hidden />
          <span>צפה בחשבונית מקור (PDF)</span>
        </Link>
      ) : null}
    </div>
  );
}
