"use client";

// ---------------------------------------------------------------------------
// Admin · Product 360 — AMMC v1 Slice 5 (crystalline-drifting-dusk §C.2
// Product 360 hero).
//
// /admin/products/[item_id]
//
// 7-tab hero layout per plan §C.2:
//   1. Overview     — <ReadinessCard> + item fields (inline-edit) + status
//   2. Aliases      — integration_sku_map rows; reject/revoke; link to
//                     /admin/sku-aliases for new-alias flow
//   3. BOM          — supply-method-aware: BOUGHT_FINISHED → "No BOM";
//                     MANUFACTURED/REPACK → bom_head summary + versions list;
//                     "Open in BOM editor" disabled (Slice 6)
//   4. Components   — active-version bom_lines with per-component readiness
//   5. Suppliers    — flat list (A13 simplification vs full matrix): for each
//                     component in active BOM resolve primary supplier_item;
//                     flag Missing-primary rows
//   6. Planning     — 14 planning_policy rows inline-editable (reuse Slice 4
//                     pattern as embedded component)
//   7. History      — placeholder; needs change_log list endpoint (post-launch)
//
// Tabs sync via ?tab= querystring.
//
// Read strategy: fetch items list once (client-side row pick), fetch
// readiness, fetch bom_head for item, fetch active bom_version, fetch
// bom_lines for active version, fetch components + supplier_items list
// referenced by those lines.
// ---------------------------------------------------------------------------

