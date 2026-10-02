"use client";

// One order: its lines, its value before VAT, and when the mirror read it.

import { useOrder } from "../../_lib/api";
import { fmtAgorot, fmtDate, fmtDateTime } from "../../_lib/format";
import { DRAFT_STATUS_LABELS, ORDER_CLASS_LABELS, UI } from "../../_lib/labels";
import type { OrderRow } from "../../_lib/types";
import { QueueError } from "../EmptyStates";
import { Sheet } from "./Sheet";

export function orderKindLabel(order: Pick<OrderRow, "class" | "draft_status">): string {
  if (order.class === "draft") return DRAFT_STATUS_LABELS[order.draft_status ?? ""] ?? ORDER_CLASS_LABELS.draft;
  return ORDER_CLASS_LABELS[order.class];
}

export function OrderSheet({ orgId, order, onClose }: { orgId: string; order: Pick<OrderRow, "gid" | "name" | "created_at" | "class" | "draft_status">; onClose: () => void }) {
  const detail = useOrder(orgId, order.gid);
  const title = `${order.name ?? UI.orderNameless} · ${fmtDate(order.created_at)}`;

  return (
    <Sheet title={title} onClose={onClose} testId="order-sheet">
      <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
        {orderKindLabel(order)}
      </p>
      {detail.isLoading ? (
        <div className="mt-3 flex flex-col gap-2" aria-busy="true">
          <span className="sr-only">{UI.loading}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="h-11 animate-pulse rounded-[var(--s-radius)]" style={{ background: "hsl(var(--s-surface-sunken))" }} />
          ))}
        </div>
      ) : null}
      {detail.isError ? (
        <div className="mt-3">
          <QueueError onRetry={() => void detail.refetch()} what={UI.orderLinesTitle} />
        </div>
      ) : null}
      {detail.data ? (
        <>
          <h3 className="s-section-heading mt-4">{UI.orderLinesTitle}</h3>
          {detail.data.lines.length === 0 ? (
            <p className="mt-2 text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.orderNoLines}</p>
          ) : (
            <ul className="mt-2 flex flex-col">
              {detail.data.lines.map((line, i) => (
                <li key={`${line.sku ?? "x"}-${i}`} className="s-field flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 text-[14px] leading-snug [overflow-wrap:anywhere]" style={{ color: "hsl(var(--s-fg))" }}>
                    {line.title ?? line.sku ?? UI.orderNameless}
                    <span className="s-nums ms-2" style={{ color: "hsl(var(--s-fg-muted))" }}>
                      {UI.orderQuantity(line.quantity)}
                    </span>
                  </span>
                  <span className="s-nums shrink-0 text-[14px]" style={{ color: "hsl(var(--s-fg))" }}>
                    {fmtAgorot(line.ex_vat_agorot)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t pt-3" style={{ borderColor: "hsl(var(--s-border))" }}>
            <span className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.exVat}</span>
            <span className="s-nums text-[17px] font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
              {fmtAgorot(detail.data.ex_vat_agorot)}
            </span>
          </div>
          <p className="mt-3 text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
            {UI.contactFrom(UI.sourceShopify, fmtDateTime(detail.data.provenance.observed_at))}
          </p>
        </>
      ) : null}
    </Sheet>
  );
}
