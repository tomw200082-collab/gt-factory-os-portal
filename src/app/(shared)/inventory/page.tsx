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
  if (!res.ok) throw new Error(`Stock fetch failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.rows ?? []);
}

async function fetchStockValue(): Promise<StockValueResponse> {
  const res = await fetch("/api/stock/value");
  if (!res.ok) throw new Error(`Stock value fetch failed: ${res.status}`);
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
    <span className={isNeg ? "text-red-600 font-medium" : undefined}>
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
      <p className="py-8 text-center text-sm text-gray-500">
        No items match your search.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="py-2 pr-4">Item ID</th>
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4 text-right" title="Calculated from posted ledger events — excludes pending movements">On Hand</th>
            <th className="py-2 pr-4">UOM</th>
            <th className="py-2 pr-4 text-right">Unit Cost</th>
            <th className="py-2 pr-4 text-right">Value (ILS)</th>
            <th className="py-2">Last Movement</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.map((row) => {
            const vKey = `${row.item_type}:${row.item_id}`;
            const v = valueMap?.get(vKey) ?? null;
            return (
              <tr key={`${row.item_type}-${row.item_id}`} className="hover:bg-gray-50">
                <td className="py-2 pr-4 font-mono text-xs text-gray-700">
                  <Link href={`/admin/masters/items/${encodeURIComponent(row.item_id)}`} className="hover:underline hover:text-blue-600">{row.item_id}</Link>
                </td>
                <td className="py-2 pr-4 text-gray-900">{row.display_name ?? "—"}</td>
                <td className="py-2 pr-4 text-right">
                  <OnHandCell value={row.calculated_on_hand} />
                </td>
                <td className="py-2 pr-4 text-gray-600">{row.base_uom ?? "—"}</td>
                <td className="py-2 pr-4 text-right text-gray-600">
                  {v && v.unit_cost !== null
                    ? fmtIls(v.unit_cost)
                    : (() => {
                        if (row.item_type === "FG" && v?.supply_method === "MANUFACTURED") {
                          return <span className="text-xs text-gray-400 italic">Computed (Phase 2)</span>;
                        }
                        if (v !== null) {
                          return (
                            <Link href={`/admin/masters/items/${encodeURIComponent(row.item_id)}`} className="text-xs text-amber-600 hover:underline" title="Set cost in item master">
                              Cost not set
                            </Link>
                          );
                        }
                        return <span>—</span>;
                      })()}
                </td>
                <td className="py-2 pr-4 text-right font-medium text-gray-800">
                  {v && v.total_value !== null
                    ? fmtIls(v.total_value)
                    : (() => {
                        if (row.item_type === "FG" && v?.supply_method === "MANUFACTURED") {
                          return <span className="text-xs text-gray-400 italic">Computed (Phase 2)</span>;
                        }
                        if (v !== null) {
                          return <span className="text-xs text-amber-600">—</span>;
                        }
                        return <span>—</span>;
                      })()}
                </td>
                <td className="py-2 text-gray-500">{formatDate(row.last_event_at)}</td>
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
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Total inventory value
            </span>
            <div className="mt-0.5 text-xl font-semibold text-gray-900">
              {fmtIls(valueData.total_value_ils)}
            </div>
            <div className="mt-0.5 text-xs text-gray-500">
              RM &amp; packaging + purchased finished goods. Manufactured FG value computed separately.
            </div>
            {valueData.as_of ? (
              <div className="mt-0.5 text-xs text-gray-400">
                As of {new Date(valueData.as_of).toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </div>
            ) : null}
          </div>
          <div className="ml-6 border-l border-gray-200 pl-6 text-sm text-gray-500">
            {valueData.items_with_cost} items with cost ·{" "}
            {valueData.items_without_cost > 0 ? (
              <span className="text-amber-600">
                {valueData.items_without_cost} missing cost data
              </span>
            ) : (
              <span className="text-green-600">all items have cost data</span>
            )}
          </div>
        </div>
      )}

      <SectionCard eyebrow="View" title="Current Stock">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setTab("FG"); setSearch(""); }}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "FG"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Finished Goods
            </button>
            <button
              onClick={() => { setTab("RM_PKG"); setSearch(""); }}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "RM_PKG"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Raw Materials & Packaging
            </button>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by item ID or name…"
            className="w-full max-w-sm rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />

          {isLoading && (
            <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
          )}
          {error && (
            <p className="py-8 text-center text-sm text-red-600">
              Failed to load stock data. Check API connectivity.
            </p>
          )}
          {!isLoading && !error && (
            <StockTable rows={rows} search={search} valueMap={valueMap} />
          )}
        </div>
      </SectionCard>
    </div>
  );
}