import { useMemo, useState, useEffect, use, Suspense } from "react";
import Link from "next/link";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Power, AlertTriangle } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { ReadinessCard } from "@/components/readiness/ReadinessCard";
import { ReadinessPill } from "@/components/readiness/ReadinessPill";
import {
  AdminMutationError,
  patchEntity,
  postStatus,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";
import { fmtSupplyMethod } from "@/lib/display";
import { cn } from "@/lib/cn";

// --- Types ----------------------------------------------------------------

interface ItemRow {
  item_id: string;
  item_name: string;
  family: string | null;
  pack_size: string | null;
  sales_uom: string | null;
  supply_method: string;
  item_type: string | null;
  status: string;
  primary_bom_head_id: string | null;
  base_bom_head_id: string | null;
  case_pack: number | null;
  product_group: string | null;
  site_id: string;
  created_at: string;
  updated_at: string;
}

interface ReadinessPayload {
  is_ready: boolean;
  readiness_summary?: string;
  blockers: Array<{ code: string; label?: string; detail?: string }>;
}

interface IntegrationSkuMapRow {
  alias_id: string;
  source_channel: string;
  external_sku: string;
  item_id: string;
  approval_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface BomHeadRow {
  bom_head_id: string;
  bom_kind: string;
  display_family: string | null;
  parent_ref_id: string;
  active_version_id: string | null;
  final_bom_output_qty: string;
  final_bom_output_uom: string | null;
  status: string;
}

interface BomVersionRow {
  bom_version_id: string;
  bom_head_id: string;
  version_label: string;
  status: string;
  created_at: string;
  activated_at: string | null;
}

interface BomLineRow {
  line_id: string;
  bom_version_id: string;
  line_no: number;
  final_component_id: string;
  final_component_name: string;
  final_component_qty: string;
  component_uom: string | null;
}

interface ComponentRow {
  component_id: string;
  component_name: string;
  status: string;
}

interface SupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  status: string;
}

interface SupplierItemRow {
  supplier_item_id: string;
  supplier_id: string;
  component_id: string | null;
  item_id: string | null;
  is_primary: boolean;
  pack_conversion: string;
  lead_time_days: number | null;
  moq: string | null;
  approval_status: string | null;
  updated_at: string;
}

interface PlanningPolicyRow {
  key: string;
  value: string;
  uom: string | null;
  description: string | null;
  updated_at: string;
}

type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE") return <Badge tone="success" dotted>Active</Badge>;
  if (status === "PENDING") return <Badge tone="warning" dotted>Pending</Badge>;
  if (status === "INACTIVE") return <Badge tone="neutral" dotted>Inactive</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

// --- Tabs -----------------------------------------------------------------

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "aliases", label: "Aliases" },
  { id: "bom", label: "BOM" },
  { id: "components", label: "Components" },
  { id: "suppliers", label: "Suppliers" },
  { id: "planning", label: "Planning" },
  { id: "history", label: "History" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isValidTab(s: string | null): s is TabId {
  return !!s && TABS.some((t) => t.id === s);
}

// --- Page -----------------------------------------------------------------

interface PageProps {
  params: Promise<{ item_id: string }>;
}

function AdminProduct360PageInner({ params }: PageProps): JSX.Element {
  const { item_id } = use(params);
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabFromUrl = searchParams.get("tab");
  const [tab, setTab] = useState<TabId>(
    isValidTab(tabFromUrl) ? tabFromUrl : "overview",
  );

  useEffect(() => {
    if (isValidTab(tabFromUrl) && tabFromUrl !== tab) {
      setTab(tabFromUrl);
    }
  }, [tabFromUrl, tab]);

  const switchTab = (next: TabId) => {
    setTab(next);
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", next);
    router.replace(`?${p.toString()}`, { scroll: false });
  };

  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);

  // --- Data ---------------------------------------------------------------

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "items", "all-for-product-360"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });
  const item = useMemo(() => {
    const rows = itemsQuery.data?.rows ?? [];
    return rows.find((i) => i.item_id === item_id) ?? null;
  }, [itemsQuery.data, item_id]);

  const readinessQuery = useQuery<ReadinessPayload>({
    queryKey: ["admin", "items", item_id, "readiness"],
    queryFn: () =>
      fetchJson(`/api/items/${encodeURIComponent(item_id)}/readiness`),
  });

  const skuMapQuery = useQuery<ListEnvelope<IntegrationSkuMapRow>>({
    queryKey: ["admin", "integration-sku-map", "all-for-item", item_id],
    queryFn: () => fetchJson("/api/integration-sku-map?limit=1000"),
  });
  const itemAliases = useMemo(
    () =>
      (skuMapQuery.data?.rows ?? []).filter((r) => r.item_id === item_id),
    [skuMapQuery.data, item_id],
  );

  const bomHeadsQuery = useQuery<ListEnvelope<BomHeadRow>>({
    queryKey: ["admin", "bom_head", "all"],
    queryFn: () => fetchJson("/api/boms/heads?limit=1000"),
    enabled: item?.supply_method !== "BOUGHT_FINISHED",
  });
  const itemBomHead = useMemo(() => {
    if (!item || item.supply_method === "BOUGHT_FINISHED") return null;
    return (
      (bomHeadsQuery.data?.rows ?? []).find((h) => h.parent_ref_id === item_id) ??
      null
    );
  }, [bomHeadsQuery.data, item, item_id]);

  const bomVersionsQuery = useQuery<ListEnvelope<BomVersionRow>>({
    queryKey: ["admin", "bom_version", "by-head", itemBomHead?.bom_head_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(itemBomHead!.bom_head_id)}&limit=1000`,
      ),
    enabled: !!itemBomHead,
  });

  const activeVersionId = itemBomHead?.active_version_id ?? null;

  const bomLinesQuery = useQuery<ListEnvelope<BomLineRow>>({
    queryKey: ["admin", "bom_lines", "by-version", activeVersionId],
    queryFn: () =>
      fetchJson(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(activeVersionId!)}&limit=1000`,
      ),
    enabled: !!activeVersionId,
  });

  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["admin", "components", "all"],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });

  const suppliersQuery = useQuery<ListEnvelope<SupplierRow>>({
    queryKey: ["admin", "suppliers", "all"],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
  });

  // For Suppliers tab: fetch supplier_items for each component in active BOM.
  // Strategy: fetch with component_id filter per line. Simple per-component
  // queries are fine at plant-scale v1.
  const bomComponentIds = useMemo(
    () =>
      Array.from(
        new Set((bomLinesQuery.data?.rows ?? []).map((l) => l.final_component_id)),
      ),
    [bomLinesQuery.data],
  );

  const planningPolicyQuery = useQuery<ListEnvelope<PlanningPolicyRow>>({
    queryKey: ["admin", "planning-policy"],
    queryFn: () => fetchJson("/api/planning-policy?limit=1000"),
    enabled: tab === "planning",
  });

  // --- Mutations ----------------------------------------------------------

  const fieldMutation = useMutation({
    mutationFn: async (args: {
      field: string;
      value: string | number;
      updated_at: string;
    }) =>
      patchEntity({
        url: `/api/items/${encodeURIComponent(item_id)}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: (_data, vars) => {
      setBanner({ kind: "success", message: "Saved." });
      void queryClient.invalidateQueries({ queryKey: ["admin", "items"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "items", item_id, "readiness"],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Update failed: ${msg}` });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (args: { newStatus: string; updated_at: string }) =>
      postStatus({
        url: `/api/items/${encodeURIComponent(item_id)}/status`,
        status: args.newStatus,
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: (_data, vars) => {
      setBanner({ kind: "success", message: `Status → ${vars.newStatus}.` });
      void queryClient.invalidateQueries({ queryKey: ["admin", "items"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "items", item_id, "readiness"],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Status update failed: ${msg}` });
    },
  });

  const aliasActionMutation = useMutation({
    mutationFn: async (args: {
      alias_id: string;
      verb: "reject" | "revoke";
    }) => {
      const res = await fetch(
        `/api/integration-sku-map/${encodeURIComponent(args.alias_id)}/${args.verb}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            idempotency_key: crypto.randomUUID(),
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new AdminMutationError(
          res.status,
          (body as { message?: string })?.message ?? `HTTP ${res.status}`,
          (body as { code?: string })?.code,
          body,
        );
      }
      return await res.json();
    },
    onSuccess: (_data, vars) => {
      setBanner({ kind: "success", message: `Alias ${vars.verb}ed.` });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "integration-sku-map"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "items", item_id, "readiness"],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Alias action failed: ${msg}` });
    },
  });

  const policyMutation = useMutation({
    mutationFn: async (args: {
      key: string;
      value: string | number;
      updated_at: string;
    }) =>
      patchEntity({
        url: `/api/planning-policy/${encodeURIComponent(args.key)}`,
        fields: { value: String(args.value) },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: (_data, vars) => {
      setBanner({ kind: "success", message: `Updated ${vars.key}.` });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "planning-policy"],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `Policy update failed: ${msg}` });
    },
  });

  // --- Render guards ------------------------------------------------------

  if (itemsQuery.isLoading) {
    return <div className="p-5 text-sm text-fg-muted">Loading item…</div>;
  }
  if (itemsQuery.isError) {
    return (
      <div className="p-5 text-sm text-danger-fg">
        {(itemsQuery.error as Error).message}
      </div>
    );
  }
  if (!item) {
    notFound();
  }

  const ifMatch = item.updated_at;

  return (
    <>
      <div className="mb-2">
        <Link
          href="/admin/items"
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-sops text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
          Items
        </Link>
      </div>

      <WorkflowHeader
        eyebrow={`Admin · product · ${item.item_id}`}
        title={item.item_name}
        description="Product 360 — the single surface for operational readiness, aliases, BOM, components, suppliers, planning and history."
        meta={
          <>
            <StatusBadge status={item.status} />
            <ReadinessPill readiness={readinessQuery.data} />
            <Badge tone="neutral" dotted>
              {item.item_id}
            </Badge>
            <Badge tone="info" dotted>
              {fmtSupplyMethod(item.supply_method)}
            </Badge>
            {item.family ? (
              <Badge tone="neutral" dotted>
                {item.family}
              </Badge>
            ) : null}
          </>
        }
        actions={
          isAdmin ? (
            <button
              type="button"
              className="btn btn-ghost inline-flex items-center gap-1.5"
              onClick={() => {
                const next = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                if (!window.confirm(`Set status to ${next}?`)) return;
                setBanner(null);
                statusMutation.mutate({
                  newStatus: next,
                  updated_at: ifMatch,
                });
              }}
              disabled={statusMutation.isPending}
            >
              <Power className="h-3.5 w-3.5" strokeWidth={2} />
              {item.status === "ACTIVE" ? "Deactivate" : "Activate"}
            </button>
          ) : null
        }
      />

      {banner ? (
        <div
          className={
            banner.kind === "success"
              ? "rounded-md border border-success/40 bg-success-softer p-3 text-sm text-success-fg"
              : "rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
          }
        >
          {banner.message}
        </div>
      ) : null}

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Product 360 tabs"
        className="flex flex-wrap gap-1 border-b border-border/70"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => switchTab(t.id)}
            className={cn(
              "px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-b-2 border-accent text-fg-strong"
                : "border-b-2 border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === "overview" ? (
        <OverviewTab
          item={item}
          readiness={readinessQuery.data}
          isLoadingReadiness={readinessQuery.isLoading}
          readinessError={readinessQuery.error as Error | null}
          isAdmin={isAdmin}
          ifMatch={ifMatch}
          onField={(field, value) =>
            fieldMutation.mutateAsync({
              field,
              value,
              updated_at: ifMatch,
            })
          }
        />
      ) : null}

      {tab === "aliases" ? (
        <AliasesTab
          item_id={item.item_id}
          aliases={itemAliases}
          isLoading={skuMapQuery.isLoading}
          error={skuMapQuery.error as Error | null}
          isAdmin={isAdmin}
          onAction={(alias_id, verb) =>
            aliasActionMutation.mutate({ alias_id, verb })
          }
        />
      ) : null}

      {tab === "bom" ? (
        <BomTab
          item={item}
          head={itemBomHead}
          versions={bomVersionsQuery.data?.rows ?? []}
          isLoading={bomHeadsQuery.isLoading || bomVersionsQuery.isLoading}
        />
      ) : null}

      {tab === "components" ? (
        <ComponentsTab
          supplyMethod={item.supply_method}
          activeVersionId={activeVersionId}
          lines={bomLinesQuery.data?.rows ?? []}
          isLoading={bomLinesQuery.isLoading}
        />
      ) : null}

      {tab === "suppliers" ? (
        <SuppliersTab
          supplyMethod={item.supply_method}
          activeVersionId={activeVersionId}
          bomComponentIds={bomComponentIds}
          components={componentsQuery.data?.rows ?? []}
          suppliers={suppliersQuery.data?.rows ?? []}
        />
      ) : null}

      {tab === "planning" ? (
        <PlanningTab
          policy={planningPolicyQuery.data?.rows ?? []}
          isLoading={planningPolicyQuery.isLoading}
          isAdmin={isAdmin}
          onPolicy={(key, value, updated_at) =>
            policyMutation.mutateAsync({ key, value, updated_at })
          }
        />
      ) : null}

      {tab === "history" ? <HistoryTab /> : null}
    </>
  );
}

// --- Tab components -------------------------------------------------------

function OverviewTab({
  item,
  readiness,
  isLoadingReadiness,
  readinessError,
  isAdmin,
  ifMatch,
  onField,
}: {
  item: ItemRow;
  readiness: ReadinessPayload | undefined;
  isLoadingReadiness: boolean;
  readinessError: Error | null;
  isAdmin: boolean;
  ifMatch: string;
  onField: (field: string, value: string | number) => Promise<unknown>;
}): JSX.Element {
  return (
    <>
      {readiness ? (
        <ReadinessCard
          entity="item"
          readiness={{
            is_ready: readiness.is_ready,
            readiness_summary: readiness.readiness_summary,
            blockers: (readiness.blockers ?? []).map((b) => ({
              code: b.code,
              label: b.label ?? b.code,
              detail: b.detail,
            })),
          }}
        />
      ) : isLoadingReadiness ? (
        <SectionCard title="Item readiness">
          <p className="text-sm text-fg-muted">Loading readiness…</p>
        </SectionCard>
      ) : readinessError ? (
        <SectionCard title="Item readiness" tone="warning">
          <p className="text-sm text-warning-fg">
            Could not load readiness: {readinessError.message}
          </p>
        </SectionCard>
      ) : null}

      <SectionCard eyebrow="Overview" title="Item fields">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Name">
            {isAdmin ? (
              <InlineEditCell
                value={item.item_name}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await onField("item_name", v);
                }}
              />
            ) : (
              item.item_name
            )}
          </Field>
          <Field label="Family">
            {isAdmin ? (
              <InlineEditCell
                value={item.family ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await onField("family", v);
                }}
              />
            ) : (
              item.family ?? "—"
            )}
          </Field>
          <Field label="Sales UOM">
            {isAdmin ? (
              <InlineEditCell
                value={item.sales_uom ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await onField("sales_uom", v);
                }}
              />
            ) : (
              item.sales_uom ?? "—"
            )}
          </Field>
          <Field label="Pack size">
            {isAdmin ? (
              <InlineEditCell
                value={item.pack_size ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await onField("pack_size", v);
                }}
              />
            ) : (
              item.pack_size ?? "—"
            )}
          </Field>
          <Field label="Case pack">
            {isAdmin ? (
              <InlineEditCell
                value={item.case_pack ?? ""}
                type="number"
                inputMode="numeric"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await onField("case_pack", v);
                }}
              />
            ) : (
              item.case_pack ?? "—"
            )}
          </Field>
          <Field label="Product group">
            {isAdmin ? (
              <InlineEditCell
                value={item.product_group ?? ""}
                type="text"
                ifMatchUpdatedAt={ifMatch}
                onSave={async (v) => {
                  await onField("product_group", v);
                }}
              />
            ) : (
              item.product_group ?? "—"
            )}
          </Field>
          <Field label="Supply method">{fmtSupplyMethod(item.supply_method)}</Field>
          <Field label="Item type">{item.item_type ?? "—"}</Field>
        </div>
      </SectionCard>
    </>
  );
}

export default function AdminProduct360Page({ params }: PageProps): JSX.Element {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-fg-muted">Loading…</div>}>
      <AdminProduct360PageInner params={params} />
    </Suspense>
  );
}

function AliasesTab({
  item_id,
  aliases,
  isLoading,
  error,
  isAdmin,
  onAction,
}: {
  item_id: string;
  aliases: IntegrationSkuMapRow[];
  isLoading: boolean;
  error: Error | null;
  isAdmin: boolean;
  onAction: (alias_id: string, verb: "reject" | "revoke") => void;
}): JSX.Element {
  return (
    <SectionCard
      eyebrow="Aliases"
      title={`${aliases.length} alias mappings for this item`}
      actions={
        <Link
          href={`/admin/sku-aliases?item_id=${encodeURIComponent(item_id)}`}
          className="btn btn-ghost btn-sm"
        >
          Add alias
        </Link>
      }
      contentClassName="p-0"
    >
      {isLoading ? (
        <div className="p-5 text-sm text-fg-muted">Loading…</div>
      ) : error ? (
        <div className="p-5 text-sm text-danger-fg">{error.message}</div>
      ) : aliases.length === 0 ? (
        <div className="p-5 text-sm text-fg-muted">
          No alias mappings. LionWheel / Shopify / Green Invoice SKUs matched
          to this item will appear here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-bg-subtle/60">
                <Th>Channel</Th>
                <Th>External SKU</Th>
                <Th>Status</Th>
                <Th>Notes</Th>
                {isAdmin ? <Th align="right">Actions</Th> : null}
              </tr>
            </thead>
            <tbody>
              {aliases.map((a) => (
                <tr
                  key={a.alias_id}
                  className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                >
                  <td className="px-3 py-2 text-xs font-mono text-fg-muted">
                    {a.source_channel}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-fg">
                    {a.external_sku}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      tone={
                        a.approval_status === "approved"
                          ? "success"
                          : a.approval_status === "rejected"
                            ? "danger"
                            : "warning"
                      }
                      dotted
                    >
                      {a.approval_status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-fg-muted">
                    {a.notes ?? "—"}
                  </td>
                  {isAdmin ? (
                    <td className="px-3 py-2 text-right">
                      {a.approval_status === "pending" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            if (!window.confirm("Reject this alias?")) return;
                            onAction(a.alias_id, "reject");
                          }}
                        >
                          Reject
                        </button>
                      ) : a.approval_status === "approved" ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            if (!window.confirm("Revoke this alias?")) return;
                            onAction(a.alias_id, "revoke");
                          }}
                        >
                          Revoke
                        </button>
                      ) : (
                        <span className="text-3xs text-fg-subtle">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function BomTab({
  item,
  head,
  versions,
  isLoading,
}: {
  item: ItemRow;
  head: BomHeadRow | null;
  versions: BomVersionRow[];
  isLoading: boolean;
}): JSX.Element {
  if (item.supply_method === "BOUGHT_FINISHED") {
    return (
      <SectionCard title="No BOM for BOUGHT_FINISHED items">
        <p className="text-sm text-fg-muted">
          This item is purchased finished — it has no BOM. Procurement
          readiness depends on its supplier_items (see Suppliers tab).
        </p>
      </SectionCard>
    );
  }

  if (isLoading) {
    return (
      <SectionCard title="BOM">
        <p className="text-sm text-fg-muted">Loading BOM…</p>
      </SectionCard>
    );
  }

  if (!head) {
    return (
      <SectionCard title="BOM" tone="warning">
        <p className="text-sm text-warning-fg">
          No BOM head found for this item. Use the BOM editor to create one.
        </p>
      </SectionCard>
    );
  }

  const activeVersion = versions.find(
    (v) => v.bom_version_id === head.active_version_id,
  );

  return (
    <>
      <SectionCard eyebrow="BOM head" title={head.bom_head_id}>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Field label="Type">{head.bom_kind}</Field>
          <Field label="Family">{head.display_family ?? "—"}</Field>
          <Field label="Base output">
            {head.final_bom_output_qty} {head.final_bom_output_uom ?? ""}
          </Field>
          <Field label="Status">{head.status}</Field>
          <Field label="Active version ID">
            <span className="font-mono text-xs">
              {head.active_version_id ?? "— (none active)"}
            </span>
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="BOM versions"
        title={`${versions.length} versions`}
        actions={
          <div className="flex items-center gap-2">
            {head.active_version_id ? (
              <Link
                href="/planning/boms"
                className="btn btn-ghost btn-sm"
              >
                Simulate production
              </Link>
            ) : null}
            {head.active_version_id ? (
              <Link
                href={`/admin/boms/${encodeURIComponent(head.bom_head_id)}/versions/${encodeURIComponent(head.active_version_id)}`}
                className="btn btn-ghost btn-sm"
              >
                Open in BOM editor
              </Link>
            ) : (
              <Link
                href={`/admin/boms/${encodeURIComponent(head.bom_head_id)}`}
                className="btn btn-ghost btn-sm"
              >
                Open BOM head
              </Link>
            )}
          </div>
        }
        contentClassName="p-0"
      >
        {versions.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No versions for this BOM head.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <Th>Version</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th>Activated</Th>
                  <Th>Active?</Th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr
                    key={v.bom_version_id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      {v.version_label}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        tone={
                          v.status === "active"
                            ? "success"
                            : v.status === "draft"
                              ? "warning"
                              : "neutral"
                        }
                        dotted
                      >
                        {v.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {new Date(v.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {v.activated_at
                        ? new Date(v.activated_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-fg-muted">
                      {v.bom_version_id === head.active_version_id ? (
                        <Badge tone="success" dotted>
                          active
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {activeVersion ? (
              <div className="border-t border-border/70 bg-bg-subtle/30 p-3 text-3xs text-fg-muted">
                Active: v{activeVersion.version_label}
                {activeVersion.activated_at ? (
                  <span className="ml-2 text-fg-subtle">
                    · activated {new Date(activeVersion.activated_at).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" })}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>
    </>
  );
}

function ComponentsTab({
  supplyMethod,
  activeVersionId,
  lines,
  isLoading,
}: {
  supplyMethod: string;
  activeVersionId: string | null;
  lines: BomLineRow[];
  isLoading: boolean;
}): JSX.Element {
  if (supplyMethod === "BOUGHT_FINISHED") {
    return (
      <SectionCard title="No components — BOUGHT_FINISHED">
        <p className="text-sm text-fg-muted">
          Purchased finished items have no BOM-expanded components.
        </p>
      </SectionCard>
    );
  }

  if (!activeVersionId) {
    return (
      <SectionCard title="No active BOM version" tone="warning">
        <p className="text-sm text-warning-fg">
          No active BOM version — components list is empty. Publish a version in the BOM editor.
        </p>
      </SectionCard>
    );
  }

  if (isLoading) {
    return (
      <SectionCard title="Components">
        <p className="text-sm text-fg-muted">Loading components…</p>
      </SectionCard>
    );
  }

  if (lines.length === 0) {
    return (
      <SectionCard title="Empty BOM" tone="warning">
        <p className="text-sm text-warning-fg">
          Active BOM version has zero lines.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      eyebrow="Components"
      title={`${lines.length} components in active BOM`}
      contentClassName="p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-bg-subtle/60">
              <Th>Line</Th>
              <Th>Component</Th>
              <Th align="right">Qty per</Th>
              <Th>UoM</Th>
              <Th>Readiness</Th>
            </tr>
          </thead>
          <tbody>
            {lines
              .slice()
              .sort((a, b) => a.line_no - b.line_no)
              .map((l) => (
                <tr
                  key={l.line_id}
                  className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                >
                  <td className="px-3 py-2 text-xs tabular-nums text-fg-muted">
                    {l.line_no}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/components/${encodeURIComponent(l.final_component_id)}`}
                      className="font-medium text-fg hover:text-accent"
                    >
                      {l.final_component_name}
                    </Link>
                    <div className="text-3xs font-mono text-fg-subtle">
                      {l.final_component_id}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
                    {l.final_component_qty}
                  </td>
                  <td className="px-3 py-2 text-xs text-fg-muted">
                    {l.component_uom ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <ComponentReadinessCell component_id={l.final_component_id} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function ComponentReadinessCell({
  component_id,
}: {
  component_id: string;
}): JSX.Element {
  const q = useQuery<ReadinessPayload>({
    queryKey: ["admin", "components", component_id, "readiness"],
    queryFn: () =>
      fetchJson(
        `/api/components/${encodeURIComponent(component_id)}/readiness`,
      ),
  });
  if (q.isLoading) {
    return <span className="text-3xs text-fg-subtle">…</span>;
  }
  if (q.isError || !q.data) {
    return <ReadinessPill readiness={null} />;
  }
  return <ReadinessPill readiness={q.data} />;
}

function SuppliersTab({
  supplyMethod,
  activeVersionId,
  bomComponentIds,
  components,
  suppliers,
}: {
  supplyMethod: string;
  activeVersionId: string | null;
  bomComponentIds: string[];
  components: ComponentRow[];
  suppliers: SupplierRow[];
}): JSX.Element {
  if (supplyMethod === "BOUGHT_FINISHED") {
    return (
      <SectionCard title="Suppliers (BOUGHT_FINISHED)">
        <p className="text-sm text-fg-muted">
          Purchased finished items map directly to supplier_items via
          supplier_items.item_id. Use the /admin/supplier-items page to
          manage the catalog for this item.
        </p>
      </SectionCard>
    );
  }

  if (!activeVersionId) {
    return (
      <SectionCard title="No active BOM" tone="warning">
        <p className="text-sm text-warning-fg">
          No active BOM version — supplier coverage cannot be computed.
        </p>
      </SectionCard>
    );
  }

  if (bomComponentIds.length === 0) {
    return (
      <SectionCard title="Empty BOM" tone="warning">
        <p className="text-sm text-warning-fg">
          Active BOM has no components — no supplier coverage.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      eyebrow="Suppliers"
      title="Primary supplier per component (flat list)"
      description="A13 simplification (vs full supplier matrix): one row per component, resolving its approved primary supplier_item if any. Missing-primary rows flagged."
      contentClassName="p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-bg-subtle/60">
              <Th>Component</Th>
              <Th>Primary supplier</Th>
              <Th align="right">Lead days</Th>
              <Th align="right">MOQ</Th>
              <Th>Coverage</Th>
            </tr>
          </thead>
          <tbody>
            {bomComponentIds.map((cid) => (
              <SupplierCoverageRow
                key={cid}
                component_id={cid}
                components={components}
                suppliers={suppliers}
              />
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function SupplierCoverageRow({
  component_id,
  components,
  suppliers,
}: {
  component_id: string;
  components: ComponentRow[];
  suppliers: SupplierRow[];
}): JSX.Element {
  const supplierItemsQuery = useQuery<ListEnvelope<SupplierItemRow>>({
    queryKey: ["admin", "supplier-items", "by-component", component_id],
    queryFn: () =>
      fetchJson(
        `/api/supplier-items?component_id=${encodeURIComponent(component_id)}&limit=1000`,
      ),
  });

  const component = components.find((c) => c.component_id === component_id);
  const rows = supplierItemsQuery.data?.rows ?? [];
  const primary = rows.find(
    (r) => r.is_primary && r.approval_status === "approved",
  );
  const supplierLookup = new Map(
    suppliers.map((s) => [s.supplier_id, s.supplier_name_official]),
  );

  return (
    <tr className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40">
      <td className="px-3 py-2">
        <Link
          href={`/admin/components/${encodeURIComponent(component_id)}`}
          className="font-medium text-fg hover:text-accent"
        >
          {component?.component_name ?? component_id}
        </Link>
        <div className="text-3xs font-mono text-fg-subtle">{component_id}</div>
      </td>
      <td className="px-3 py-2">
        {supplierItemsQuery.isLoading ? (
          <span className="text-3xs text-fg-subtle">…</span>
        ) : primary ? (
          <Link
            href={`/admin/suppliers/${encodeURIComponent(primary.supplier_id)}`}
            className="text-fg hover:text-accent"
          >
            {supplierLookup.get(primary.supplier_id) ?? primary.supplier_id}
          </Link>
        ) : rows.length > 0 ? (
          <Badge tone="warning" dotted>
            <AlertTriangle className="mr-1 inline h-3 w-3" /> No primary
          </Badge>
        ) : (
          <Badge tone="danger" dotted>
            <AlertTriangle className="mr-1 inline h-3 w-3" /> No suppliers
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-fg-muted">
        {primary?.lead_time_days ?? "—"}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
        {primary?.moq ?? "—"}
      </td>
      <td className="px-3 py-2">
        {primary ? (
          <Badge tone="success" dotted>
            covered
          </Badge>
        ) : rows.length > 0 ? (
          <Badge tone="warning" dotted>
            ambiguous
          </Badge>
        ) : (
          <Badge tone="danger" dotted>
            uncovered
          </Badge>
        )}
      </td>
    </tr>
  );
}

function PlanningTab({
  policy,
  isLoading,
  isAdmin,
  onPolicy,
}: {
  policy: PlanningPolicyRow[];
  isLoading: boolean;
  isAdmin: boolean;
  onPolicy: (
    key: string,
    value: string | number,
    updated_at: string,
  ) => Promise<unknown>;
}): JSX.Element {
  return (
    <SectionCard
      eyebrow="Planning policy"
      title={`${policy.length} policy keys`}
      description="v1 planning_policy is site-wide KV; per-item planning overlays are not yet modeled. Inline-edit mutates the canonical KV row shared across all items."
      contentClassName="p-0"
    >
      {isLoading ? (
        <div className="p-5 text-sm text-fg-muted">Loading policy…</div>
      ) : policy.length === 0 ? (
        <div className="p-5 text-sm text-fg-muted">No policy keys.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-bg-subtle/60">
                <Th>Key</Th>
                <Th>Value</Th>
                <Th>UoM</Th>
                <Th>Description</Th>
              </tr>
            </thead>
            <tbody>
              {policy.map((r) => (
                <tr
                  key={r.key}
                  className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                >
                  <td className="px-3 py-2 font-mono text-xs text-fg">
                    {r.key}
                  </td>
                  <td className="px-3 py-2 text-fg-strong">
                    {isAdmin ? (
                      <InlineEditCell
                        value={r.value}
                        type="text"
                        ifMatchUpdatedAt={r.updated_at}
                        onSave={async (v) => {
                          await onPolicy(r.key, v, r.updated_at);
                        }}
                      />
                    ) : (
                      <span className="font-mono">{r.value}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-fg-muted">
                    {r.uom ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-fg-muted">
                    {r.description ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function HistoryTab(): JSX.Element {
  return (
    <SectionCard title="History" tone="info">
      <p className="text-sm text-fg-muted">
        Change history for this item is not yet available in the portal. All admin mutations are audited and stored; the history view will appear here when the endpoint is live.
      </p>
    </SectionCard>
  );
}

// --- Small helpers --------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/30 py-2">
      <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </span>
      <span className="text-sm text-fg">{children}</span>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}): JSX.Element {
  return (
    <th
      className={`px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
