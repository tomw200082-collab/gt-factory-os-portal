// ReadinessPanel — supplier/price readiness for the components referenced
// in the current draft. Right-side on desktop; sticky bottom drawer on
// mobile (mobileMode prop). Uses the same readiness map as the per-line
// pips so they always agree.

"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
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

function StatusDot({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 ${ok ? "text-success-fg" : "text-warning-fg"}`}
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${ok ? "bg-success" : "bg-warning"}`}
      />
      {label}
    </span>
  );
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
    <ul className="divide-y divide-border">
      {rows.map((r) => {
        const supplierOk = r.primary_supplier_id !== null;
        const priceOk =
          r.active_price_value !== null &&
          (priceAgeDays(r.active_price_updated_at, nowMs) ?? 0) <=
            RECIPE_READINESS_POLICY.PRICE_AGE_WARN_DAYS;
        const needsFix = rowNeedsFix(r, nowMs);
        return (
          <li key={r.component_id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-fg">
                {r.component_name}
              </span>
              {needsFix && (
                <button
                  type="button"
                  onClick={() => onFix(r.component_id)}
                  className="rounded-sm border border-border bg-bg-raised px-2 py-0.5 text-3xs font-medium text-fg hover:border-accent hover:bg-accent-softer hover:text-accent"
                >
                  Fix
                </button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <StatusDot
                ok={supplierOk}
                label={
                  supplierOk
                    ? r.primary_supplier_name ?? "Primary supplier set"
                    : "No primary supplier"
                }
              />
              <StatusDot
                ok={priceOk}
                label={
                  r.active_price_value === null
                    ? "No active price"
                    : `Price · ${formatPriceAge(r.active_price_updated_at, nowMs)}`
                }
              />
            </div>
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
          className="fixed bottom-4 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-warning-border bg-warning px-4 py-2 text-sm font-medium text-warning-soft shadow-md"
        >
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
          {warningCount} {warningCount === 1 ? "warning" : "warnings"}
        </button>
        {openSheet && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-fg/40">
            <div className="max-h-[80vh] overflow-auto rounded-t-lg border-t border-border bg-bg-raised shadow-xl">
              <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-fg-strong">
                  Supplier &amp; price readiness
                </h3>
                <button
                  type="button"
                  onClick={() => setOpenSheet(false)}
                  aria-label="Close"
                  className="rounded-sm p-1 text-fg-muted hover:bg-bg-subtle"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              </header>
              <RowsList rows={rows} nowMs={nowMs} onFix={onFix} />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <aside
      data-warning-count={warningCount}
      className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-auto rounded-md border border-border bg-bg-raised shadow-sm"
    >
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-fg-strong">
          Supplier &amp; price readiness
        </h3>
        <p className="mt-0.5 text-3xs text-fg-muted">
          {warningCount === 0
            ? "All components clean"
            : `${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`}
        </p>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-fg-muted">
          No components on this version.
        </p>
      ) : (
        <RowsList rows={rows} nowMs={nowMs} onFix={onFix} />
      )}
    </aside>
  );
}
