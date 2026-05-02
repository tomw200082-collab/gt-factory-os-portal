"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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

// Cycle 19 — PO header shape returned by GET /api/purchase-orders/:po_id.
// Used solely to resolve a human-readable po_number from the ?po_id= query
// param so the active-filter chip can show "Filtered by PO: PO-2026-00112"
// instead of the raw text PK. Mirrors the canonical shape consumed at
// /purchase-orders/[po_id]/page.tsx + /stock/receipts/page.tsx (cycle 16).
interface PurchaseOrderHeaderLite {
  po_id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string | null;
  status: string;
}

interface PurchaseOrderDetailResponse {
  row: PurchaseOrderHeaderLite;
}

const PAGE_SIZE = 100;

const MOVEMENT_TYPES = [
  "GR_POSTED",
  "WASTE_POSTED",
  "production_output",
  "production_consumption",
  "production_scrap",
] as const;

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  GR_POSTED: "Goods Receipt",
  WASTE_POSTED: "Waste / Adjustment",
  production_output: "Production Output",
  production_consumption: "Production Consumption",
  production_scrap: "Production Scrap",
};

function fmtMovementType(raw: string): string {
  return MOVEMENT_TYPE_LABELS[raw] ?? raw;
}

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

function buildQuery(
  filters: Filters,
  poId: string,
  offset: number,
): string {
  const params = new URLSearchParams();
  if (filters.item_id) params.set("item_id", filters.item_id);
  if (filters.item_type) params.set("item_type", filters.item_type);
  if (filters.movement_type) params.set("movement_type", filters.movement_type);
  // API expects ISO datetime params named "from"/"to"; inputs are date-only so append time bounds.
  if (filters.from_date) params.set("from", `${filters.from_date}T00:00:00Z`);
  if (filters.to_date) params.set("to", `${filters.to_date}T23:59:59Z`);
  // Cycle 19: po_id from URL ?po_id= search param. Backend filter shipped in
  // W1 cycle 18 Task C (api/src/stock/{schemas.ts,ledger-handler.ts}). The
  // portal proxy at src/app/api/stock/ledger/route.ts forwards query params
  // verbatim (forwardQuery: true), so adding po_id here propagates to the
  // upstream /api/v1/queries/stock/ledger endpoint with no proxy change.
  if (poId) params.set("po_id", poId);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));
  return params.toString();
}

async function fetchLedger(
  filters: Filters,
  poId: string,
  offset: number,
): Promise<LedgerResponse> {
  const qs = buildQuery(filters, poId, offset);
  const res = await fetch(`/api/stock/ledger?${qs}`);
  if (!res.ok) throw new Error("Could not load movement log. Check your connection and try refreshing.");
  const data = await res.json();
  if (Array.isArray(data)) return { rows: data, total: data.length };
  return { rows: data.rows ?? [], total: data.total ?? (data.rows ?? []).length };
}

