"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";

interface StockRow {
  site_id: string;
  item_type: string;
  item_id: string;
  display_name: string | null;
  base_uom: string | null;
  calculated_on_hand: string;
  last_event_at: string | null;
}

interface StockValueRow {
  item_type: string;
  item_id: string;
  unit_cost_ils: string | null;
  total_value_ils: string | null;
  supply_method: string | null;
}

interface StockValueResponse {
  as_of: string;
  rows: StockValueRow[];
  total_value_ils: string;
  items_with_cost: number;
  items_without_cost: number;
  row_count: number;
}

type TabType = "FG" | "RM_PKG";

async function fetchStock(itemType: TabType): Promise<StockRow[]> {
  const res = await fetch(`/api/stock?item_type=${itemType}`);
  if (!res.ok) throw new Error("Could not load stock data. Check your connection and try refreshing.");
  const data = await res.json();
  return Array.isArray(data) ? data : (data.rows ?? []);
}

async function fetchStockValue(): Promise<StockValueResponse> {
  const res = await fetch("/api/stock/value");
  if (!res.ok) throw new Error("Could not load inventory value. Check your connection and try refreshing.");
  return res.json() as Promise<StockValueResponse>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtIls(val: string | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const n = Number(val);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("en-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function OnHandCell({ value }: { value: string }) {
  const num = Number(value);
  const isNeg = num < 0;
  const display = isNaN(num) ? value : num.toFixed(2);
  return (
    <span className={isNeg ? "font-medium text-danger-fg" : undefined}>
      {display}
    </span>
  );
}

type ValueMap = Map<string, { unit_cost: string | null; total_value: string | null; supply_method: string | null }>;

function StockTable({
  rows,
  search,
  valueMap,
}: {
  rows: StockRow[];
  search: string;
  valueMap: ValueMap | null;
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.item_id.toLowerCase().includes(q) ||
        (r.display_name ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  if (filtered.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-fg-muted">
        No items match your search.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            <th className="py-2 pr-4">Item</th>
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4 text-right" title="Calculated from posted ledger events — excludes pending movements">On Hand</th>
            <th className="py-2 pr-4">UOM</th>
            <th className="py-2 pr-4 text-right">Unit Cost</th>
            <th className="py-2 pr-4 text-right">Value (ILS)</th>
            <th className="py-2">Last Movement</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {filtered.map((row) => {
            const vKey = `${row.item_type}:${row.item_id}`;
            const v = valueMap?.get(vKey) ?? null;
            return (
              <tr key={`${row.item_type}-${row.item_id}`} className="hover:bg-bg-subtle/30">
                <td className="py-2 pr-4 font-mono text-xs text-fg-muted">
                  <Link href={`/admin/masters/items/${encodeURIComponent(row.item_id)}`} className="hover:text-accent hover:underline">{row.item_id}</Link>
                </td>
                <td className="py-2 pr-4 text-fg">{row.display_name ?? "—"}</td>
                <td className="py-2 pr-4 text-right">
                  <OnHandCell value={row.calculated_on_hand} />
                </td>
                <td className="py-2 pr-4 text-fg-muted">{row.base_uom ?? "—"}</td>
                <td className="py-2 pr-4 text-right text-fg-muted">
                  {v && v.unit_cost !== null
                    ? fmtIls(v.unit_cost)
                    : (() => {
                        if (row.item_type === "FG" && v?.supply_method === "MANUFACTURED") {
                          return <span className="text-xs italic text-fg-subtle">Rolled-up cost pending</span>;
                        }
                        if (v !== null) {
                          return (
                            <Link href={`/admin/masters/items/${encodeURIComponent(row.item_id)}`} className="text-xs text-warning-fg hover:underline" title="Set cost in item master">
                              Cost not set
                            </Link>
                          );
                        }
                        return <span>—</span>;
                      })()}
                </td>
                <td className="py-2 pr-4 text-right font-medium text-fg">
                  {v && v.total_value !== null
                    ? fmtIls(v.total_value)
                    : (() => {
                        if (row.item_type === "FG" && v?.supply_method === "MANUFACTURED") {
                          return <span className="text-xs italic text-fg-subtle">Pending</span>;
                        }
                        if (v !== null) {
                          return <span className="text-xs text-warning-fg">—</span>;
                        }
                        return <span>—</span>;
                      })()}
                </td>
                <td className="py-2 text-fg-muted">{formatDate(row.last_event_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function InventoryPage() {
  const [tab, setTab] = useState<TabType>("FG");
  const [search, setSearch] = useState("");

  const { data: fgRows, isLoading: fgLoading, error: fgError } = useQuery({
    queryKey: ["stock", "FG"],
    queryFn: () => fetchStock("FG"),
    staleTime: 60_000,
  });

  const { data: rmRows, isLoading: rmLoading, error: rmError } = useQuery({
    queryKey: ["stock", "RM_PKG"],
    queryFn: () => fetchStock("RM_PKG"),
    staleTime: 60_000,
  });

  const { data: valueData } = useQuery({
    queryKey: ["stock", "value"],
    queryFn: fetchStockValue,
    staleTime: 5 * 60_000,
  });

  const valueMap = useMemo<ValueMap | null>(() => {
    if (!valueData) return null;
    const m: ValueMap = new Map();
    for (const r of valueData.rows) {
      m.set(`${r.item_type}:${r.item_id}`, {
        unit_cost: r.unit_cost_ils,
        total_value: r.total_value_ils,
        supply_method: r.supply_method,
      });
    }
    return m;
  }, [valueData]);

  const rows = tab === "FG" ? (fgRows ?? []) : (rmRows ?? []);
  const isLoading = tab === "FG" ? fgLoading : rmLoading;
  const error = tab === "FG" ? fgError : rmError;

  return (
    <div className="space-y-6">
      <WorkflowHeader
        eyebrow="Stock"
        title="Inventory"
        description="Calculated stock balances derived from the ledger. Includes only posted events — pending events do not affect these numbers. Red values indicate negative stock requiring investigation."
      />

      {valueData && (
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-bg-subtle/40 px-4 py-3">
          <div>
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Total inventory value
            </span>
            <div className="mt-0.5 text-xl font-semibold text-fg-strong">
              {fmtIls(valueData.total_value_ils)}
            </div>
            <div className="mt-0.5 text-xs text-fg-muted">
              RM &amp; packaging + purchased finished goods. Manufactured FG cost rolled up separately.
            </div>
            {valueData.as_of ? (
              <div className="mt-0.5 text-xs text-fg-subtle">
                As of {new Date(valueData.as_of).toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </div>
            ) : null}
          </div>
          <div className="ml-6 border-l border-border/60 pl-6 text-sm text-fg-muted">
            {valueData.items_with_cost} items with cost ·{" "}
            {valueData.items_without_cost > 0 ? (
              <span className="text-warning-fg">
                {valueData.items_without_cost} missing cost data
              </span>
            ) : (
              <span className="text-success-fg">all items have cost data</span>
            )}
          </div>
        </div>
      )}

      <SectionCard eyebrow="View" title="Current Stock">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {(["FG", "RM_PKG"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setSearch(""); }}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t
                    ? "bg-fg text-bg"
                    : "bg-bg-raised text-fg-muted hover:bg-bg-subtle hover:text-fg"
                }`}
              >
                {t === "FG" ? "Finished Goods" : "Raw Materials & Packaging"}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by item ID or name…"
            className="w-full max-w-sm rounded border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          />

          {isLoading && (
            <p className="py-8 text-center text-sm text-fg-muted">Loading…</p>
          )}
          {error && (
            <div className="rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg">
              Could not load stock data. Check your connection and try refreshing.
            </div>
          )}
          {!isLoading && !error && (
            <StockTable rows={rows} search={search} valueMap={valueMap} />
          )}
        </div>
      </SectionCard>
    </div>
  );
}
