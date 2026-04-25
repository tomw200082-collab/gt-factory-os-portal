"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";

interface LedgerRow {
  movement_id: string;
  movement_type: string;
  item_type: string;
  item_id: string;
  qty_delta: string;
  uom: string;
  event_at: string;
  post_status: string;
  reported_by_user_id: string | null;
  reported_by_snapshot: string | null;
  source_event_id: string | null;
  notes: string | null;
}

interface LedgerResponse {
  rows: LedgerRow[];
  total: number;
}

const PAGE_SIZE = 100;

const MOVEMENT_TYPES = [
  "GR_POSTED",
  "WASTE_POSTED",
  "production_output",
  "production_consumption",
  "production_scrap",
] as const;

const ITEM_TYPES = ["FG", "RM", "PKG"] as const;

interface Filters {
  item_id: string;
  item_type: string;
  movement_type: string;
  from_date: string;
  to_date: string;
}

const EMPTY_FILTERS: Filters = {
  item_id: "",
  item_type: "",
  movement_type: "",
  from_date: "",
  to_date: "",
};

function buildQuery(filters: Filters, offset: number): string {
  const params = new URLSearchParams();
  if (filters.item_id) params.set("item_id", filters.item_id);
  if (filters.item_type) params.set("item_type", filters.item_type);
  if (filters.movement_type) params.set("movement_type", filters.movement_type);
  // API expects ISO datetime params named "from"/"to"; inputs are date-only so append time bounds.
  if (filters.from_date) params.set("from", `${filters.from_date}T00:00:00Z`);
  if (filters.to_date) params.set("to", `${filters.to_date}T23:59:59Z`);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  return params.toString();
}

async function fetchLedger(filters: Filters, offset: number): Promise<LedgerResponse> {
  const qs = buildQuery(filters, offset);
  const res = await fetch(`/api/stock/ledger?${qs}`);
  if (!res.ok) throw new Error(`Ledger fetch failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return { rows: data, total: data.length };
  return { rows: data.rows ?? [], total: data.total ?? (data.rows ?? []).length };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function QtyDeltaCell({ value }: { value: string }) {
  const num = Number(value);
  const isPos = num >= 0;
  const display = isNaN(num) ? value : `${isPos ? "+" : ""}${num.toFixed(3)}`;
  return (
    <span className={isPos ? "font-medium text-success-fg" : "font-medium text-danger-fg"}>
      {display}
    </span>
  );
}

export default function MovementLogPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["stock-ledger", appliedFilters, offset],
    queryFn: () => fetchLedger(appliedFilters, offset),
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applyFilters() {
    setAppliedFilters(filters);
    setOffset(0);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setOffset(0);
  }

  function handleFieldChange(field: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="space-y-6">
      <WorkflowHeader
        eyebrow="Stock"
        title="Movement Log"
        description="Ledger history for all stock movements. Filter by item, type, or date range."
      />

      <SectionCard eyebrow="Filter" title="Search Movements">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Item ID
            </label>
            <input
              type="text"
              value={filters.item_id}
              onChange={(e) => handleFieldChange("item_id", e.target.value)}
              placeholder="e.g. SKU-001"
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Item Type
            </label>
            <select
              value={filters.item_type}
              onChange={(e) => handleFieldChange("item_type", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">All</option>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Movement Type
            </label>
            <select
              value={filters.movement_type}
              onChange={(e) => handleFieldChange("movement_type", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">All</option>
              {MOVEMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              From Date
            </label>
            <input
              type="date"
              value={filters.from_date}
              onChange={(e) => handleFieldChange("from_date", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              To Date
            </label>
            <input
              type="date"
              value={filters.to_date}
              onChange={(e) => handleFieldChange("to_date", e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={applyFilters}
            className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            Apply
          </button>
          <button
            onClick={clearFilters}
            className="rounded border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      </SectionCard>

      <SectionCard eyebrow="Results" title="Ledger Entries">
        {isLoading && (
          <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
        )}
        {error && (
          <p className="py-8 text-center text-sm text-red-600">
            Failed to load ledger data. Check API connectivity.
          </p>
        )}
        {!isLoading && !error && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">
            No movements found for the selected filters.
          </p>
        )}
        {!isLoading && !error && rows.length > 0 && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4">Event At</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Item</th>
                    <th className="py-2 pr-4 text-right">Qty Δ</th>
                    <th className="py-2 pr-4">UOM</th>
                    <th className="py-2 pr-4">Submitted by</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row.movement_id} className="hover:bg-gray-50">
                      <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">
                        {formatDate(row.event_at)}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-gray-700">
                        {row.movement_type}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs text-gray-700">{row.item_id}</span>
                        <span className="ml-1 text-xs text-gray-400">({row.item_type})</span>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <QtyDeltaCell value={row.qty_delta} />
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{row.uom}</td>
                      <td className="py-2 pr-4 text-gray-600">
                        {row.reported_by_snapshot ?? "—"}
                      </td>
                      <td className="py-2 text-gray-600">{row.post_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-xs text-gray-500">
                Page {currentPage} of {totalPages} · {total} total
              </span>
              <div className="flex gap-2">
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
