"use client";

// One month of the circle: its orders, each one a way into its lines.
//
// The orders route pages newest first, 50 at a time; for an older month this
// asks for the next page until it has passed the month's start, so a month two
// years back costs a few requests, never the whole history up front. Completed
// drafts are left out: each one is also an order (design §2 F1).

import { useEffect, useMemo } from "react";
import { ShoppingBag } from "lucide-react";
import { useOrgOrders } from "../../_lib/api";
import { fmtAgorot, fmtDateTime } from "../../_lib/format";
import { UI } from "../../_lib/labels";
import { monthLabel, ymOf, type RingMonth } from "../../_lib/ring";
import type { OrderRow } from "../../_lib/types";
import { QueueError } from "../EmptyStates";
import { orderKindLabel } from "./OrderSheet";
import { Sheet } from "./Sheet";

export function MonthSheet({
  orgId,
  month,
  asOf,
  onOpenOrder,
  onClose,
}: {
  orgId: string;
  month: RingMonth;
  asOf: string | null;
  onOpenOrder: (o: OrderRow) => void;
  onClose: () => void;
}) {
  const orders = useOrgOrders(orgId, true);
  const loaded = useMemo(() => orders.data?.pages.flatMap((p) => p.rows) ?? [], [orders.data]);
  const oldest = loaded[loaded.length - 1];
  const passed = oldest ? ymOf(oldest.created_at) < month.ym : false;

  useEffect(() => {
    if (!passed && orders.hasNextPage && !orders.isFetchingNextPage && !orders.isError) void orders.fetchNextPage();
  }, [passed, orders]);

  const rows = loaded.filter(
    (o) => ymOf(o.created_at) === month.ym && !(o.class === "draft" && o.draft_status === "COMPLETED"),
  );
  const settled = passed || (orders.isSuccess && !orders.hasNextPage);

  return (
    <Sheet title={monthLabel(month.ym)} onClose={onClose} testId="month-sheet">
      <p className="text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
        {UI.monthCounts(month.filled, month.refunded, month.hollow, month.open)}
      </p>

      {orders.isError ? (
        <div className="mt-3">
          <QueueError onRetry={() => void orders.refetch()} what={UI.summaryTitle} />
        </div>
      ) : !settled ? (
        <div className="mt-3 flex flex-col gap-2" aria-busy="true">
          <span className="sr-only">{UI.monthLoading}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="h-12 animate-pulse rounded-[var(--s-radius)]" style={{ background: "hsl(var(--s-surface-sunken))" }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.monthEmpty}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {rows.map((o) => (
            <li key={o.gid}>
              <button type="button" className="s-river-row" onClick={() => onOpenOrder(o)} aria-haspopup="dialog">
                <ShoppingBag size={16} aria-hidden className="s-river-icon" data-class={o.class} />
                <span className="s-river-main">
                  <span>{orderKindLabel(o)} {o.name ?? ""}</span>
                  <span className="s-river-meta s-nums">
                    {UI.lastOrderLines(o.line_count)}
                    {o.ex_vat_agorot !== null ? ` · ${fmtAgorot(o.ex_vat_agorot)} ${UI.exVat}` : ""}
                  </span>
                </span>
                <time dateTime={o.created_at} className="s-river-meta s-nums">{fmtDateTime(o.created_at)}</time>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="s-nums mt-3 text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
        {UI.circleSource}
        {asOf ? <> · <bdi>{fmtDateTime(asOf)}</bdi></> : null}
      </p>
    </Sheet>
  );
}
