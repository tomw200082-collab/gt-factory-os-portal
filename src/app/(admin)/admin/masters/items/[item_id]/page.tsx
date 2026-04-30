"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · Items · Detail — Tranche D of portal-full-production-refactor
// (plan §F). Canonical URL /admin/masters/items/[item_id].
//
// Composes <DetailPage /> (the Tranche A→D primitive) with 6 tabs:
//   - overview          LIVE   — item row fields via list + client-filter
//   - bom               LIVE*  — unified view of pack BOM (primary_bom_head_id)
//                                and base formula BOM (base_bom_head_id)
//   - supplier-items    LIVE*  — supplier-items via ?item_id= (BOUGHT_FINISHED)
//                                or PENDING note for MANUFACTURED (component fan-out
//                                is a Tranche I aggregation concern, not invented)
//   - anchors           PENDING— no anchors endpoint in upstream yet
//   - policy            PENDING— planning-policy endpoint is global, not per-item
//   - exceptions        LIVE   — /api/exceptions client-filtered by related_entity_id
//
// Linkage card: pack BOM, base formula BOM, primary supplier-item(s), exceptions.
//
// View-only. Inline edit is Tranche F (approval queue coupled).
// ---------------------------------------------------------------------------

import { use, useState, useMemo } from "react";
import { fmtSupplyMethod } from "@/lib/display";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DetailPage,
  DetailFieldGrid,
  DetailTabEmpty,
  DetailTabError,
  DetailTabLoading,
  PendingTabPlaceholder,
  type LinkageGroup,
  type TabDescriptor,
  type FieldRow,
} from "@/components/patterns/DetailPage";
import { Badge } from "@/components/badges/StatusBadge";
import { SectionCard } from "@/components/workflow/SectionCard";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { MasterSummaryCard, type CompletenessItem } from "@/components/admin/MasterSummaryCard";
import { RecipeHealthCard } from "@/components/admin/recipe-health/RecipeHealthCard";
import { VersionHistorySection } from "@/components/admin/recipe-health/VersionHistorySection";
import { ClassWEditDrawer } from "@/components/admin/ClassWEditDrawer";
import { AdminMutationError, patchEntity, postStatus } from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";

// --- Types (mirrored from upstream schemas) ------------------------------