async function fetchPoHeader(
  poId: string,
): Promise<PurchaseOrderDetailResponse> {
  const res = await fetch(`/api/purchase-orders/${encodeURIComponent(poId)}`);
  if (!res.ok) throw new Error("PO header lookup failed");
  return (await res.json()) as PurchaseOrderDetailResponse;
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
  const searchParams = useSearchParams();
  const router = useRouter();

  // Cycle 19 — read ?po_id= from URL on every render so a navigation that
  // changes the query string (e.g. "Clear filter" replaces the URL) takes
  // effect immediately. We do NOT seed a useState from this — the URL is
  // the source of truth for the po_id filter.
  const urlPoId = searchParams?.get("po_id") ?? "";

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);

  // Reset pagination when the URL po_id changes (e.g. operator arrives via
  // the GR success-panel "View movement log →" link, or clears the chip).
  useEffect(() => {
    setOffset(0);
  }, [urlPoId]);

  // Resolve po_number from po_id for the chip label. Tolerant: if the lookup
  // fails (PO not found, network error, auth glitch) we fall back to the raw
  // po_id text — Tom-locked rule "names not IDs in UI" is best-effort here
  // because the filter must still work even if the header endpoint flickers.
  const poHeaderQuery = useQuery<PurchaseOrderDetailResponse>({
    queryKey: ["stock-ledger", "po-header", urlPoId],
    queryFn: () => fetchPoHeader(urlPoId),
    enabled: Boolean(urlPoId),
    staleTime: 60_000,
    retry: 0,
  });
  const poHeader = poHeaderQuery.data?.row ?? null;
  const poDisplay = useMemo(() => {
    if (!urlPoId) return "";
    if (poHeader?.po_number) return poHeader.po_number;
    return urlPoId; // graceful fallback
  }, [urlPoId, poHeader]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stock-ledger", appliedFilters, urlPoId, offset],
    queryFn: () => fetchLedger(appliedFilters, urlPoId, offset),
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

  // Cycle 19 — drop the ?po_id= search param + refetch. We use router.replace
  // (not push) to avoid littering history with toggles between filtered /
  // unfiltered states. Other filters (item_id, etc.) are preserved by leaving
  // them out of the new URLSearchParams instance — they live in component
  // state, not the URL.
  function clearPoFilter() {
    router.replace("/stock/movement-log");
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

      {/*
        Cycle 19 — active PO filter chip. Renders only when ?po_id= is on the
        URL. Info-tone styling, distinct from the form filters below. The
        "Clear filter" affordance drops the search param and refetches; other
        filters (item_id, etc.) remain untouched. If the PO header lookup is
        in flight or failed, we fall back to the raw po_id so the chip is
        informative even in a degraded state.
      */}
      {urlPoId ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md border border-info/30 bg-info-softer/30 px-4 py-3 text-sm"
          role="note"
          aria-live="polite"
          data-testid="movement-log-po-filter-chip"
        >
          <span className="text-fg-muted">Filtered by PO:</span>
          <span
            className="font-mono text-fg"
            data-testid="movement-log-po-filter-value"
          >
            {poDisplay}
          </span>
          {poHeader?.supplier_name ? (
            <span className="text-xs text-fg-subtle">
              · {poHeader.supplier_name}
            </span>
          ) : null}
          {poHeader?.status ? (
            <span className="text-xs text-fg-subtle">
              · {poHeader.status}
            </span>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {poHeader ? (
              <Link
                href={`/purchase-orders/${encodeURIComponent(urlPoId)}`}
                className="btn btn-ghost btn-sm"
                data-testid="movement-log-po-filter-back-link"
              >
                Back to PO →
              </Link>
            ) : null}
            <button
              type="button"
              onClick={clearPoFilter}
              className="btn btn-ghost btn-sm"
              data-testid="movement-log-po-filter-clear"
            >
              Clear filter
            </button>
          </div>
        </div>
      ) : null}

      <SectionCard eyebrow="Filter" title="Search Movements">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              Item ID
            </label>
            <input
              type="text"
              value={filters.item_id}
              onChange={(e) => handleFieldChange("item_id", e.target.value)}
              placeholder="e.g. SKU-001"
              className="w-full rounded border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              Item Type
            </label>
            <select
              value={filters.item_type}
              onChange={(e) => handleFieldChange("item_type", e.target.value)}
              className="w-full rounded border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">All</option>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              Movement Type
            </label>
            <select
              value={filters.movement_type}
              onChange={(e) => handleFieldChange("movement_type", e.target.value)}
              className="w-full rounded border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">All</option>
              {MOVEMENT_TYPES.map((t) => (
                <option key={t} value={t}>{fmtMovementType(t)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              From Date
            </label>
            <input
              type="date"
              value={filters.from_date}
              onChange={(e) => handleFieldChange("from_date", e.target.value)}
              className="w-full rounded border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-fg-muted">
              To Date
            </label>
            <input
              type="date"
              value={filters.to_date}
              onChange={(e) => handleFieldChange("to_date", e.target.value)}
              className="w-full rounded border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={applyFilters}
            className="btn btn-primary btn-sm"
          >
            Apply
          </button>
          <button
            onClick={clearFilters}
            className="btn btn-sm"
          >
            Clear
          </button>
        </div>
      </SectionCard>

      <SectionCard eyebrow="Results" title="Ledger Entries">
        {isLoading && (
          <div className="space-y-2 py-2" aria-busy="true" aria-live="polite">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
              >
                <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                <div className="h-4 flex-1 rounded bg-bg-subtle" />
                <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg">
            <div className="font-semibold">Could not load movement log</div>
            <div className="mt-1 text-xs">Check your connection. The ledger will reload once the API is reachable.</div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}
        {!isLoading && !error && rows.length === 0 && urlPoId ? (
          // Cycle 19 — PO-scoped empty state. The cycle 16 success-panel link
          // arrives with ?po_id=<just-posted-PO>; depending on backend timing
          // the GR ledger row may not yet be visible, OR an over-receipt may
          // have routed to exceptions instead of the ledger. The copy steers
          // operators to those two real possibilities rather than implying a
          // bug.
          <div
            className="space-y-2 py-6 text-center text-sm text-fg-muted"
            data-testid="movement-log-po-filter-empty"
          >
            <p>
              No movements found for PO{" "}
              <span className="font-mono text-fg">{poDisplay}</span>.
            </p>
            <p className="text-xs text-fg-subtle">
              The PO may not have ledger postings yet, or you may have
              over-receipt exceptions.
            </p>
          </div>
        ) : null}
        {!isLoading && !error && rows.length === 0 && !urlPoId && (
          <p className="py-8 text-center text-sm text-fg-muted">
            No movements found for the selected filters.
          </p>
        )}
        {!isLoading && !error && rows.length > 0 && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    <th className="py-2 pr-4">Event At</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Item</th>
                    <th className="py-2 pr-4 text-right">Qty Δ</th>
                    <th className="py-2 pr-4">UOM</th>
                    <th className="py-2 pr-4">Submitted by</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {rows.map((row) => (
                    <tr key={row.movement_id} className="hover:bg-bg-subtle/30">
                      <td className="whitespace-nowrap py-2 pr-4 text-fg-muted">
                        {formatDate(row.event_at)}
                      </td>
                      <td className="py-2 pr-4 text-xs text-fg">
                        {fmtMovementType(row.movement_type)}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs text-fg">{row.item_id}</span>
                        <span className="ml-1 text-xs text-fg-subtle">({row.item_type})</span>
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <QtyDeltaCell value={row.qty_delta} />
                      </td>
                      <td className="py-2 pr-4 text-fg-muted">{row.uom}</td>
                      <td className="py-2 pr-4 text-fg-muted">
                        {row.reported_by_snapshot ?? "—"}
                      </td>
                      <td className="py-2 text-fg-muted">{row.post_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-border/40 pt-3">
              <span className="text-xs text-fg-muted">
                Page {currentPage} of {totalPages} · {total} total
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="btn btn-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="btn btn-sm disabled:cursor-not-allowed disabled:opacity-40"
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
