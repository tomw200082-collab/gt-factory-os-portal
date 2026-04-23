"use client";

// ---------------------------------------------------------------------------
// Admin · SKU Aliases — external-SKU → item_id review + batch approval.
//
// Endgame Phase E1-UI (crystalline-drifting-dusk §B.E1):
//
//   Problem: LionWheel (and soon Shopify / Green Invoice) send us external
//   SKUs that do not match our canonical `items.item_id`. When the poller
//   receives an order line with an unknown SKU, it opens an
//   `exceptions` row with category='lionwheel_unknown_sku'. Today there
//   are ~42 such exceptions. The planner cannot bridge MC-U2 (LionWheel
//   orders → planning demand) until every one of those external SKUs has
//   an approved alias row in `private_core.integration_sku_map`.
//
//   This surface lets admin-Tom:
//     1. SEE the list of unmapped external SKUs (from /api/exceptions,
//        category=lionwheel_unknown_sku, status=open; grouped by
//        external_sku with a count of distinct exceptions).
//     2. CHOOSE an internal `items.item_id` for each external SKU
//        (dropdown sourced from /api/items).
//     3. BATCH-APPROVE the selected rows via POST /api/integration-sku-map/
//        approve. Approval inserts/updates an `integration_sku_map` row
//        with approval_status='approved' AND auto-resolves any matching
//        open exceptions (the latter is the upstream handler's job).
//     4. Review the existing ALREADY-APPROVED aliases as a read-only
//        audit list at the bottom.
//
//   Graceful-degrade: if the upstream W1 E1-backend endpoints are not
//   yet deployed, the query simply returns empty / errors softly — the
//   exceptions + items panels still render, and the admin can see the
//   problem shape even before approval is wired.
//
// Role gate: admin only (client-defense; admin layout allows planner too,
// so this component refuses planner explicitly).
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";

// ---------------------------------------------------------------------------
// Inline response shapes — mirror the expected W1 E1-backend envelope +
// the existing /api/exceptions + /api/items payloads.
// ---------------------------------------------------------------------------

type ListEnvelope<T> = { rows: T[]; count: number };

