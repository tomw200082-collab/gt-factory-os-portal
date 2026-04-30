"use client";

// ---------------------------------------------------------------------------
// Admin · SKU Aliases — external-SKU → item_id review + batch approval.
//
// Endgame Phase E1-UI (crystalline-drifting-dusk §B.E1):
//
//   Problem: LionWheel (and Shopify) send us external SKUs / item IDs that
//   do not match our canonical items. When the poller receives an unknown
//   SKU/item, it opens an exceptions row:
//     - LionWheel: category='lionwheel_unknown_sku', title='Unknown SKU <sku>'
//     - Shopify:   category='shopify_unmapped_item', title='Unmapped FG item <item_id>'
//
//   This surface lets admin-Tom:
//     1. SEE the list of unmapped external SKUs / items, filtered by channel.
//     2. CHOOSE an internal items.item_id for each.
//     3. BATCH-APPROVE the selected rows via POST /api/integration-sku-map/approve.
//     4. Review the existing ALREADY-APPROVED aliases as a read-only audit list.
//
//   Channel tabs: "LionWheel" (default) | "Shopify". The active channel is
//   URL-backed via ?channel=shopify. The approve mutation accepts
//   source_channel='lionwheel' or 'shopify' verbatim — confirmed in
//   api/src/integration-sku-map/schemas.ts IntegrationSkuMapApproveAliasSchema.
//
// Role gate: admin only.
// ---------------------------------------------------------------------------

