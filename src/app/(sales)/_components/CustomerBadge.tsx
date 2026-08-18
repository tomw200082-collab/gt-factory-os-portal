"use client";

import { fmtCount, fmtDate, fmtMoney } from "../_lib/format";
import { UI } from "../_lib/labels";
import { snapshotFacts } from "../_lib/wa";
import type { ShopifySnapshot } from "../_lib/types";

/** The neutral "we know this business" chip. Not a status, so not coloured. */
export function CustomerBadge() {
  return (
    <span data-testid="customer-badge" className="s-badge s-badge-customer">
      {UI.customerBadge}
    </span>
  );
}

const FACT_LABELS: Record<string, string> = {
  status: UI.customerStatus,
  rev12: UI.revenue12m,
  orders: UI.orderCount,
  days_since_last_order: UI.daysSinceOrder,
};

function renderValue(key: string, value: string): string {
  if (key === "rev12") return fmtMoney(value);
  if (key === "orders" || key === "days_since_last_order") return fmtCount(value);
  return value;
}

/**
 * What this business was worth and how long they have been quiet — the context
 * that changes how the call opens.
 *
 * Everything here is a dated snapshot from the customer tracker, so it is
 * labelled with its date and only the keys actually present are shown. A
 * missing figure stays missing; this surface never estimates one.
 */
export function CustomerContext({
  snapshot,
  snapshotAt,
}: {
  snapshot: ShopifySnapshot | null;
  snapshotAt: string | null;
}) {
  const facts = snapshotFacts(snapshot);
  if (facts.length === 0) return null;

  return (
    <div
      data-testid="customer-context"
      className="rounded-[var(--s-radius-sm)] px-3 py-2"
      style={{ background: "hsl(var(--s-surface-sunken))" }}
    >
      <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {facts.map((fact) => (
          <div key={fact.key} className="flex items-baseline gap-1.5">
            <dt className="text-[11px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
              {FACT_LABELS[fact.key] ?? fact.key}
            </dt>
            <dd
              className="s-nums text-[13px] font-medium"
              style={{ color: "hsl(var(--s-fg))" }}
            >
              {renderValue(fact.key, fact.value)}
            </dd>
          </div>
        ))}
      </dl>
      {snapshotAt ? (
        <p className="mt-1 text-[11px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
          {UI.snapshotAsOf(fmtDate(snapshotAt))}
        </p>
      ) : null}
    </div>
  );
}
