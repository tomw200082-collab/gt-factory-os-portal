// Supplier price-change Decision Body.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.5.1
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.11

"use client";

import Link from "next/link";
import { copyForConfidence, colorForPriceDelta } from "@/lib/inbox-copy";

export interface PriceProposalBodyData {
  currentPrice: number | null;
  proposedPrice: number;
  pctDelta: number;
  absDelta: number;
  confidence: "HIGH" | "MEDIUM";
  supplierName: string;
  componentName: string;
  /** Mode A: planner entered quantity; system derived unit price. */
  quantityMode?:
    | { mode: "quantity_units"; quantity: number; totalNet: number }
    | { mode: "unit_price_net_override" };
  /** Optional last-change context. */
  lastChange?: { date: string; from: number; to: number };
  daysSinceLastChange?: number;
  /** Optional GI document evidence URL. */
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
      ? "text-emerald-700"
      : color === "amber"
        ? "text-amber-700"
        : color === "red"
          ? "text-red-700"
          : "text-slate-700";

  return (
    <div className="space-y-3">
      {/* Comparison strip — center stage */}
      <div
        className="rounded-md border border-slate-200 bg-white p-3"
        data-color={color}
      >
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div className="text-xs text-slate-500">מחיר נוכחי</div>
            <div className="text-base font-semibold tabular-nums">
              {data.currentPrice !== null ? fmtIls(data.currentPrice) : "—"}
            </div>
          </div>
          <div className="text-center self-center text-slate-400">→</div>
          <div className="text-end">
            <div className="text-xs text-slate-500">מחיר מוצע</div>
            <div className={`text-base font-semibold tabular-nums ${colorClass}`}>
              {fmtIls(data.proposedPrice)}
            </div>
          </div>
        </div>
        <div className={`mt-1 text-end text-sm font-medium ${colorClass}`}>
          {fmtPct(data.pctDelta)}{" "}
          <span className="text-xs text-slate-500">
            (₪{(data.proposedPrice - (data.currentPrice ?? 0)).toFixed(4)})
          </span>
        </div>
      </div>

      {/* Supplier-match confidence */}
      <dl className="text-xs grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-slate-500">ספק:</dt>
        <dd>{data.supplierName}</dd>
        <dt className="text-slate-500">רכיב:</dt>
        <dd>{data.componentName}</dd>
        <dt className="text-slate-500">{copyForConfidence(data.confidence).split(":")[0]}:</dt>
        <dd>{copyForConfidence(data.confidence).split(":")[1]?.trim()}</dd>
      </dl>

      {/* Quantity mode */}
      {data.quantityMode ? (
        <div className="text-xs text-slate-500">
          {data.quantityMode.mode === "quantity_units"
            ? `${data.quantityMode.quantity.toLocaleString()} יח' · ${fmtIls(data.quantityMode.totalNet)} סה"כ נטו = ${fmtIls(data.proposedPrice)}/יח'`
            : `הזנת מחיר ידנית: ${fmtIls(data.proposedPrice)}/יח'`}
        </div>
      ) : null}

      {/* Last-change context */}
      {data.lastChange ? (
        <div className="text-xs text-slate-500">
          שינוי קודם: {data.lastChange.date} · {fmtIls(data.lastChange.from)} →{" "}
          {fmtIls(data.lastChange.to)}
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
          className="text-xs text-blue-600 hover:underline"
        >
          📄 צפה בחשבונית מקור (PDF)
        </Link>
      ) : null}
    </div>
  );
}