import { useMemo, useState, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";

// ---------------------------------------------------------------------------
// Inline response shapes
// ---------------------------------------------------------------------------

type ListEnvelope<T> = { rows: T[]; count: number };

interface ExceptionRow {
  exception_id: string;
  category: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "resolved" | "auto_resolved";
  title: string;
  detail: string | null;
  item_id: string | null;
  component_id: string | null;
  emitted_at: string;
}

interface ItemRow {
  item_id: string;
  item_name: string;
  status: string;
  supply_method: string;
  sales_uom: string | null;
  family: string | null;
}

interface SkuAliasRow {
  alias_id: string;
  source_channel: "lionwheel" | "shopify" | "green_invoice" | string;
  external_sku: string;
  item_id: string;
  approval_status: "pending" | "approved" | "rejected";
  notes: string | null;
  created_at: string;
  approved_at: string | null;
}

interface UnmappedSkuRow {
  external_sku: string;
  source_channel: string;
  first_seen_at: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Channel configuration
// ---------------------------------------------------------------------------

type ChannelKey = "lionwheel" | "shopify";

interface ChannelConfig {
  key: ChannelKey;
  label: string;
  exceptionCategory: string;
  externalSkuColumnLabel: string;
  /**
   * Extract the external SKU from the exception title.
   * LionWheel: "Unknown SKU <sku>"    → sku
   * Shopify:   "Unmapped FG item <id>" → id
   */
  extractSku: (title: string | null | undefined) => string | null;
}

const CHANNEL_CONFIGS: Record<ChannelKey, ChannelConfig> = {
  lionwheel: {
    key: "lionwheel",
    label: "LionWheel",
    exceptionCategory: "lionwheel_unknown_sku",
    externalSkuColumnLabel: "External SKU",
    extractSku: (title) => {
      if (!title) return null;
      // title: "Unknown SKU <sku>"
      const match = title.match(/Unknown SKU (.+)$/);
      return match ? match[1].trim() : null;
    },
  },
  shopify: {
    key: "shopify",
    label: "Shopify",
    exceptionCategory: "shopify_unmapped_item",
    externalSkuColumnLabel: "Item ID",
    extractSku: (title) => {
      if (!title) return null;
      // title: "Unmapped FG item <item_id>"
      // Verified against supabase/functions/factory_os_jobs/index.ts line ~1837:
      //   title: `Unmapped FG item ${item_id}`
      const match = title.match(/Unmapped FG item (.+)$/);
      return match ? match[1].trim() : null;
    },
  },
};

function parseChannel(raw: string | null): ChannelKey {
  if (raw === "shopify") return "shopify";
  return "lionwheel";
}

function extractSourceChannel(category: string): string {
  if (category.startsWith("lionwheel_")) return "lionwheel";
  if (category.startsWith("shopify_")) return "shopify";
  if (category.startsWith("gi_") || category.startsWith("green_invoice"))
    return "green_invoice";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

interface AssignmentState {
  [externalSku: string]: string;
}

interface NotesState {
  [externalSku: string]: string;
}

function AdminSkuAliasesPageInner(): JSX.Element {
  const { session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeChannel = parseChannel(searchParams.get("channel"));
  const channelCfg = CHANNEL_CONFIGS[activeChannel];

  // Client-defense admin gate.
  if (session.role !== "admin") {
    return (
      <div className="card mx-auto mt-8 max-w-lg p-6 text-center">
        <div className="text-sm font-semibold text-fg">
          SKU alias admin surface
        </div>
        <div className="mt-2 text-xs text-fg-muted">
          This surface is restricted to admin. Current role:{" "}
          <span className="font-mono text-fg">{session.role}</span>.
        </div>
      </div>
    );
  }

  const [assignments, setAssignments] = useState<AssignmentState>({});
  const [notes, setNotes] = useState<NotesState>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [itemFilter, setItemFilter] = useState<string>("");
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string; detail?: string }
    | null
  >(null);

  // Reset per-channel state when channel tab changes.
  const handleChannelSwitch = (ch: ChannelKey) => {
    if (ch === activeChannel) return;
    setAssignments({});
    setNotes({});
    setSelected(new Set());
    setBanner(null);
    const params = new URLSearchParams(searchParams.toString());
    if (ch === "lionwheel") {
      params.delete("channel");
    } else {
      params.set("channel", ch);
    }
    const qs = params.toString();
    router.replace(`/admin/sku-aliases${qs ? `?${qs}` : ""}`);
  };

  // ---- Queries --------------------------------------------------------------

  const exceptionsQuery = useQuery<ListEnvelope<ExceptionRow>>({
    queryKey: ["admin", "sku-aliases", "exceptions", activeChannel],
    queryFn: () =>
      fetchJson(
        `/api/exceptions?category=${channelCfg.exceptionCategory}&status=open&limit=500`,
      ),
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "sku-aliases", "items"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  const approvedQuery = useQuery<ListEnvelope<SkuAliasRow>>({
    queryKey: ["admin", "sku-aliases", "approved"],
    queryFn: () =>
      fetchJson("/api/integration-sku-map?approval_status=approved&limit=500"),
    retry: false,
  });

  const pendingQuery = useQuery<ListEnvelope<SkuAliasRow>>({
    queryKey: ["admin", "sku-aliases", "pending"],
    queryFn: () =>
      fetchJson("/api/integration-sku-map?approval_status=pending&limit=500"),
    retry: false,
  });

  const rejectedQuery = useQuery<ListEnvelope<SkuAliasRow>>({
    queryKey: ["admin", "sku-aliases", "rejected"],
    queryFn: () =>
      fetchJson("/api/integration-sku-map?approval_status=rejected&limit=500"),
    retry: false,
  });

  // ---- Derived state --------------------------------------------------------

  const unmappedRows = useMemo<UnmappedSkuRow[]>(() => {
    const rows = exceptionsQuery.data?.rows ?? [];
    const byKey = new Map<string, UnmappedSkuRow>();
    for (const r of rows) {
      const sku = channelCfg.extractSku(r.title);
      if (!sku) continue;
      const channel = extractSourceChannel(r.category);
      const key = `${channel}::${sku}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        if (r.emitted_at < existing.first_seen_at) {
          existing.first_seen_at = r.emitted_at;
        }
      } else {
        byKey.set(key, {
          external_sku: sku,
          source_channel: channel,
          first_seen_at: r.emitted_at,
          count: 1,
        });
      }
    }
    return [...byKey.values()].sort((a, b) =>
      a.external_sku.localeCompare(b.external_sku),
    );
  }, [exceptionsQuery.data, channelCfg]);

  const items = itemsQuery.data?.rows ?? [];

  const filteredItems = useMemo(() => {
    if (!itemFilter) return items;
    const q = itemFilter.toLowerCase();
    return items.filter(
      (i) =>
        i.item_id.toLowerCase().includes(q) ||
        i.item_name.toLowerCase().includes(q),
    );
  }, [items, itemFilter]);

  const approvedRows = approvedQuery.data?.rows ?? [];
  const pendingCount = pendingQuery.data?.count ?? 0;
  const approvedCount = approvedQuery.data?.count ?? approvedRows.length;
  const rejectedCount = rejectedQuery.data?.count ?? 0;

  const backendLive =
    !approvedQuery.isError && !pendingQuery.isError && !rejectedQuery.isError;

  // ---- Mutation -------------------------------------------------------------

  interface ApproveResponse {
    approved_aliases: unknown[];
    resolved_exceptions_count: number;
    idempotent_replay: boolean;
    submission_id: string;
  }

  const approveMutation = useMutation<
    ApproveResponse | null,
    Error,
    Array<{
      source_channel: string;
      external_sku: string;
      item_id: string;
      notes: string | null;
    }>
  >({
    mutationFn: async (rows) => {
      const res = await fetch("/api/integration-sku-map/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          aliases: rows,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (body as { error?: string } | null)?.error ?? "Could not approve aliases. Check your connection and try again.",
        );
      }
      return body as ApproveResponse | null;
    },
    onSuccess: (data, rows) => {
      const resolvedCount = data?.resolved_exceptions_count ?? 0;
      const aliasWord = rows.length === 1 ? "alias" : "aliases";
      const channelLabel = channelCfg.label;
      setBanner({
        kind: "success",
        message: `${rows.length} ${aliasWord} approved. ${resolvedCount} ${channelLabel} exception${resolvedCount === 1 ? "" : "s"} resolved.`,
        detail:
          resolvedCount < rows.length
            ? "Remaining exceptions stay open if no matching records were found for those SKUs."
            : "All matching exceptions resolved. Refresh in ~30s to confirm.",
      });
      setSelected(new Set());
      setAssignments({});
      setNotes({});
      void queryClient.invalidateQueries({
        queryKey: ["admin", "sku-aliases"],
      });
    },
    onError: (err) => {
      setBanner({
        kind: "error",
        message: "Batch approval failed.",
        detail: err.message,
      });
    },
  });

  const queryClient = useQueryClient();

  // ---- Handlers -------------------------------------------------------------

  const toggleRow = (externalSku: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(externalSku)) next.delete(externalSku);
      else next.add(externalSku);
      return next;
    });
  };

  const selectAllWithAssignment = () => {
    const next = new Set<string>();
    for (const row of unmappedRows) {
      if (assignments[row.external_sku]) next.add(row.external_sku);
    }
    setSelected(next);
  };

  const clearSelection = () => setSelected(new Set());

  const handleApprove = () => {
    setBanner(null);
    const payload: Array<{
      source_channel: string;
      external_sku: string;
      item_id: string;
      notes: string | null;
    }> = [];
    for (const row of unmappedRows) {
      if (!selected.has(row.external_sku)) continue;
      const itemId = assignments[row.external_sku];
      if (!itemId) continue;
      payload.push({
        source_channel: row.source_channel,
        external_sku: row.external_sku,
        item_id: itemId,
        notes: notes[row.external_sku]?.trim() ?? "",
      });
    }
    if (payload.length === 0) {
      setBanner({
        kind: "error",
        message:
          "Select at least one row with an item_id assignment to approve.",
      });
      return;
    }
    approveMutation.mutate(payload);
  };

  // ---- Render ---------------------------------------------------------------

  const loadingExceptions = exceptionsQuery.isLoading;
  const loadingItems = itemsQuery.isLoading;
  const exceptionsError = exceptionsQuery.error as Error | null;
  const itemsError = itemsQuery.error as Error | null;

  const canApprove =
    selected.size > 0 &&
    [...selected].every((sku) => Boolean(assignments[sku])) &&
    !approveMutation.isPending;

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · SKU aliases"
        title="External SKU → item_id review"
        description="Map external SKUs observed in LionWheel and Shopify to our canonical items. Approved aliases unblock planning demand and FG sync."
        meta={
          <>
            <Badge tone="warning" dotted>
              {unmappedRows.length} unmapped
            </Badge>
            <Badge tone="info" dotted>
              {pendingCount} pending
            </Badge>
            <Badge tone="success" dotted>
              {approvedCount} approved
            </Badge>
            <Badge tone="neutral" dotted>
              {rejectedCount} rejected
            </Badge>
            {!backendLive ? (
              <Badge tone="neutral" dotted>
                endpoints pending
              </Badge>
            ) : (
              <Badge tone="neutral" dotted>
                live API
              </Badge>
            )}
          </>
        }
      />

      {/* ---- Channel tabs ------------------------------------------------- */}
      <div className="flex gap-1 border-b border-border/60">
        {(["lionwheel", "shopify"] as ChannelKey[]).map((ch) => {
          const cfg = CHANNEL_CONFIGS[ch];
          const isActive = activeChannel === ch;
          return (
            <button
              key={ch}
              type="button"
              onClick={() => handleChannelSwitch(ch)}
              className={
                isActive
                  ? "px-4 py-2 text-sm font-semibold text-accent border-b-2 border-accent -mb-px"
                  : "px-4 py-2 text-sm text-fg-muted hover:text-fg border-b-2 border-transparent -mb-px"
              }
            >
              {cfg.label}
            </button>
          );
        })}
      </div>

      {banner ? (
        <div
          className={
            banner.kind === "success"
              ? "rounded-md border border-success/40 bg-success-softer p-4 text-sm text-success-fg"
              : "rounded-md border border-danger/40 bg-danger-softer p-4 text-sm text-danger-fg"
          }
        >
          <div className="font-semibold">{banner.message}</div>
          {banner.detail ? (
            <div className="mt-1 text-xs opacity-80">{banner.detail}</div>
          ) : null}
        </div>
      ) : null}

      {!backendLive ? (
        <SectionCard
          tone="warning"
          title="Alias approval not yet available"
          density="compact"
        >
          <p className="text-xs text-fg-muted">
            The approved-alias list and approval submission are not yet live. The unmapped SKU view below is available and you can review exceptions, but approvals cannot be submitted yet.
          </p>
        </SectionCard>
      ) : null}

      {/* --------- Left pane: unmapped external SKUs --------------- */}
      <SectionCard
        eyebrow={`Step 1 · ${channelCfg.label}`}
        title="Unmapped external SKUs"
        description={
          activeChannel === "lionwheel"
            ? "Grouped by external_sku (multiple exceptions per SKU = same SKU seen on multiple orders). Assign each to an internal item, then select rows and click Approve."
            : "Shopify FG items with no approved alias. Each exception corresponds to one FG item scanned during sync that has no integration_sku_map row. Assign a canonical item_id to each, then approve."
        }
        contentClassName="p-0"
      >
        {loadingExceptions ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-10 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : exceptionsError ? (
          <div className="p-5">
            <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
              <div className="font-semibold">Could not load {channelCfg.label} exceptions</div>
              <div className="mt-1 text-xs">{exceptionsError.message}</div>
              <button
                type="button"
                onClick={() => void exceptionsQuery.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : unmappedRows.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            {activeChannel === "shopify"
              ? "No unmapped Shopify FG item exceptions open. Either all items have approved aliases, or no sync cycle has run yet."
              : "No unmapped SKU exceptions open. All LionWheel SKUs either resolve through an approved alias or have not been observed yet."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="w-10 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      aria-label="Select rows with assignments"
                      checked={
                        selected.size > 0 &&
                        selected.size ===
                          unmappedRows.filter((r) => assignments[r.external_sku])
                            .length
                      }
                      onChange={(e) => {
                        if (e.target.checked) selectAllWithAssignment();
                        else clearSelection();
                      }}
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    {channelCfg.externalSkuColumnLabel}
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Source
                  </th>
                  <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Count
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    First seen
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Assign to item
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {unmappedRows.map((row) => {
                  const assigned = assignments[row.external_sku] ?? "";
                  const note = notes[row.external_sku] ?? "";
                  const isSelected = selected.has(row.external_sku);
                  const canSelect = Boolean(assigned);
                  return (
                    <tr
                      key={`${row.source_channel}::${row.external_sku}`}
                      className={
                        isSelected
                          ? "border-b border-border/40 bg-accent-soft/30 last:border-b-0"
                          : "border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                      }
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          disabled={!canSelect}
                          checked={isSelected}
                          onChange={() => toggleRow(row.external_sku)}
                          aria-label={`Select ${row.external_sku}`}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-fg">
                        {row.external_sku}
                      </td>
                      <td className="px-3 py-2 text-xs text-fg-muted">
                        {row.source_channel}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
                        {row.count}
                      </td>
                      <td className="px-3 py-2 text-xs text-fg-muted">
                        {new Date(row.first_seen_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="input min-w-[220px]"
                          value={assigned}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAssignments((prev) => ({
                              ...prev,
                              [row.external_sku]: v,
                            }));
                            if (!v && isSelected) {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                next.delete(row.external_sku);
                                return next;
                              });
                            }
                          }}
                        >
                          <option value="">— choose item —</option>
                          {filteredItems.map((it) => (
                            <option key={it.item_id} value={it.item_id}>
                              {it.item_id} · {it.item_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          className="input min-w-[160px]"
                          placeholder="optional"
                          value={note}
                          onChange={(e) =>
                            setNotes((prev) => ({
                              ...prev,
                              [row.external_sku]: e.target.value,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* --------- Right helper pane: items-master filter ----------- */}
      <SectionCard
        eyebrow="Step 1 · helper"
        title="Items master filter"
        description="Narrow the item dropdown choices above (client-side; filters every row's dropdown at once)."
        density="compact"
      >
        {loadingItems ? (
          <div className="text-xs text-fg-muted">Loading items…</div>
        ) : itemsError ? (
          <div className="text-xs text-danger-fg">
            Items load failed: {itemsError.message}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                Search items (id / name)
              </span>
              <input
                type="text"
                className="input"
                placeholder="e.g. GT-LUI-LOW or Lime"
                value={itemFilter}
                onChange={(e) => setItemFilter(e.target.value)}
              />
            </label>
            <div className="flex items-end text-xs text-fg-muted">
              {filteredItems.length} / {items.length} items visible in dropdowns
            </div>
          </div>
        )}
      </SectionCard>

      {/* --------- Step 2: approve action bar ---------------------- */}
      <SectionCard
        eyebrow="Step 2"
        title={`Approve selected (${selected.size})`}
        description="Approval inserts/updates an integration_sku_map row with approval_status='approved' for each selected external_sku and auto-resolves matching open exceptions."
        density="compact"
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canApprove}
            onClick={handleApprove}
          >
            {approveMutation.isPending
              ? "Approving…"
              : `Approve ${selected.size} alias${selected.size === 1 ? "" : "es"}`}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={selectAllWithAssignment}
            disabled={unmappedRows.every((r) => !assignments[r.external_sku])}
          >
            Select all with assignment
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={clearSelection}
            disabled={selected.size === 0}
          >
            Clear selection
          </button>
          <div className="text-xs text-fg-muted">
            Rows without an item_id assignment cannot be selected.
          </div>
        </div>
      </SectionCard>

      {/* --------- Bottom pane: already-approved audit ----------- */}
      <SectionCard
        eyebrow="Audit"
        title={`Already approved (${approvedCount})`}
        description="Approved aliases are read-only. Contact your system administrator to reject or modify an existing alias."
        contentClassName="p-0"
      >
        {approvedQuery.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-20 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : approvedQuery.isError ? (
          <div className="p-5 text-sm text-fg-muted">
            Approved aliases are not yet available. The alias list will appear here once the backend endpoint is live.
          </div>
        ) : approvedRows.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No approved aliases yet. Approve some rows above to populate this
            list.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    External SKU
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Source
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Item
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Approved at
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {approvedRows.map((r) => (
                  <tr
                    key={r.alias_id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      {r.external_sku}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.source_channel}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg">
                      {(() => {
                        const item = itemsQuery.data?.rows.find(
                          (i) => i.item_id === r.item_id,
                        );
                        return item ? (
                          <>
                            <span className="font-medium">{item.item_name}</span>
                            <span className="ml-1 font-mono text-fg-muted">
                              ({r.item_id})
                            </span>
                          </>
                        ) : (
                          <span className="font-mono">{r.item_id}</span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.approved_at
                        ? new Date(r.approved_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {r.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

export default function AdminSkuAliasesPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-fg-muted">Loading…</div>}>
      <AdminSkuAliasesPageInner />
    </Suspense>
  );
}
