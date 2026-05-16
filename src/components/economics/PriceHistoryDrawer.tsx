"use client";

// ---------------------------------------------------------------------------
// <PriceHistoryDrawer> — secondary view onto price-change history.
//
// One drawer, two modes:
//   - mode="rm" : raw-material cost history (price_history) for a component.
//   - mode="fg" : finished-good sale-price history (fg_sale_prices) for an item.
//
// History is kept but secondary — surfaced here on demand, not on the main
// Economics tables.
// ---------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import { Drawer } from "@/components/overlays/Drawer";

interface HistoryRow {
  id: string;
  price: string;
  source: string;
  event_at: string;
  actor_snapshot: string;
  notes: string | null;
}

type RawSaleRow = {
  fg_sale_price_id: string;
  avg_sale_price_ils: string;
  source: string;
  event_at: string;
  actor_snapshot: string;
  notes: string | null;
};
type RawComponentRow = {
  price_history_id: string;
  unit_price_net: string;
  source: string;
  event_at: string;
  actor_snapshot: string;
  notes: string | null;
};
type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load history (HTTP ${res.status}).`);
  }
  return (await res.json()) as T;
}

function formatIls(value: string | null): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₪${n.toFixed(4)}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatActor(snapshot: string): string {
  // actor_snapshot is stored as '<manual:uuid>' / '<system:...>' / '<test:...>'.
  const m = /^<([^:]+):/.exec(snapshot);
  return m ? m[1] : snapshot;
}

export interface PriceHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  mode: "rm" | "fg";
  /** component_id (rm) or item_id (fg). Null while the drawer is closed. */
  id: string | null;
  /** Display name for the drawer subheader. */
  name: string;
}

export function PriceHistoryDrawer({
  open,
  onClose,
  mode,
  id,
  name,
}: PriceHistoryDrawerProps): JSX.Element {
  const url =
    id == null
      ? null
      : mode === "fg"
        ? `/api/economics/sale-prices/${encodeURIComponent(id)}/history`
        : `/api/economics/price-history/${encodeURIComponent(id)}`;

  const query = useQuery<HistoryRow[]>({
    queryKey: ["admin", "economics", "history", mode, id],
    queryFn: async (): Promise<HistoryRow[]> => {
      if (mode === "fg") {
        const data = await fetchJson<ListEnvelope<RawSaleRow>>(url!);
        return data.rows.map((r) => ({
          id: r.fg_sale_price_id,
          price: r.avg_sale_price_ils,
          source: r.source,
          event_at: r.event_at,
          actor_snapshot: r.actor_snapshot,
          notes: r.notes,
        }));
      }
      const data = await fetchJson<ListEnvelope<RawComponentRow>>(url!);
      return data.rows.map((r) => ({
        id: r.price_history_id,
        price: r.unit_price_net,
        source: r.source,
        event_at: r.event_at,
        actor_snapshot: r.actor_snapshot,
        notes: r.notes,
      }));
    },
    enabled: open && id != null,
  });

  const rows = query.data ?? [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={mode === "fg" ? "Sale price history" : "Cost history"}
      description={name}
      width="lg"
    >
      {query.isLoading ? (
        <div className="text-sm text-fg-muted">Loading history…</div>
      ) : query.isError ? (
        <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
          {(query.error as Error).message}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-bg-subtle/50 p-6 text-center text-sm text-fg-muted">
          No history recorded yet.
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-bg-subtle/60">
              <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                When
              </th>
              <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Price (₪)
              </th>
              <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Source
              </th>
              <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                By
              </th>
              <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.id}
                className="border-b border-border/40 last:border-b-0"
              >
                <td className="px-3 py-2 text-xs text-fg-muted">
                  {formatDateTime(r.event_at)}
                  {idx === 0 ? (
                    <span className="ml-1.5 text-3xs font-semibold text-accent">
                      current
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right text-sm tabular-nums">
                  {formatIls(r.price)}
                </td>
                <td className="px-3 py-2 text-xs text-fg-muted">{r.source}</td>
                <td className="px-3 py-2 text-xs text-fg-muted">
                  {formatActor(r.actor_snapshot)}
                </td>
                <td className="px-3 py-2 text-xs text-fg-muted" dir="auto">
                  {r.notes ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Drawer>
  );
}
