// ReadinessPanel — supplier/price readiness for the components referenced
// in the current draft. Right-side on desktop; sticky bottom drawer on
// mobile (mobileMode prop). Uses the same readiness map as the per-line
// pips so they always agree.

"use client";

import { useState } from "react";
import { formatPriceAge, priceAgeDays } from "@/lib/admin/recipe-readiness";
import { RECIPE_READINESS_POLICY } from "@/lib/policy/recipe-readiness";
import type { ComponentReadiness } from "@/lib/admin/recipe-readiness.types";

interface ReadinessPanelProps {
  readinessMap: Map<string, ComponentReadiness>;
  nowMs: number;
  onFix: (componentId: string) => void;
  /** Render as a sticky bottom drawer with a warnings-count toggle. */
  mobileMode?: boolean;
}

function rowNeedsFix(c: ComponentReadiness, nowMs: number): boolean {
  if (c.primary_supplier_id === null) return true;
  if (c.active_price_value === null) return true;
  const days = priceAgeDays(c.active_price_updated_at, nowMs);
  if (days !== null && days > RECIPE_READINESS_POLICY.PRICE_AGE_WARN_DAYS)
    return true;
  return false;
}

function RowsList({
  rows,
  nowMs,
  onFix,
}: {
  rows: ComponentReadiness[];
  nowMs: number;
  onFix: (componentId: string) => void;
}): JSX.Element {
  return (
    <ul className="mt-2 space-y-2 text-sm">
      {rows.map((r) => {
        const supplierCell = r.primary_supplier_name ?? "🟡 אין ספק";
        const priceCell =
          r.active_price_value === null
            ? "🟡 אין מחיר"
            : formatPriceAge(r.active_price_updated_at, nowMs);
        const needsFix = rowNeedsFix(r, nowMs);
        return (
          <li key={r.component_id} className="border-b py-1">
            <div className="font-medium">{r.component_name}</div>
            <div className="text-gray-700">
              {supplierCell} · {priceCell}
            </div>
            {needsFix && (
              <button
                type="button"
                onClick={() => onFix(r.component_id)}
                className="mt-1 text-xs text-blue-700 underline"
              >
                Fix
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ReadinessPanel({
  readinessMap,
  nowMs,
  onFix,
  mobileMode,
}: ReadinessPanelProps): JSX.Element | null {
  const rows = Array.from(readinessMap.values());
  const warningCount = rows.filter((r) => rowNeedsFix(r, nowMs)).length;
  const [openSheet, setOpenSheet] = useState(false);

  if (mobileMode) {
    if (warningCount === 0) return null;
    return (
      <>
        <button
          type="button"
          onClick={() => setOpenSheet(true)}
          className="fixed bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full bg-yellow-500 px-4 py-2 text-white shadow"
        >
          ⚠ {warningCount} {warningCount === 1 ? "warning" : "warnings"}
        </button>
        {openSheet && (
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-auto rounded-t-lg bg-white p-3 shadow-xl">
            <button
              type="button"
              onClick={() => setOpenSheet(false)}
              className="float-left"
              aria-label="Close"
            >
              ✕
            </button>
            <h3 className="font-semibold">Readiness</h3>
            <RowsList rows={rows} nowMs={nowMs} onFix={onFix} />
          </div>
        )}
      </>
    );
  }

  if (rows.length === 0) {
    return (
      <aside className="w-full p-3 lg:w-72">
        <h3 className="font-semibold">Readiness</h3>
        <p className="text-sm text-gray-500">אין רכיבים</p>
      </aside>
    );
  }

  return (
    <aside
      className="w-full p-3 lg:w-72"
      data-warning-count={warningCount}
    >
      <h3 className="font-semibold">Readiness ({warningCount} ⚠)</h3>
      <RowsList rows={rows} nowMs={nowMs} onFix={onFix} />
    </aside>
  );
}
