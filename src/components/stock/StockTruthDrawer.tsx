"use client";

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Drawer } from '@/components/overlays/Drawer';
import { cn } from '@/lib/cn';

interface LedgerEvent {
  movement_id: string;
  movement_type: string;
  qty_delta: string;
  uom: string;
  event_at: string;
  posted_at: string;
  post_status: string;
  reported_by_snapshot: string | null;
  po_number?: string | null;
  supplier_name?: string | null;
  lw_destination_city?: string | null;
}

interface LedgerResponse {
  rows: LedgerEvent[];
  count: number;
  total_matching: number;
}

async function fetchRecentLedger(itemId: string): Promise<LedgerResponse> {
  const url = `/api/stock/ledger?item_id=${encodeURIComponent(itemId)}&limit=10`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`LEDGER_FETCH_${res.status}`);
  return res.json() as Promise<LedgerResponse>;
}

export interface StockTruthDrawerProps {
  itemId: string;
  itemType: string;
  displayName: string | null;
  /** Raw signed on-hand (string form from the API). */
  onHandRaw: string;
  /** Magnitude of the gap below floor (string form). */
  floorGap: string;
  uom: string | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Stock Truth Drawer — opens from a Reconcile badge click.
 *
 * Shows:
 *   - Header (delegated to <Drawer>): item name + itemId · itemType
 *   - Math summary block: floor gap, calculated vs display value, prose explanation
 *   - Recent ledger events (last 10) for the item
 *   - CTA: Post corrective Goods Receipt (opens in new tab; drawer stays open)
 *
 * Composes the canonical <Drawer> primitive (VISUAL-001).
 *
 * Spec: PRODUCTION/docs/superpowers/specs/2026-05-13-display-clamp-physical-stock-truth-design.md §4.2
 */
export function StockTruthDrawer({
  itemId,
  itemType,
  displayName,
  onHandRaw,
  floorGap,
  uom,
  open,
  onClose,
}: StockTruthDrawerProps) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['stock-truth-drawer', itemId],
    queryFn: () => fetchRecentLedger(itemId),
    enabled: open,
    staleTime: 30_000,
  });

  const hasEvents = data ? data.rows.length > 0 : false;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={displayName ?? itemId}
      description={`${itemId} · ${itemType}`}
      width="md"
    >
      {/* Math summary */}
      <div className="rounded-md border border-warning/30 bg-warning-softer/40 p-3 text-sm">
        <div className="font-medium text-warning-fg">
          Below physical floor by {floorGap} {uom ?? 'units'}
        </div>
        <div className="mt-2 space-y-0.5 font-mono text-xs text-fg-muted">
          <div>Calculated on-hand : {onHandRaw}</div>
          <div>Display value      : 0</div>
        </div>
        <p className="mt-2 text-2xs text-fg-muted">
          The system has recorded more outflow events than offsetting
          receipts. Likely causes: a missing Goods Receipt, an
          out-of-sequence shipment post, or an under-counted physical
          count. Investigate below.
        </p>
      </div>

      {/* Recent ledger events */}
      <h3 className="mt-5 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
        Recent ledger events
      </h3>
      {isLoading && (
        <div className="mt-2 space-y-1.5" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-bg-subtle" />
          ))}
        </div>
      )}
      {isError && (
        <div
          className="mt-2 rounded-md border border-danger/40 bg-danger-softer/40 p-3 text-xs text-danger-fg"
          role="alert"
        >
          <p>Could not load ledger events.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 inline-flex items-center gap-1 rounded border border-danger/40 bg-bg px-2 py-0.5 text-2xs font-medium text-danger-fg hover:bg-danger-softer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            Try again
          </button>
        </div>
      )}
      {data && data.rows.length === 0 && (
        <p className="mt-2 text-xs text-fg-muted">
          No ledger events found for this item. The anchor itself may be wrong — a corrective physical count will repair the projection.
        </p>
      )}
      {data && data.rows.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {data.rows.map((ev) => (
            <li
              key={ev.movement_id}
              className="flex items-center justify-between gap-2 rounded border border-border/50 bg-bg-subtle/60 px-2 py-1 text-2xs"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-fg">{ev.movement_type}</div>
                <div className="truncate text-fg-muted">
                  {new Date(ev.event_at).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {ev.reported_by_snapshot ? ` · ${ev.reported_by_snapshot}` : ''}
                  {ev.po_number ? ` · PO ${ev.po_number}` : ''}
                  {ev.lw_destination_city ? ` · → ${ev.lw_destination_city}` : ''}
                </div>
              </div>
              <div className={cn(
                'shrink-0 font-mono tabular-nums',
                Number(ev.qty_delta) < 0 ? 'text-danger-fg' : 'text-success-fg',
              )}>
                {Number(ev.qty_delta) > 0 ? '+' : ''}{ev.qty_delta} {ev.uom}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* CTA — opens in a new tab to preserve drawer context (INTER-002).
          When there are no ledger events, the CTA is gated to a count-corrective
          path (INTER-004). Until the count form route is confirmed by the
          executor, render the no-events case as a disabled span. */}
      <div className="mt-6 flex items-center justify-between gap-2">
        {hasEvents ? (
          <Link
            href={`/stock/receipts?item_id=${encodeURIComponent(itemId)}`}
            target="_blank"
            rel="noopener"
            className="btn btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            Post corrective Goods Receipt
          </Link>
        ) : (
          <span
            aria-disabled="true"
            title="Physical-count form route pending — see follow-up plan."
            className="btn btn-sm cursor-not-allowed opacity-50"
          >
            Post corrective count (coming soon)
          </span>
        )}
      </div>
    </Drawer>
  );
}
