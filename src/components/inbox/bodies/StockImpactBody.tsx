// Stock-impact Body — used by GR over-receipt + count + waste subtypes.
// Center-stage shows current → after-this-action quantities with delta.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.5.2 + §1.5.3
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.10

"use client";

export interface StockImpactBodyData {
  itemName: string;
  currentQty: number;
  afterQty: number;
  /** Pre-computed; usually equals afterQty - currentQty. */
  delta: number;
  unit?: string;
  reasonInInbox?: string;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function StockImpactBody({ data }: { data: StockImpactBodyData }) {
  const sign = data.delta > 0 ? "+" : "";
  const unitLabel = data.unit ?? "";
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <div className="text-sm font-medium mb-1">{data.itemName}</div>
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-slate-500">במלאי כעת:</dt>
          <dd className="tabular-nums text-end">{fmt(data.currentQty)} {unitLabel}</dd>
          <dt className="text-slate-500">אחרי הפעולה:</dt>
          <dd className="tabular-nums text-end font-semibold">
            {fmt(data.afterQty)} {unitLabel}
            <span
              className={
                data.delta > 0
                  ? "ms-2 text-emerald-700"
                  : data.delta < 0
                    ? "ms-2 text-red-700"
                    : "ms-2 text-slate-500"
              }
            >
              ({sign}
              {fmt(data.delta)})
            </span>
          </dd>
        </dl>
      </div>
      {data.reasonInInbox ? (
        <p className="text-xs text-slate-500">{data.reasonInInbox}</p>
      ) : null}
    </div>
  );
}