interface ItemRow {
  item_id: string;
  sku: string | null;
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

interface ItemsListResponse {
  rows: ItemRow[];
  count: number;
}

interface BomHeadRow {
  bom_head_id: string;
  bom_kind: string;
  display_family: string | null;
  pack_size: string | null;
  parent_ref_type: string | null;
  parent_ref_id: string | null;
  active_version_id: string | null;
  status: string;
  final_bom_output_qty: string;
  final_bom_output_uom: string;
}

interface BomHeadsListResponse {
  rows: BomHeadRow[];
  count: number;
}

interface BomVersionRow {
  bom_version_id: string;
  bom_head_id: string;
  version_label: string;
  status: string;
  activated_at: string | null;
  created_at: string;
}

interface BomVersionsListResponse {
  rows: BomVersionRow[];
  count: number;
}

interface SupplierItemRow {
  supplier_item_id: string;
  supplier_id: string;
  component_id: string | null;
  item_id: string | null;
  relationship: string | null;
  is_primary: boolean;
  order_uom: string | null;
  lead_time_days: number | null;
  approval_status: string | null;
}

interface SupplierItemsListResponse {
  rows: SupplierItemRow[];
  count: number;
}

interface ExceptionRow {
  exception_id: string;
  category: string;
  severity: string;
  source: string;
  title: string;
  detail: string | null;
  status: string;
  created_at: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
}

interface ExceptionsListResponse {
  rows: ExceptionRow[];
  count: number;
}

// --- fetch helper --------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

// --- formatting ----------------------------------------------------------

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ItemStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE") return <Badge tone="success" dotted>Active</Badge>;
  if (status === "PENDING") return <Badge tone="warning" dotted>Pending</Badge>;
  if (status === "INACTIVE") return <Badge tone="neutral" dotted>Inactive</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

function SeverityBadge({ severity }: { severity: string }): JSX.Element {
  if (severity === "critical") return <Badge tone="danger" dotted>critical</Badge>;
  if (severity === "warning") return <Badge tone="warning" dotted>warning</Badge>;
  return <Badge tone="info" dotted>info</Badge>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminItemDetailPage({
  params,
}: {
  params: Promise<{ item_id: string }>;
}): JSX.Element {
  const { item_id } = use(params);

  // --- Data: item row (list-filter pattern; upstream has no GET-by-id) -----
  const itemQuery = useQuery<ItemsListResponse>({
    queryKey: ["admin", "masters", "item", item_id],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  const row = itemQuery.data?.rows.find((r) => r.item_id === item_id);

  // --- Data: BOM heads (shared query for both pack and base) ---------------
  // Enabled whenever either BOM head ID is present so both can be derived
  // from a single /api/boms/heads?limit=1000 call.
  const bomHeadQuery = useQuery<BomHeadsListResponse>({
    queryKey: ["admin", "masters", "item", item_id, "bom-head"],
    queryFn: () => fetchJson("/api/boms/heads?limit=1000"),
    enabled: Boolean(row?.primary_bom_head_id || row?.base_bom_head_id),
  });
  const bomHead = row?.primary_bom_head_id
    ? bomHeadQuery.data?.rows.find(
        (h) => h.bom_head_id === row.primary_bom_head_id,
      )
    : undefined;
  const baseBomHead = row?.base_bom_head_id
    ? bomHeadQuery.data?.rows.find(
        (h) => h.bom_head_id === row.base_bom_head_id,
      )
    : undefined;

  // --- Data: BOM versions (pack head) --------------------------------------
  const bomVersionsQuery = useQuery<BomVersionsListResponse>({
    queryKey: ["admin", "masters", "item", item_id, "bom-versions"],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(
          row!.primary_bom_head_id!,
        )}&limit=1000`,
      ),
    enabled: Boolean(row?.primary_bom_head_id),
  });

  // --- Data: BOM versions (base formula head) ------------------------------
  const baseBomVersionsQuery = useQuery<BomVersionsListResponse>({
    queryKey: ["admin", "masters", "item", item_id, "base-bom-versions"],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(
          row!.base_bom_head_id!,
        )}&limit=1000`,
      ),
    enabled: Boolean(row?.base_bom_head_id),
  });

  // --- Data: supplier-items (item-level, BOUGHT_FINISHED only) -------------
  const itemSupplierItemsQuery = useQuery<SupplierItemsListResponse>({
    queryKey: ["admin", "masters", "item", item_id, "supplier-items"],
    queryFn: () =>
      fetchJson(
        `/api/supplier-items?item_id=${encodeURIComponent(item_id)}&limit=1000`,
      ),
    enabled: row?.supply_method === "BOUGHT_FINISHED",
  });

  // --- Data: suppliers (for resolving supplier_id -> name in UI) -----------
  const suppliersQuery = useQuery<{ rows: { supplier_id: string; supplier_name_official: string; supplier_name_short: string | null }[]; count: number }>({
    queryKey: ["admin", "suppliers", "all"],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
  });
  const suppliersById = useMemo(() => {
    const m = new Map<string, { supplier_name_short: string | null; supplier_name_official: string }>();
    for (const s of suppliersQuery.data?.rows ?? []) {
      m.set(s.supplier_id, { supplier_name_short: s.supplier_name_short, supplier_name_official: s.supplier_name_official });
    }
    return m;
  }, [suppliersQuery.data]);
  function supplierNameOf(id: string | null | undefined): string {
    if (!id) return "—";
    const s = suppliersById.get(id);
    return s?.supplier_name_short || s?.supplier_name_official || id;
  }

  // --- Data: exceptions (client-side filter by related_entity_id) ----------
  const exceptionsQuery = useQuery<ExceptionsListResponse>({
    queryKey: ["admin", "masters", "item", item_id, "exceptions"],
    queryFn: () => fetchJson("/api/exceptions?status=open,acknowledged&limit=1000"),
  });
  const relatedExceptions =
    exceptionsQuery.data?.rows.filter(
      (e) => e.related_entity_id === item_id,
    ) ?? [];

  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();

  const [showStatusDrawer, setShowStatusDrawer] = useState(false);
  const [drawerStatusTarget, setDrawerStatusTarget] = useState<string>("");

  const itemFieldMutation = useMutation({
    mutationFn: async (args: { field: string; value: unknown; updated_at: string }) =>
      patchEntity({
        url: `/api/items/${encodeURIComponent(item_id)}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "masters", "item", item_id] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (args: { newStatus: string; updated_at: string }) =>
      postStatus({
        url: `/api/items/${encodeURIComponent(item_id)}/status`,
        status: args.newStatus,
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setShowStatusDrawer(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "masters", "item", item_id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "items"] });
    },
  });

  const completenessItems = useMemo((): CompletenessItem[] => {
    if (!row) return [];
    const isBought = row.supply_method === "BOUGHT_FINISHED";
    const isManufactured = row.supply_method === "MANUFACTURED" || row.supply_method === "REPACK";
    const hasActiveBom = !!(row.primary_bom_head_id || row.base_bom_head_id);
    const primarySi = (itemSupplierItemsQuery.data?.rows ?? []).filter((si) => si.is_primary);
    return [
      ...(isManufactured
        ? [{ label: "Active recipe (BOM)", status: hasActiveBom ? ("ok" as const) : ("error" as const), detail: hasActiveBom ? undefined : "No BOM linked — item cannot be planned" }]
        : []),
      ...(isBought
        ? [{ label: "Primary supplier", status: primarySi.length > 0 ? ("ok" as const) : ("warn" as const), detail: primarySi.length > 0 ? supplierNameOf(primarySi[0]!.supplier_id) : "No primary supplier set" }]
        : []),
      { label: "Name set", status: row.item_name ? ("ok" as const) : ("error" as const) },
    ];
  }, [row, itemSupplierItemsQuery.data]);

  // --- Header meta ---------------------------------------------------------
  const headerMeta = row ? (
    <>
      <ItemStatusBadge status={row.status} />
      <Badge tone="neutral" dotted>
        {fmtSupplyMethod(row.supply_method)}
      </Badge>
      {row.family ? <Badge tone="neutral">{row.family}</Badge> : null}
      {row.item_type ? <Badge tone="neutral">{row.item_type}</Badge> : null}
    </>
  ) : null;

  // --- Tabs ----------------------------------------------------------------

  const overviewTab: TabDescriptor = {
    key: "overview",
    label: "Overview",
    content: (() => {
      if (itemQuery.isLoading) return <DetailTabLoading />;
      if (itemQuery.isError) {
        return <DetailTabError message={(itemQuery.error as Error).message} />;
      }
      if (!row) {
        return <DetailTabEmpty message={`Item ${item_id} not found in the items list.`} />;
      }
      const classLFields: FieldRow[] = [
        { label: "Item code (locked)", value: row.item_id, mono: true },
        { label: "SKU (locked)", value: row.sku ?? "—", mono: true },
        { label: "Supply method (locked)", value: fmtSupplyMethod(row.supply_method) },
        { label: "Pack BOM (locked)", value: row.primary_bom_head_id ? (
          <Link href={`/admin/masters/boms/${encodeURIComponent(row.primary_bom_head_id)}`} className="font-mono text-accent hover:underline">{row.primary_bom_head_id}</Link>
        ) : "—", mono: true },
        { label: "Base formula BOM (locked)", value: row.base_bom_head_id ? (
          <Link href={`/admin/masters/boms/${encodeURIComponent(row.base_bom_head_id)}`} className="font-mono text-accent hover:underline">{row.base_bom_head_id}</Link>
        ) : "—", mono: true },
        { label: "Site", value: row.site_id, mono: true },
        { label: "Created", value: fmtDateTime(row.created_at) },
        { label: "Last updated", value: fmtDateTime(row.updated_at) },
      ];
      return (
        <div className="space-y-4 p-1">
          <SectionCard title="Details" density="compact">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Name</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.item_name}
                    onSave={(val) => itemFieldMutation.mutateAsync({ field: "item_name", value: val, updated_at: row.updated_at }) as Promise<void>}
                    ariaLabel="Edit item name"
                  />
                ) : (
                  <span className="text-fg-strong font-medium">{row.item_name}</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Family</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.family ?? ""}
                    onSave={(val) => itemFieldMutation.mutateAsync({ field: "family", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>}
                    ariaLabel="Edit family"
                  />
                ) : (
                  <span className="text-fg">{row.family ?? "—"}</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Product group</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.product_group ?? ""}
                    onSave={(val) => itemFieldMutation.mutateAsync({ field: "product_group", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>}
                    ariaLabel="Edit product group"
                  />
                ) : (
                  <span className="text-fg">{row.product_group ?? "—"}</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Item type</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.item_type ?? ""}
                    onSave={(val) => itemFieldMutation.mutateAsync({ field: "item_type", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>}
                    ariaLabel="Edit item type"
                  />
                ) : (
                  <span className="text-fg">{row.item_type ?? "—"}</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Pack size</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.pack_size ?? ""}
                    onSave={(val) => itemFieldMutation.mutateAsync({ field: "pack_size", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>}
                    ariaLabel="Edit pack size"
                  />
                ) : (
                  <span className="text-fg">{row.pack_size ?? "—"}</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Sales unit</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.sales_uom ?? ""}
                    onSave={(val) => itemFieldMutation.mutateAsync({ field: "sales_uom", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>}
                    ariaLabel="Edit sales unit"
                  />
                ) : (
                  <span className="text-fg">{row.sales_uom ?? "—"}</span>
                )}
              </div>
              <div>
                <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Case pack</span>
                {isAdmin ? (
                  <InlineEditCell
                    value={row.case_pack !== null ? String(row.case_pack) : ""}
                    onSave={(val) => itemFieldMutation.mutateAsync({ field: "case_pack", value: val ? Number(val) : null, updated_at: row.updated_at }) as Promise<void>}
                    ariaLabel="Edit case pack"
                  />
                ) : (
                  <span className="text-fg">{row.case_pack ?? "—"}</span>
                )}
              </div>
            </div>
          </SectionCard>

          <details className="group rounded-md border border-border/50 bg-bg-subtle">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs text-fg-muted group-open:border-b group-open:border-border/50">
              Technical details (locked fields)
            </summary>
            <div className="px-3 py-2">
              <p className="mb-2 text-xs text-fg-subtle">Supply method, BOM links, and identifiers require a migration or BOM workflow to change safely.</p>
              <DetailFieldGrid rows={classLFields} />
            </div>
          </details>

          {itemFieldMutation.isError ? (
            <p className="text-xs text-danger-fg">
              {itemFieldMutation.error instanceof AdminMutationError
                ? itemFieldMutation.error.message
                : "Save failed. Please try again."}
            </p>
          ) : null}
        </div>
      );
    })(),
  };

  const bomTab: TabDescriptor = {
    key: "bom",
    label: "BOM",
    content: (() => {
      if (!row) return <DetailTabEmpty message="Item row not loaded yet." />;
      if (row.supply_method === "BOUGHT_FINISHED") {
        return (
          <DetailTabEmpty message="BOUGHT_FINISHED items are resold as-is and have no BOM." />
        );
      }
      const hasPack = Boolean(row.primary_bom_head_id);
      const hasBase = Boolean(row.base_bom_head_id);
      if (!hasPack && !hasBase) {
        return (
          <div className="space-y-3 p-4">
            <p className="text-sm text-fg-muted">
              No recipe linked to this item. A {row.supply_method === "MANUFACTURED" ? "manufactured" : "repack"} item needs an active BOM before it can be planned or produced.
            </p>
            <Link
              href="/admin/masters/boms"
              className="btn-primary inline-flex items-center gap-1.5"
            >
              Go to BOMs →
            </Link>
          </div>
        );
      }
      if (
        bomHeadQuery.isLoading ||
        (hasPack && bomVersionsQuery.isLoading) ||
        (hasBase && baseBomVersionsQuery.isLoading)
      ) {
        return <DetailTabLoading />;
      }
      if (bomHeadQuery.isError) {
        return (
          <DetailTabError message={(bomHeadQuery.error as Error).message} />
        );
      }
      return (
        <div className="space-y-4">
          {hasPack && (
            <BomSection
              sectionLabel="Pack structure"
              sectionDescription="How this product is packaged and assembled."
              headId={row.primary_bom_head_id!}
              head={bomHead ?? null}
              versions={bomVersionsQuery.data?.rows ?? []}
              versionsLoading={bomVersionsQuery.isLoading}
            />
          )}

          {hasPack && hasBase && (
            <div className="rounded-md border border-info/30 bg-info-softer px-3 py-2 text-xs text-fg-muted">
              The pack structure uses the base formula as a component.
              Changes to the base formula affect all products that reference it.
            </div>
          )}

          {hasBase && (
            <BomSection
              sectionLabel="Base formula"
              sectionDescription="The recipe or formula this product is built from."
              headId={row.base_bom_head_id!}
              head={baseBomHead ?? null}
              versions={baseBomVersionsQuery.data?.rows ?? []}
              versionsLoading={baseBomVersionsQuery.isLoading}
            />
          )}
        </div>
      );
    })(),
  };

  const supplierItemsTab: TabDescriptor = {
    key: "supplier-items",
    label: "Supplier items",
    content: (() => {
      if (!row) return <DetailTabEmpty message="Item row not loaded yet." />;
      if (row.supply_method === "BOUGHT_FINISHED") {
        if (itemSupplierItemsQuery.isLoading) return <DetailTabLoading />;
        if (itemSupplierItemsQuery.isError) {
          return (
            <DetailTabError
              message={(itemSupplierItemsQuery.error as Error).message}
            />
          );
        }
        const rows = itemSupplierItemsQuery.data?.rows ?? [];
        if (rows.length === 0) {
          return (
            <DetailTabEmpty message="No supplier linked to this purchased product. Use Admin → Supplier Items to add one." />
          );
        }
        return <SupplierItemsTable rows={rows} supplierNameOf={supplierNameOf} />;
      }
      // MANUFACTURED / REPACK: per-component supplier fan-out requires a
      // bom_line → component → supplier_item aggregation we will not
      // compute client-side in this tranche (N+1 over BOM lines is an
      // anti-pattern; a proper aggregate endpoint belongs to a later tranche).
      return (
        <PendingTabPlaceholder
          reason="Supplier coverage for manufactured items is per component. Open each component from the BOM tab to see its supplier items."
        />
      );
    })(),
  };

  const anchorsTab: TabDescriptor = {
    key: "anchors",
    label: "Anchors",
    content: (
      <PendingTabPlaceholder
        reason="Stock anchors for individual items are not yet available here. Check the stock movement log for balance history."
      />
    ),
  };

  const policyTab: TabDescriptor = {
    key: "policy",
    label: "Policy",
    content: (
      <PendingTabPlaceholder
        reason="Per-item planning policy overrides are not yet available. Global planning policy is managed in Admin → Planning policy."
      />
    ),
  };

  const exceptionsTab: TabDescriptor = {
    key: "exceptions",
    label: "Exceptions",
    badge:
      relatedExceptions.length > 0
        ? `${relatedExceptions.length}`
        : undefined,
    content: (() => {
      if (exceptionsQuery.isLoading) return <DetailTabLoading />;
      if (exceptionsQuery.isError) {
        return (
          <DetailTabError
            message={(exceptionsQuery.error as Error).message}
          />
        );
      }
      if (relatedExceptions.length === 0) {
        return (
          <DetailTabEmpty message="No open or acknowledged exceptions linked to this item." />
        );
      }
      return (
        <SectionCard
          density="compact"
          contentClassName="p-0"
        >
          <ul className="divide-y divide-border/40">
            {relatedExceptions.map((e) => (
              <li key={e.exception_id} className="flex items-start gap-3 px-4 py-2 text-xs">
                <SeverityBadge severity={e.severity} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-fg">{e.title}</div>
                  {e.detail ? (
                    <div className="truncate text-fg-muted">{e.detail}</div>
                  ) : null}
                  <div className="mt-0.5 text-3xs text-fg-faint">
                    {e.category} · {e.status} · {fmtDateTime(e.created_at)}
                  </div>
                </div>
                <Link
                  href={`/inbox?view=exceptions&exception_id=${encodeURIComponent(
                    e.exception_id,
                  )}`}
                  className="shrink-0 text-accent hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      );
    })(),
  };

  const tabs: TabDescriptor[] = [
    overviewTab,
    bomTab,
    supplierItemsTab,
    anchorsTab,
    policyTab,
    exceptionsTab,
  ];

  // --- Linkage card --------------------------------------------------------
  const linkages: LinkageGroup[] = [];

  if (row?.primary_bom_head_id) {
    linkages.push({
      label: "Pack BOM",
      items: [
        {
          label: row.primary_bom_head_id,
          href: `/admin/masters/boms/${encodeURIComponent(
            row.primary_bom_head_id,
          )}`,
          subtitle: bomHead
            ? `${bomHead.bom_kind} · ${bomHead.status}`
            : undefined,
        },
      ],
    });
  }

  if (row?.base_bom_head_id) {
    linkages.push({
      label: "Base formula BOM",
      items: [
        {
          label: row.base_bom_head_id,
          href: `/admin/masters/boms/${encodeURIComponent(
            row.base_bom_head_id,
          )}`,
          subtitle: baseBomHead
            ? `${baseBomHead.bom_kind} · ${baseBomHead.status}`
            : undefined,
        },
      ],
    });
  }

  if (row?.supply_method === "BOUGHT_FINISHED") {
    const primarySi = (itemSupplierItemsQuery.data?.rows ?? []).filter(
      (si) => si.is_primary,
    );
    linkages.push({
      label: "Primary supplier",
      items: primarySi.map((si) => ({
        label: supplierNameOf(si.supplier_id),
        href: `/admin/masters/suppliers/${encodeURIComponent(si.supplier_id)}`,
        subtitle: si.relationship ?? undefined,
        badge: <Badge tone="success" dotted>primary</Badge>,
      })),
      emptyText: "No primary supplier mapped yet.",
    });
  }

  linkages.push({
    label: "Exceptions",
    items: relatedExceptions.slice(0, 5).map((e) => ({
      label: e.title.slice(0, 48),
      href: `/inbox?view=exceptions&exception_id=${encodeURIComponent(
        e.exception_id,
      )}`,
      badge: <SeverityBadge severity={e.severity} />,
    })),
    emptyText: "No open exceptions for this item.",
  });

  return (
    <>
      {row ? (
        row.supply_method === "MANUFACTURED" ? (
          <>
            <RecipeHealthCard
              itemName={row.item_name ?? row.item_id}
              baseBomHeadId={row.base_bom_head_id ?? null}
              packBomHeadId={row.primary_bom_head_id ?? null}
              isAdmin={isAdmin}
            />
            <VersionHistorySection
              baseBomHeadId={row.base_bom_head_id ?? null}
              packBomHeadId={row.primary_bom_head_id ?? null}
              isAdmin={isAdmin}
            />
          </>
        ) : (
          <MasterSummaryCard
            name={row.item_name}
            code={row.item_id}
            entityType={fmtSupplyMethod(row.supply_method)}
            status={row.status}
            completeness={completenessItems}
            actions={
              isAdmin ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setDrawerStatusTarget(row.status === "INACTIVE" ? "ACTIVE" : "INACTIVE");
                    setShowStatusDrawer(true);
                  }}
                >
                  {row.status === "INACTIVE" ? "Restore" : "Archive"}
                </button>
              ) : undefined
            }
          />
        )
      ) : null}

      <ClassWEditDrawer
        open={showStatusDrawer}
        onClose={() => setShowStatusDrawer(false)}
        title={drawerStatusTarget === "INACTIVE" ? "Archive item" : "Restore item"}
        warning={
          drawerStatusTarget === "INACTIVE"
            ? "Archiving this item hides it from planning, ordering, and production workflows. Existing stock events and BOMs are not deleted."
            : "Restoring this item makes it available again in planning and operational workflows."
        }
        onSave={async () => {
          if (!row) return;
          await statusMutation.mutateAsync({ newStatus: drawerStatusTarget, updated_at: row.updated_at });
        }}
        isSaving={statusMutation.isPending}
        error={statusMutation.isError ? (statusMutation.error as Error).message : null}
      >
        <p className="text-sm text-fg-muted">
          {drawerStatusTarget === "INACTIVE"
            ? "This will set the item status to Archived."
            : "This will set the item status to Active."}
        </p>
      </ClassWEditDrawer>

      <DetailPage
        header={{
          eyebrow: "Admin · Items",
          title: row ? `${row.item_name}` : item_id,
          description: row ? `Item ${row.item_id}` : "Loading item…",
          meta: headerMeta,
          actions: (
            <Link href="/admin/items" className="btn btn-ghost btn-sm">
              Back to items
            </Link>
          ),
        }}
        tabs={tabs}
        linkages={linkages}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// BomSection — renders one BOM (pack or base) within the unified BOM tab.
// Shared by both primary_bom_head_id and base_bom_head_id paths.
// ---------------------------------------------------------------------------

function BomSection({
  sectionLabel,
  sectionDescription,
  headId,
  head,
  versions,
  versionsLoading,
}: {
  sectionLabel: string;
  sectionDescription: string;
  headId: string;
  head: BomHeadRow | null;
  versions: BomVersionRow[];
  versionsLoading: boolean;
}): JSX.Element {
  if (!head) {
    return (
      <SectionCard
        eyebrow={sectionLabel}
        title={headId}
        density="compact"
        contentClassName="p-3"
      >
        <p className="text-xs text-warning-fg">
          BOM head {headId} not found in the heads list.
        </p>
      </SectionCard>
    );
  }

  const activeVersion = head.active_version_id
    ? versions.find((v) => v.bom_version_id === head.active_version_id)
    : undefined;

  const fields: FieldRow[] = [
    {
      label: "BOM ID",
      value: (
        <Link
          href={`/admin/masters/boms/${encodeURIComponent(headId)}`}
          className="font-mono text-accent hover:underline"
        >
          {headId}
        </Link>
      ),
      mono: true,
    },
    { label: "Type", value: head.bom_kind, mono: true },
    { label: "Display family", value: head.display_family },
    { label: "Pack size", value: head.pack_size },
    {
      label: "Output quantity",
      value: `${head.final_bom_output_qty} ${head.final_bom_output_uom}`,
      mono: true,
    },
    {
      label: "Active version",
      value: head.active_version_id ? (
        <Link
          href={`/admin/masters/boms/${encodeURIComponent(headId)}/${encodeURIComponent(head.active_version_id)}`}
          className="font-mono text-success-fg hover:underline"
        >
          {activeVersion?.version_label ?? "Active version"}
        </Link>
      ) : (
        <Badge tone="warning" dotted>None</Badge>
      ),
    },
    { label: "Status", value: head.status },
  ];

  return (
    <SectionCard
      eyebrow={sectionLabel}
      title={sectionDescription}
      density="compact"
      contentClassName="space-y-3 p-3"
    >
      <DetailFieldGrid rows={fields} />
      <SectionCard
        eyebrow="Versions"
        title={
          versionsLoading
            ? "Loading…"
            : `${versions.length} version${versions.length === 1 ? "" : "s"}`
        }
        density="compact"
        contentClassName="p-0"
      >
        {versionsLoading ? (
          <div className="p-3">
            <div className="space-y-1.5" aria-busy="true" aria-live="polite">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-1.5 last:border-b-0"
                >
                  <div className="h-3 w-20 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-3 flex-1 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : versions.length === 0 ? (
          <div className="p-3 text-xs text-fg-muted">No versions.</div>
        ) : (
          <ul className="divide-y divide-border/40">
            {versions.map((v) => (
              <li
                key={v.bom_version_id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              >
                <Link
                  href={`/admin/masters/boms/${encodeURIComponent(
                    v.bom_head_id,
                  )}/${encodeURIComponent(v.bom_version_id)}`}
                  className="font-mono text-fg hover:text-accent"
                >
                  {v.version_label}
                </Link>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral" dotted>
                    {v.status}
                  </Badge>
                  <span className="text-fg-faint">
                    {fmtDateTime(v.activated_at ?? v.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// SupplierItemsTable — small inline helper used by the supplier-items tab.
// Kept local to the page; promotes to a shared component in Tranche F if
// other detail pages need the same table.
// ---------------------------------------------------------------------------

function SupplierItemsTable({
  rows,
  supplierNameOf,
}: {
  rows: SupplierItemRow[];
  supplierNameOf: (id: string) => string;
}): JSX.Element {
  return (
    <SectionCard density="compact" contentClassName="p-0">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/70 bg-bg-subtle/60">
            <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Supplier
            </th>
            <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Relationship
            </th>
            <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Primary
            </th>
            <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Order UoM
            </th>
            <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Lead (days)
            </th>
            <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Approval
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.supplier_item_id}
              className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
            >
              <td className="px-3 py-2 text-xs text-fg">
                <Link
                  href={`/admin/masters/suppliers/${encodeURIComponent(r.supplier_id)}`}
                  className="hover:text-accent"
                  title={r.supplier_id}
                >
                  {supplierNameOf(r.supplier_id)}
                </Link>
              </td>
              <td className="px-3 py-2 text-fg-muted">
                {r.relationship ?? "—"}
              </td>
              <td className="px-3 py-2">
                {r.is_primary ? (
                  <Badge tone="success" dotted>
                    primary
                  </Badge>
                ) : (
                  <span className="text-fg-faint">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-fg-muted">
                {r.order_uom ?? "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted">
                {r.lead_time_days ?? "—"}
              </td>
              <td className="px-3 py-2">
                {r.approval_status ? (
                  <Badge tone="neutral">{r.approval_status}</Badge>
                ) : (
                  <span className="text-fg-faint">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}
