"use client";

import { useMemo, useState } from "react";
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

type TabType = "FG" | "RM_PKG";

async function fetchStock(itemType: TabType): Promise<StockRow[]> {
  const res = await fetch(`/api/stock?item_type=${itemType}`);
  if (!res.ok) throw new Error(`Stock fetch failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.rows ?? []);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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

function StockTable({ rows, search }: { rows: StockRow[]; search: string }) {
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
            <th className="py-2 pr-4 text-right">On Hand</th>
            <th className="py-2 pr-4">UOM</th>
            <th className="py-2">Last Movement</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.map((row) => (
            <tr key={`${row.item_type}-${row.item_id}`} className="hover:bg-gray-50">
              <td className="py-2 pr-4 font-mono text-xs text-gray-700">{row.item_id}</td>
              <td className="py-2 pr-4 text-gray-900">{row.display_name ?? "—"}</td>
              <td className="py-2 pr-4 text-right">
                <OnHandCell value={row.calculated_on_hand} />
              </td>
              <td className="py-2 pr-4 text-gray-600">{row.base_uom ?? "—"}</td>
              <td className="py-2 text-gray-500">{formatDate(row.last_event_at)}</td>
            </tr>
          ))}
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

  const rows = tab === "FG" ? (fgRows ?? []) : (rmRows ?? []);
  const isLoading = tab === "FG" ? fgLoading : rmLoading;
  const error = tab === "FG" ? fgError : rmError;

  return (
    <div className="space-y-6">
      <WorkflowHeader
        eyebrow="Stock"
        title="Inventory"
        description="Live on-hand balances. Red values indicate negative stock requiring investigation."
      />

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
            <StockTable rows={rows} search={search} />
          )}
        </div>
      </SectionCard>
    </div>
  );
}