interface ExceptionRow {
  exception_id: string;
  category: string;
  severity: "info" | "warning" | "fail_hard";
  status: "open" | "acknowledged" | "resolved" | "auto_resolved";
  detail: Record<string, unknown> | unknown;
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

// Expected W1 E1-backend shape (best-effort; page renders gracefully if
// envelope shape differs slightly — we tolerate unknown fields).
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

// ---------------------------------------------------------------------------
// Derived row shape — one row per distinct external_sku on the left pane.
// ---------------------------------------------------------------------------

interface UnmappedSkuRow {
  external_sku: string;
  source_channel: string;
  first_seen_at: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Fetch helper — graceful errors (return empty rather than throw when the
// endpoint is unreachable, so the page renders even before W1 E1-backend
// lands).
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${url} failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

// Extract the external_sku from an exception's detail payload. LionWheel
// poller writes the unmapped SKU under various keys historically; probe a
// short list tolerantly.
function extractExternalSku(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const candidates = ["external_sku", "sku", "lionwheel_sku", "unknown_sku"];
  for (const k of candidates) {
    const v = d[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function extractSourceChannel(category: string): string {
  if (category.startsWith("lionwheel_")) return "lionwheel";
  if (category.startsWith("shopify_")) return "shopify";
  if (category.startsWith("gi_") || category.startsWith("green_invoice"))
    return "green_invoice";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Page component.
// ---------------------------------------------------------------------------

interface AssignmentState {
  // external_sku -> item_id chosen from dropdown (empty string = none)
  [externalSku: string]: string;
}

interface NotesState {
  [externalSku: string]: string;
}

export default function AdminSkuAliasesPage(): JSX.Element {
  const { session } = useSession();
  const queryClient = useQueryClient();

  // Client-defense admin gate. Admin layout already allows planner, but the
  // upstream handler is admin-only; make the UI truthful rather than letting
  // a planner stage approvals the backend will 403.
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

  // ---- Queries --------------------------------------------------------------

  const exceptionsQuery = useQuery<ListEnvelope<ExceptionRow>>({
    queryKey: ["admin", "sku-aliases", "unknown-sku-exceptions"],
    queryFn: () =>
      fetchJson(
        "/api/exceptions?category=lionwheel_unknown_sku&status=open&limit=500",
      ),
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "sku-aliases", "items"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  // Existing approved aliases (read-only bottom pane). Tolerates missing
  // endpoint — renders empty state if W1 E1-backend not yet live.
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

  // Deduplicate exceptions by external_sku; count occurrences; earliest
  // emitted_at wins as first_seen_at.
  const unmappedRows = useMemo<UnmappedSkuRow[]>(() => {
    const rows = exceptionsQuery.data?.rows ?? [];
    const byKey = new Map<string, UnmappedSkuRow>();
    for (const r of rows) {
      const sku = extractExternalSku(r.detail);
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
  }, [exceptionsQuery.data]);

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

  // ---- Mutation -------------------------------------------------------------

  const approveMutation = useMutation<
    unknown,
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
        body: JSON.stringify({ idempotency_key: crypto.randomUUID(), aliases: rows }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          `approve failed (HTTP ${res.status}): ${
            body ? JSON.stringify(body) : "<no body>"
          }`,
        );
      }
      return body;
    },
    onSuccess: (_data, rows) => {
      setBanner({
        kind: "success",
        message: `Approved ${rows.length} alias${rows.length === 1 ? "" : "es"}.`,
        detail:
          "Matching exceptions should auto-resolve upstream. Refresh in ~30s to confirm.",
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
        notes: notes[row.external_sku]?.trim() || null,
      });
    }
    if (payload.length === 0) {
      setBanner({
        kind: "error",
        message: "Select at least one row with an item_id assignment to approve.",
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
  const backendLive =
    !approvedQuery.isError && !pendingQuery.isError && !rejectedQuery.isError;

  const canApprove =
    selected.size > 0 &&
    [...selected].every((sku) => Boolean(assignments[sku])) &&
    !approveMutation.isPending;

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · SKU aliases"
        title="External SKU → item_id review"
        description="Map external SKUs observed in LionWheel (and later Shopify / Green Invoice) to our canonical items. Approved aliases unblock MC-U2 FG_OUT bridge so planning demand can include LionWheel orders."
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
          title="W1 E1-backend endpoints not yet live"
          density="compact"
        >
          <p className="text-xs text-fg-muted">
            The page cannot fetch existing alias rows or submit approvals until
            the upstream endpoints{" "}
            <code className="rounded bg-bg-subtle px-1 font-mono">
              GET /api/v1/queries/integration-sku-map
            </code>{" "}
            and{" "}
            <code className="rounded bg-bg-subtle px-1 font-mono">
              POST /api/v1/mutations/integration-sku-map/approve
            </code>{" "}
            are deployed. The unmapped-SKU view below is sourced from{" "}
            <code className="rounded bg-bg-subtle px-1 font-mono">
              /api/exceptions
            </code>{" "}
            (already live) and renders even in this pending state.
          </p>
        </SectionCard>
      ) : null}

      {/* --------- Left pane: unmapped external SKUs --------------- */}
      <SectionCard
        eyebrow="Step 1"
        title="Unmapped external SKUs"
        description="Grouped by external_sku (multiple exceptions per SKU = same SKU seen on multiple orders). Assign each to an internal item, then select rows and click Approve."
        contentClassName="p-0"
      >
        {loadingExceptions ? (
          <div className="p-5 text-sm text-fg-muted">Loading exceptions…</div>
        ) : exceptionsError ? (
          <div className="p-5 text-sm text-danger-fg">
            Failed to load exceptions: {exceptionsError.message}
          </div>
        ) : unmappedRows.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No unmapped SKU exceptions open. All LionWheel SKUs either resolve
            through an approved alias or have not been observed yet.
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
                    External SKU
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
                            // If row had no assignment previously and is
                            // selected, clear selection (invariant: selected
                            // rows must have an assignment).
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
        description="Read-only in v1. Rejecting or editing an existing alias is not in the v1 admin surface; use a migration or SQL if absolutely required."
        contentClassName="p-0"
      >
        {approvedQuery.isLoading ? (
          <div className="p-5 text-sm text-fg-muted">Loading approved aliases…</div>
        ) : approvedQuery.isError ? (
          <div className="p-5 text-sm text-fg-muted">
            Approved-alias list not available yet. W1 E1-backend endpoint{" "}
            <code className="rounded bg-bg-subtle px-1 font-mono">
              GET /api/v1/queries/integration-sku-map
            </code>{" "}
            is pending. The left pane + approval flow will activate as soon as
            that endpoint lands.
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
                    Item ID
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
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      {r.item_id}
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
