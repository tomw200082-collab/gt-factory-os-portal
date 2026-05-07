"use client";

// ---------------------------------------------------------------------------
// Admin · Product 360 — 20-iteration UX blitz.
//
// /admin/products/[item_id]
//
// Brings this surface to parity with admin/masters/items/[item_id] which
// completed its own 20-iter polish. All 20 iterations implemented here:
//
//  Iter 1  — Audit; field inventory; dropdown candidates identified.
//  Iter 2  — useItemFieldOptions + InlineEditSelectCell for family,
//             product_group, item_type, pack_size, sales_uom.
//  Iter 3  — Overview tab wired with dropdowns; name + case_pack free-text.
//  Iter 4  — MasterSummaryCard hero with KPI strip, completeness checklist,
//             status pill. reveal-on-mount first-paint animation.
//  Iter 5  — Completeness checklist deep-links with href; fix-action buttons;
//             family + sales-unit checks; counts.
//  Iter 6  — DetailPage TabStrip replaces bespoke tab bar; ARIA tablist;
//             badgeTone pills on all 7 tab buttons.
//  Iter 7  — Overview restructured → "Identity & category" + "Packaging &
//             units" SectionCards; EditableField + FieldHelp (?) popovers.
//  Iter 8  — BOM tab: supply-method-aware hero warning card with downstream
//             consequence list when no BOM linked; "Open BOM editor" CTA.
//  Iter 9  — Suppliers tab: primary-supplier hero card; LeadTimeChip;
//             ApprovalBadge; primary row highlighted; overflow-x-auto.
//  Iter 10 — Aliases tab redesigned: ChannelBadge + ApprovalBadge; rich
//             empty state; overflow-x-auto.
//  Iter 11 — Planning tab: "Per-item overrides" info card + policy reference
//             table replacing plain KV list.
//  Iter 12 — History tab: rich informational card instead of PendingTab.
//  Iter 13 — Inline-edit save feedback: "Saving…" while pending, wrapped in
//             role="status" aria-live="polite" aria-atomic.
//  Iter 14 — Components tab: component links + readiness pill per row.
//  Iter 15 — MANUFACTURED/REPACK supplier empty state: supply-method-aware
//             informational card with BOM tab link + BOM status banner.
//  Iter 16 — Accessibility: all interactive cells carry ariaLabel; mutation
//             feedback in role="status" aria-live region.
//  Iter 17 — Mobile: overflow-x-auto on all tables; responsive grids.
//  Iter 18 — Polish: key={tab} on tabpanel for animate-fade-in-up; hero in
//             reveal-on-mount; technical-details collapsible transition.
//  Iter 19 — Cross-product generalization: MANUFACTURED / BOUGHT_FINISHED /
//             REPACK × ACTIVE / PENDING / INACTIVE all verified.
//  Iter 20 — TypeScript clean (0 errors).
// ---------------------------------------------------------------------------

import { useMemo, useState, use, Suspense, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, notFound } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import { AlertTriangle, Plus } from "lucide-react";
import { fmtSupplyMethod } from "@/lib/display";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { InlineEditSelectCell } from "@/components/tables/InlineEditSelectCell";
import { useItemFieldOptions } from "@/lib/admin/item-field-options";
import { MasterSummaryCard, type CompletenessItem, type KpiStat } from "@/components/admin/MasterSummaryCard";
import {
  DetailPage,
  DetailTabLoading,
  DetailTabError,
  DetailTabEmpty,
  type TabDescriptor,
} from "@/components/patterns/DetailPage";
import { ReadinessPill } from "@/components/readiness/ReadinessPill";
import {
  AdminMutationError,
  patchEntity,
  postStatus,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  supplier_name_short: string | null;
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
  order_uom: string | null;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`,
    );
  }
  return (await res.json()) as T;
}

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

// ---------------------------------------------------------------------------
// Shared inline components
// ---------------------------------------------------------------------------

function ItemStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE")
    return (
      <Badge tone="success" dotted>
        Active
      </Badge>
    );
  if (status === "PENDING")
    return (
      <Badge tone="warning" dotted>
        Pending
      </Badge>
    );
  if (status === "INACTIVE")
    return (
      <Badge tone="neutral" dotted>
        Inactive
      </Badge>
    );
  return (
    <Badge tone="neutral" dotted>
      {status}
    </Badge>
  );
}

// Iter 9 — LeadTimeChip: green ≤7d / amber ≤14d / red >14d.
function LeadTimeChip({ days }: { days: number | null }): JSX.Element {
  if (days === null)
    return <span className="font-mono text-xs text-fg-faint">—</span>;
  const cls =
    days <= 7
      ? "bg-success-softer text-success-fg border-success/30"
      : days <= 14
        ? "bg-warning-softer text-warning-fg border-warning/30"
        : "bg-danger-softer text-danger-fg border-danger/30";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-xs font-semibold ${cls}`}
      title={`Lead time: ${days} days`}
    >
      {days}d
    </span>
  );
}

// Iter 10 — ChannelBadge per integration source.
function ChannelBadge({
  channel,
}: {
  channel: string;
}): JSX.Element {
  const upper = channel.toUpperCase();
  if (upper.includes("SHOPIFY"))
    return <Badge tone="success">{channel}</Badge>;
  if (upper.includes("LIONWHEEL"))
    return <Badge tone="info">{channel}</Badge>;
  if (upper.includes("GREEN") || upper.includes("INVOICE"))
    return <Badge tone="warning">{channel}</Badge>;
  return <Badge tone="neutral">{channel}</Badge>;
}

// Iter 9 — ApprovalBadge with contextual tone.
function ApprovalBadge({
  status,
}: {
  status: string | null;
}): JSX.Element {
  if (!status) return <span className="text-fg-faint">—</span>;
  const upper = status.toUpperCase();
  if (upper === "APPROVED") return <Badge tone="success">{status}</Badge>;
  if (upper.includes("PENDING")) return <Badge tone="warning">{status}</Badge>;
  if (upper === "REJECTED") return <Badge tone="danger">{status}</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

// Iter 7 — EditableField with label + (?) help popover.
function EditableField({
  label,
  help,
  strict,
  children,
}: {
  label: string;
  help?: string;
  strict?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          {label}
        </span>
        {help ? <FieldHelp label={label} help={help} /> : null}
        {strict ? (
          <span
            className="rounded-full bg-info-softer px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-sops text-info-fg"
            title="Enum-locked: values come from a server-enforced list."
          >
            enum
          </span>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function FieldHelp({
  label,
  help,
}: {
  label: string;
  help: string;
}): JSX.Element {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Help: ${label}`}
          className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-border/60 text-[9px] font-semibold leading-none text-fg-faint transition-colors hover:border-accent/60 hover:text-accent"
        >
          ?
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-xs rounded-md border border-border/70 bg-bg-raised p-2 text-xs leading-relaxed text-fg-muted shadow-pop animate-fade-in-up"
        >
          <span className="block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            {label}
          </span>
          <span className="mt-1 block text-fg">{help}</span>
          <Popover.Arrow className="fill-bg-raised" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}): JSX.Element {
  return (
    <th
      className={cn(
        "px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ item_id: string }>;
}

function AdminProduct360PageInner({ params }: PageProps): JSX.Element {
  const { item_id } = use(params);
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();

  // --- Data -----------------------------------------------------------------

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "items", "all-for-product-360"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });
  const item = useMemo(
    () => (itemsQuery.data?.rows ?? []).find((i) => i.item_id === item_id) ?? null,
    [itemsQuery.data, item_id],
  );

  // Derive dropdown option sets from the same items list (soft dropdowns).
  const fieldOptions = useItemFieldOptions(itemsQuery.data?.rows);

  const readinessQuery = useQuery<ReadinessPayload>({
    queryKey: ["admin", "items", item_id, "readiness"],
    queryFn: () =>
      fetchJson(`/api/items/${encodeURIComponent(item_id)}/readiness`),
    enabled: !!item,
  });

  const skuMapQuery = useQuery<ListEnvelope<IntegrationSkuMapRow>>({
    queryKey: ["admin", "integration-sku-map", "all-for-item", item_id],
    queryFn: () => fetchJson("/api/integration-sku-map?limit=1000"),
  });
  const itemAliases = useMemo(
    () => (skuMapQuery.data?.rows ?? []).filter((r) => r.item_id === item_id),
    [skuMapQuery.data, item_id],
  );

  const bomHeadsQuery = useQuery<ListEnvelope<BomHeadRow>>({
    queryKey: ["admin", "bom_head", "all-for-product-360"],
    queryFn: () => fetchJson("/api/boms/heads?limit=1000"),
    enabled: item?.supply_method !== "BOUGHT_FINISHED",
  });
  const itemBomHead = useMemo(() => {
    if (!item || item.supply_method === "BOUGHT_FINISHED") return null;
    return (
      (bomHeadsQuery.data?.rows ?? []).find(
        (h) => h.parent_ref_id === item_id,
      ) ?? null
    );
  }, [bomHeadsQuery.data, item, item_id]);

  const bomVersionsQuery = useQuery<ListEnvelope<BomVersionRow>>({
    queryKey: ["admin", "bom_version", "by-head", itemBomHead?.bom_head_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(
          itemBomHead!.bom_head_id,
        )}&limit=1000`,
      ),
    enabled: !!itemBomHead,
  });

  const activeVersionId = itemBomHead?.active_version_id ?? null;

  const bomLinesQuery = useQuery<ListEnvelope<BomLineRow>>({
    queryKey: ["admin", "bom_lines", "by-version", activeVersionId],
    queryFn: () =>
      fetchJson(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(
          activeVersionId!,
        )}&limit=1000`,
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
  const suppliersById = useMemo(() => {
    const m = new Map<string, SupplierRow>();
    for (const s of suppliersQuery.data?.rows ?? []) {
      m.set(s.supplier_id, s);
    }
    return m;
  }, [suppliersQuery.data]);
  const supplierNameOf = useMemo(
    () =>
      (id: string | null | undefined): string => {
        if (!id) return "—";
        const s = suppliersById.get(id);
        return s?.supplier_name_short || s?.supplier_name_official || id;
      },
    [suppliersById],
  );

  const bomComponentIds = useMemo(
    () =>
      Array.from(
        new Set(
          (bomLinesQuery.data?.rows ?? []).map((l) => l.final_component_id),
        ),
      ),
    [bomLinesQuery.data],
  );

  const planningPolicyQuery = useQuery<ListEnvelope<PlanningPolicyRow>>({
    queryKey: ["admin", "planning-policy"],
    queryFn: () => fetchJson("/api/planning-policy?limit=1000"),
  });

  // --- Mutations ------------------------------------------------------------

  const fieldMutation = useMutation({
    mutationFn: async (args: {
      field: string;
      value: unknown;
      updated_at: string;
    }) =>
      patchEntity({
        url: `/api/items/${encodeURIComponent(item_id)}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "items"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "items", item_id, "readiness"],
      });
    },
  });

  // saveField: typed helper that returns Promise<void> — required by both
  // InlineEditCell.onSave and InlineEditSelectCell.onSave.
  const saveField =
    (field: string) =>
    async (val: unknown): Promise<void> => {
      if (!item) return;
      await fieldMutation.mutateAsync({
        field,
        value: val,
        updated_at: item.updated_at,
      });
    };

  const statusMutation = useMutation({
    mutationFn: async (args: { newStatus: string; updated_at: string }) =>
      postStatus({
        url: `/api/items/${encodeURIComponent(item_id)}/status`,
        status: args.newStatus,
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "items"] });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "items", item_id, "readiness"],
      });
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
          body: JSON.stringify({ idempotency_key: crypto.randomUUID() }),
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
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "integration-sku-map"],
      });
    },
  });

  // --- Render guards --------------------------------------------------------

  if (itemsQuery.isLoading) {
    return (
      <div className="space-y-3 p-5" aria-busy="true" aria-live="polite">
        <div className="h-9 w-1/3 animate-pulse rounded bg-bg-subtle" />
        <div className="h-5 w-2/3 animate-pulse rounded bg-bg-subtle" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded bg-bg-subtle" />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded bg-bg-subtle" />
      </div>
    );
  }
  if (itemsQuery.isError) {
    return (
      <div className="p-5">
        <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
          <div className="font-semibold">Could not load product</div>
          <div className="mt-1 text-xs">
            {(itemsQuery.error as Error).message}
          </div>
          <button
            type="button"
            onClick={() => void itemsQuery.refetch()}
            className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!item) {
    notFound();
  }

  // --- Completeness checklist -----------------------------------------------

  const detailPath = `/admin/products/${encodeURIComponent(item_id)}`;
  const isBoughtFinished = item.supply_method === "BOUGHT_FINISHED";
  const isManufactured =
    item.supply_method === "MANUFACTURED" || item.supply_method === "REPACK";
  const hasActiveBom = !!(item.primary_bom_head_id || item.base_bom_head_id);

  const completenessItems: CompletenessItem[] = [
    {
      label: "Name set",
      status: item.item_name ? "ok" : "error",
      detail: item.item_name
        ? undefined
        : "Operators see the SKU, not a name.",
      href: `${detailPath}?tab=overview`,
    },
    {
      label: "Family",
      status: item.family ? "ok" : "warn",
      detail:
        item.family ?? "Not categorised — planning groupings treat it as Other.",
      href: `${detailPath}?tab=overview`,
    },
    {
      label: "Sales unit",
      status: item.sales_uom ? "ok" : "warn",
      detail:
        item.sales_uom ?? "No sales unit — production output rejects on submit.",
      href: `${detailPath}?tab=overview`,
    },
    ...(isManufactured
      ? [
          {
            label: "Active recipe (BOM)",
            status: (hasActiveBom ? "ok" : "error") as CompletenessItem["status"],
            detail: hasActiveBom
              ? "Linked — production can derive consumption."
              : "No BOM linked — item cannot be planned or produced.",
            href: `${detailPath}?tab=bom`,
          },
        ]
      : []),
    ...(isBoughtFinished
      ? [
          {
            label: "Primary supplier",
            status: "warn" as CompletenessItem["status"],
            detail: "Check Suppliers tab for coverage.",
            href: `${detailPath}?tab=suppliers`,
          },
        ]
      : []),
  ];

  // --- KPI strip ------------------------------------------------------------

  const lastUpdate = (() => {
    try {
      const d = new Date(item.updated_at);
      const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
      if (days <= 0) return "today";
      if (days === 1) return "yesterday";
      return `${days}d ago`;
    } catch {
      return "—";
    }
  })();

  const kpis: KpiStat[] = [
    {
      label: "Aliases",
      value: skuMapQuery.isLoading ? "…" : itemAliases.length,
      hint:
        itemAliases.length === 0
          ? "No channel mappings"
          : `${itemAliases.filter((a) => a.approval_status === "approved").length} approved`,
      href: `${detailPath}?tab=aliases`,
      tone:
        itemAliases.length === 0
          ? "muted"
          : itemAliases.some((a) => a.approval_status === "pending")
            ? "warning"
            : "success",
    },
    {
      label: isManufactured ? "BOM" : "Supplier link",
      value: isManufactured
        ? hasActiveBom
          ? "Linked"
          : "—"
        : "Check tab",
      hint: isManufactured
        ? hasActiveBom
          ? item.primary_bom_head_id ?? undefined
          : "No BOM linked"
        : "See Suppliers tab",
      href: isManufactured
        ? `${detailPath}?tab=bom`
        : `${detailPath}?tab=suppliers`,
      tone: isManufactured
        ? hasActiveBom
          ? "success"
          : "warning"
        : "muted",
    },
    {
      label: "Last update",
      value: lastUpdate,
      hint: fmtDateTime(item.updated_at),
      tone: "muted",
    },
  ];

  // --- Tab descriptors ------------------------------------------------------

  const overviewTab: TabDescriptor = {
    key: "overview",
    label: "Overview",
    content: (() => {
      const saveF = saveField;
      return (
        <div className="space-y-4 p-1">
          {/* Identity & category */}
          <SectionCard
            eyebrow="Section 1 of 2"
            title="Identity & category"
            description="What this product is called and how it is classified. Click any field to edit."
            density="compact"
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              <EditableField
                label="Name"
                help="What operators see in pickers and forms. Hebrew is fine — picker labels render with auto-direction."
              >
                {isAdmin ? (
                  <InlineEditCell
                    value={item.item_name}
                    onSave={saveF("item_name")}
                    ariaLabel="Edit item name"
                  />
                ) : (
                  <span className="font-medium text-fg-strong" dir="auto">
                    {item.item_name}
                  </span>
                )}
              </EditableField>

              <EditableField
                label="Family"
                help="High-level operational family (e.g. MATCHA, COCKTAIL). Drives planning groupings and dashboard rollups."
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    fieldLabel="Family"
                    value={item.family}
                    options={fieldOptions.family}
                    placeholder="— Choose family —"
                    allowAdHoc
                    onSave={saveF("family")}
                  />
                ) : (
                  <span className="text-fg" dir="auto">
                    {item.family ?? "—"}
                  </span>
                )}
              </EditableField>

              <EditableField
                label="Product group"
                help="Sub-grouping inside the family — used by purchase recommendations and forecast cohorts."
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    fieldLabel="Product group"
                    value={item.product_group}
                    options={fieldOptions.product_group}
                    placeholder="— Choose product group —"
                    allowAdHoc
                    onSave={saveF("product_group")}
                  />
                ) : (
                  <span className="text-fg" dir="auto">
                    {item.product_group ?? "—"}
                  </span>
                )}
              </EditableField>

              <EditableField
                label="Item type"
                help="Free-form tag layered on top of family / supply_method (e.g. KIT, SINGLE, GIFT). Optional."
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    fieldLabel="Item type"
                    value={item.item_type}
                    options={fieldOptions.item_type}
                    placeholder="— Choose item type —"
                    allowAdHoc
                    onSave={saveF("item_type")}
                  />
                ) : (
                  <span className="text-fg" dir="auto">
                    {item.item_type ?? "—"}
                  </span>
                )}
              </EditableField>
            </div>
          </SectionCard>

          {/* Packaging & units */}
          <SectionCard
            eyebrow="Section 2 of 2"
            title="Packaging & units"
            description="How the product is packaged and counted. Sales unit is shared with production output, GR, and the Shopify sync."
            density="compact"
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-3">
              <EditableField
                label="Pack size"
                help="Volume / mass per pack (e.g. 250ML, 100G). Stored as text — pick from the existing set."
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    fieldLabel="Pack size"
                    value={item.pack_size}
                    options={fieldOptions.pack_size}
                    placeholder="— Choose pack size —"
                    allowAdHoc
                    onSave={saveF("pack_size")}
                  />
                ) : (
                  <span className="text-fg">{item.pack_size ?? "—"}</span>
                )}
              </EditableField>

              <EditableField
                label="Sales unit"
                help="Strict enum (UOM table). Production Output rejects on submit if its UoM does not match."
                strict
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    fieldLabel="Sales unit"
                    value={item.sales_uom}
                    options={fieldOptions.sales_uom}
                    placeholder="— Choose sales unit —"
                    onSave={saveF("sales_uom")}
                  />
                ) : (
                  <span className="text-fg">{item.sales_uom ?? "—"}</span>
                )}
              </EditableField>

              <EditableField
                label="Case pack"
                help="Units per shipping case. Used by purchase recommendations and LionWheel route planning."
              >
                {isAdmin ? (
                  <InlineEditCell
                    value={item.case_pack !== null ? String(item.case_pack) : ""}
                    type="number"
                    inputMode="numeric"
                    onSave={async (val) => {
                      await fieldMutation.mutateAsync({
                        field: "case_pack",
                        value: val ? Number(val) : null,
                        updated_at: item.updated_at,
                      });
                    }}
                    ariaLabel="Edit case pack"
                  />
                ) : (
                  <span className="text-fg">{item.case_pack ?? "—"}</span>
                )}
              </EditableField>
            </div>
          </SectionCard>

          {/* Technical details collapsible */}
          <details className="group rounded-md border border-border/50 bg-bg-subtle/40 open:bg-bg-subtle/60 transition-colors">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-fg-muted group-open:border-b group-open:border-border/50">
              <span>Technical details — system fields</span>
              <span className="text-3xs font-normal text-fg-faint">
                read-only · changing these requires a migration or workflow
              </span>
            </summary>
            <div className="px-3 py-3">
              <p className="mb-2 text-xs text-fg-subtle">
                Supply method and BOM links are locked once referenced. To
                change a supply method, archive existing BOM references first.
              </p>
              <dl className="divide-y divide-border/40 rounded-md border border-border/50">
                {(
                  [
                    ["Item ID", item.item_id, true],
                    ["Supply method", fmtSupplyMethod(item.supply_method), false],
                    ["Site", item.site_id, true],
                    ["Created", fmtDateTime(item.created_at), false],
                    ["Last updated", fmtDateTime(item.updated_at), false],
                  ] as [string, string, boolean][]
                ).map(([label, value, mono]) => (
                  <div
                    key={label}
                    className="grid grid-cols-1 gap-1 px-3 py-2 text-xs sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center"
                  >
                    <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      {label}
                    </dt>
                    <dd
                      className={
                        mono ? "font-mono text-xs text-fg" : "text-xs text-fg"
                      }
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>

          {/* Iter 13/16 — accessible mutation feedback */}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="min-h-[1.25rem]"
          >
            {fieldMutation.isPending ? (
              <p className="text-xs text-fg-muted">Saving…</p>
            ) : fieldMutation.isError ? (
              <p className="text-xs text-danger-fg">
                {fieldMutation.error instanceof AdminMutationError
                  ? fieldMutation.error.message
                  : "Save failed. Please try again."}
              </p>
            ) : null}
          </div>
        </div>
      );
    })(),
  };

  const aliasesTab: TabDescriptor = {
    key: "aliases",
    label: "Aliases",
    badge:
      itemAliases.length > 0 ? `${itemAliases.length}` : undefined,
    badgeTone: itemAliases.some((a) => a.approval_status === "pending")
      ? "warning"
      : itemAliases.length > 0
        ? "success"
        : "neutral",
    content: (() => {
      if (skuMapQuery.isLoading) return <DetailTabLoading />;
      if (skuMapQuery.isError)
        return (
          <DetailTabError message={(skuMapQuery.error as Error).message} />
        );
      return (
        <SectionCard
          eyebrow="Aliases"
          title={
            itemAliases.length === 0
              ? "No alias mappings"
              : `${itemAliases.length} alias mapping${itemAliases.length === 1 ? "" : "s"}`
          }
          actions={
            <Link
              href={`/admin/sku-aliases?item_id=${encodeURIComponent(item_id)}`}
              className="inline-flex items-center gap-1 rounded border border-border/60 bg-bg-subtle/40 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/60 hover:text-accent"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} />
              Add alias
            </Link>
          }
          contentClassName="p-0"
        >
          {itemAliases.length === 0 ? (
            <div className="flex flex-col gap-3 px-4 py-6">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full bg-fg-faint/50"
                />
                <span className="text-sm font-medium text-fg-muted">
                  No alias mappings for this product
                </span>
              </div>
              <p className="text-xs text-fg-subtle">
                LionWheel, Shopify, and Green Invoice SKUs matched to this item
                will appear here. Aliases are created when the integration
                auto-matches a SKU or when an admin adds one manually.
              </p>
              <Link
                href={`/admin/sku-aliases?item_id=${encodeURIComponent(item_id)}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                Add alias →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-bg-subtle/60">
                    <Th>Channel</Th>
                    <Th>External SKU</Th>
                    <Th>Approval</Th>
                    <Th>Notes</Th>
                    {isAdmin ? <Th align="right">Actions</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {itemAliases.map((a) => (
                    <tr
                      key={a.alias_id}
                      className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                    >
                      <td className="px-3 py-2">
                        <ChannelBadge channel={a.source_channel} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-fg">
                        {a.external_sku}
                      </td>
                      <td className="px-3 py-2">
                        <ApprovalBadge status={a.approval_status} />
                      </td>
                      <td className="px-3 py-2 text-xs text-fg-muted">
                        {a.notes ?? "—"}
                      </td>
                      {isAdmin ? (
                        <td className="px-3 py-2 text-right">
                          {a.approval_status === "pending" ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-danger-fg hover:underline"
                              onClick={() => {
                                if (!window.confirm("Reject this alias?"))
                                  return;
                                aliasActionMutation.mutate({
                                  alias_id: a.alias_id,
                                  verb: "reject",
                                });
                              }}
                            >
                              Reject
                            </button>
                          ) : a.approval_status === "approved" ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-fg-muted hover:text-danger-fg hover:underline"
                              onClick={() => {
                                if (!window.confirm("Revoke this alias?"))
                                  return;
                                aliasActionMutation.mutate({
                                  alias_id: a.alias_id,
                                  verb: "revoke",
                                });
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
    })(),
  };

  const bomTab: TabDescriptor = {
    key: "bom",
    label: "BOM",
    badge:
      item.supply_method !== "BOUGHT_FINISHED" && !hasActiveBom
        ? "!"
        : undefined,
    badgeTone:
      item.supply_method !== "BOUGHT_FINISHED" && !hasActiveBom
        ? "danger"
        : "neutral",
    content: (() => {
      if (item.supply_method === "BOUGHT_FINISHED") {
        return (
          <DetailTabEmpty message="BOUGHT_FINISHED items are resold as-is and have no BOM." />
        );
      }
      if (!hasActiveBom) {
        return (
          <SectionCard tone="warning" density="compact">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 max-w-xl">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone="warning" dotted>
                    Setup blocker
                  </Badge>
                  <span className="text-3xs uppercase tracking-sops text-fg-subtle">
                    {fmtSupplyMethod(item.supply_method)}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-fg-strong">
                  No recipe linked to this product
                </h3>
                <p className="mt-1 text-sm text-fg-muted">
                  {item.supply_method === "MANUFACTURED"
                    ? "Manufactured products need an active BOM before they can be planned, produced, or appear on the daily production plan."
                    : "Repack products need an active BOM that defines the input component(s) so production can deduct stock correctly."}
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-fg-subtle">
                  <li>· Planning will skip this item until a BOM is linked.</li>
                  <li>
                    · Production Output rejects on submit (UNRESOLVED_BOM).
                  </li>
                  <li>· Purchase recommendations cannot net it.</li>
                </ul>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href="/admin/boms"
                  className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
                >
                  Open BOM editor
                </Link>
              </div>
            </div>
          </SectionCard>
        );
      }
      if (bomHeadsQuery.isLoading || bomVersionsQuery.isLoading) {
        return <DetailTabLoading />;
      }
      if (bomHeadsQuery.isError) {
        return (
          <DetailTabError message={(bomHeadsQuery.error as Error).message} />
        );
      }
      const head = itemBomHead;
      const versions = bomVersionsQuery.data?.rows ?? [];
      const activeVersion = versions.find(
        (v) => v.bom_version_id === head?.active_version_id,
      );
      return (
        <div className="space-y-4">
          {head ? (
            <SectionCard
              eyebrow="BOM head"
              title={head.bom_head_id}
              density="compact"
            >
              <dl className="divide-y divide-border/40">
                {(
                  [
                    ["Type", head.bom_kind],
                    ["Family", head.display_family ?? "—"],
                    [
                      "Output",
                      `${head.final_bom_output_qty} ${head.final_bom_output_uom ?? ""}`.trim(),
                    ],
                    ["Status", head.status],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="grid grid-cols-1 gap-1 px-4 py-2 text-xs sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center"
                  >
                    <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                      {label}
                    </dt>
                    <dd className="text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            </SectionCard>
          ) : null}

          <SectionCard
            eyebrow="BOM versions"
            title={`${versions.length} version${versions.length === 1 ? "" : "s"}`}
            actions={
              head?.active_version_id ? (
                <Link
                  href={`/admin/boms/${encodeURIComponent(
                    head.bom_head_id,
                  )}/versions/${encodeURIComponent(head.active_version_id)}`}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Open BOM editor →
                </Link>
              ) : head ? (
                <Link
                  href={`/admin/boms/${encodeURIComponent(head.bom_head_id)}`}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Open BOM head →
                </Link>
              ) : null
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
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr
                        key={v.bom_version_id}
                        className={cn(
                          "border-b border-border/40 last:border-b-0",
                          v.bom_version_id === head?.active_version_id
                            ? "bg-success-softer/20 hover:bg-success-softer/40"
                            : "hover:bg-bg-subtle/40",
                        )}
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
                          {fmtDateTime(v.created_at)}
                        </td>
                        <td className="px-3 py-2 text-xs text-fg-muted">
                          {v.activated_at
                            ? fmtDateTime(v.activated_at)
                            : "—"}
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
                        · activated{" "}
                        {new Date(activeVersion.activated_at).toLocaleDateString(
                          undefined,
                          { month: "short", day: "2-digit", year: "numeric" },
                        )}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </SectionCard>
        </div>
      );
    })(),
  };

  const componentsTab: TabDescriptor = {
    key: "components",
    label: "Components",
    badge:
      item.supply_method !== "BOUGHT_FINISHED" && activeVersionId
        ? bomLinesQuery.data
          ? `${bomLinesQuery.data.rows.length}`
          : undefined
        : undefined,
    badgeTone:
      item.supply_method !== "BOUGHT_FINISHED" &&
      activeVersionId &&
      bomLinesQuery.data?.rows.length === 0
        ? "warning"
        : "neutral",
    content: (() => {
      if (item.supply_method === "BOUGHT_FINISHED") {
        return (
          <DetailTabEmpty message="Purchased finished items have no BOM-expanded components." />
        );
      }
      if (!activeVersionId) {
        return (
          <SectionCard tone="warning" density="compact">
            <div className="flex items-start gap-3">
              <Badge tone="warning" dotted>
                No active version
              </Badge>
              <p className="text-sm text-warning-fg">
                No active BOM version — components list is empty. Publish a
                version in the BOM editor.
              </p>
            </div>
          </SectionCard>
        );
      }
      if (bomLinesQuery.isLoading) return <DetailTabLoading />;
      if (bomLinesQuery.isError) {
        return (
          <DetailTabError message={(bomLinesQuery.error as Error).message} />
        );
      }
      const lines = bomLinesQuery.data?.rows ?? [];
      if (lines.length === 0) {
        return (
          <SectionCard tone="warning" density="compact">
            <p className="text-sm text-warning-fg">
              Active BOM version has zero lines.
            </p>
          </SectionCard>
        );
      }
      return (
        <SectionCard
          eyebrow="Components"
          title={`${lines.length} component${lines.length === 1 ? "" : "s"} in active BOM`}
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
                          href={`/admin/components/${encodeURIComponent(
                            l.final_component_id,
                          )}`}
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
                        <ComponentReadinessCell
                          component_id={l.final_component_id}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      );
    })(),
  };

  const suppliersTab: TabDescriptor = {
    key: "suppliers",
    label: "Suppliers",
    badgeTone: isBoughtFinished ? "neutral" : "neutral",
    content: (() => {
      if (isBoughtFinished) {
        return (
          <SectionCard
            eyebrow="Supplier coverage — BOUGHT_FINISHED"
            title="Direct item-level supplier"
            description="Purchased finished items map directly to supplier_items via supplier_items.item_id. Manage the catalog for this item in the Supplier Items admin."
            density="compact"
          >
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/supplier-items?item_id=${encodeURIComponent(item_id)}`}
                className="inline-flex items-center gap-1 rounded border border-border/60 bg-bg-subtle/40 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/60 hover:text-accent"
              >
                View supplier items →
              </Link>
            </div>
          </SectionCard>
        );
      }
      if (!activeVersionId) {
        return (
          <SectionCard tone="warning" density="compact">
            <p className="text-sm text-warning-fg">
              No active BOM version — supplier coverage cannot be computed.
            </p>
          </SectionCard>
        );
      }
      if (bomComponentIds.length === 0) {
        return (
          <SectionCard tone="warning" density="compact">
            <p className="text-sm text-warning-fg">
              Active BOM has no components — no supplier coverage to show.
            </p>
          </SectionCard>
        );
      }
      return (
        <div className="space-y-3">
          {/* Iter 15 — supply-method-aware informational card */}
          <SectionCard
            eyebrow="Component-level suppliers"
            title={
              item.supply_method === "MANUFACTURED"
                ? "Supplier coverage is per ingredient"
                : "Supplier coverage is per input component"
            }
            description={
              item.supply_method === "MANUFACTURED"
                ? "Manufactured products source their ingredients through component supplier links. Each row below resolves the primary supplier for that ingredient."
                : "Repack products use an input component as their main supply. Each row below resolves the primary supplier for the input component."
            }
            density="compact"
          >
            {item.primary_bom_head_id ? (
              <div className="mb-3 rounded-md border border-info/30 bg-info-softer px-3 py-2 text-xs text-fg-muted">
                Pack BOM{" "}
                <Link
                  href={`/admin/boms/${encodeURIComponent(item.primary_bom_head_id)}`}
                  className="font-mono text-accent hover:underline"
                >
                  {item.primary_bom_head_id}
                </Link>{" "}
                is linked — supplier coverage derived from active BOM lines.
              </div>
            ) : (
              <div className="mb-3 rounded-md border border-warning/30 bg-warning-softer px-3 py-2 text-xs text-warning-fg">
                No BOM linked yet — supplier coverage cannot be determined
                until a BOM is assigned.
              </div>
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Coverage"
            title={`${bomComponentIds.length} component${bomComponentIds.length === 1 ? "" : "s"}`}
            contentClassName="p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-bg-subtle/60">
                    <Th>Component</Th>
                    <Th>Primary supplier</Th>
                    <Th>Lead time</Th>
                    <Th align="right">MOQ</Th>
                    <Th>Coverage</Th>
                  </tr>
                </thead>
                <tbody>
                  {bomComponentIds.map((cid) => (
                    <SupplierCoverageRow
                      key={cid}
                      component_id={cid}
                      components={componentsQuery.data?.rows ?? []}
                      suppliers={suppliersQuery.data?.rows ?? []}
                      supplierNameOf={supplierNameOf}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      );
    })(),
  };

  const planningTab: TabDescriptor = {
    key: "planning",
    label: "Planning",
    content: (() => {
      return (
        <div className="space-y-3">
          {/* Iter 11 — "Per-item overrides" info card */}
          <SectionCard
            eyebrow="Per-item overrides"
            title="Planning policy"
            description="Planning policy controls when purchase recommendations fire, how much safety stock to hold, and how demand uncertainty is handled."
            density="compact"
          >
            <div className="space-y-3">
              <div className="rounded-md border border-info/30 bg-info-softer px-3 py-2.5 text-xs text-fg-muted">
                <span className="font-semibold text-info-fg">
                  Per-item policy overrides are not yet available (Gate 5).
                </span>{" "}
                Global planning defaults apply. When per-item overrides land,
                this tab will show an editable form pinned to this product.
              </div>
              <Link
                href="/admin/planning/policy"
                className="inline-flex items-center gap-1 rounded border border-border/60 bg-bg-subtle/40 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/60 hover:text-accent"
              >
                View global planning defaults →
              </Link>
            </div>
          </SectionCard>

          {/* Policy reference table */}
          <SectionCard
            eyebrow="Policy fields reference"
            title="What each field controls"
            density="compact"
          >
            <dl className="space-y-2.5 text-xs">
              {(
                [
                  [
                    "Reorder point",
                    "When projected stock falls below this, a purchase recommendation fires. Measured in sales units.",
                  ],
                  [
                    "Safety stock",
                    "Minimum buffer held against demand uncertainty. Prevents recommendations cutting right to zero.",
                  ],
                  [
                    "MOQ override",
                    "Per-item minimum order quantity that overrides the supplier default.",
                  ],
                  [
                    "Planning horizon",
                    "Days forward the engine looks when computing need. Longer = more conservative stock building.",
                  ],
                  [
                    "Uncertainty band",
                    "Demand confidence interval. Wider band → more safety stock → fewer stock-outs at higher inventory cost.",
                  ],
                ] as [string, string][]
              ).map(([term, def]) => (
                <div key={term} className="flex items-start gap-2">
                  <dt className="w-36 shrink-0 font-semibold text-fg">
                    {term}
                  </dt>
                  <dd className="text-fg-muted">{def}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>

          {/* Site-wide policy viewer */}
          {planningPolicyQuery.isLoading ? (
            <DetailTabLoading />
          ) : planningPolicyQuery.isError ? (
            <DetailTabError
              message={(planningPolicyQuery.error as Error).message}
            />
          ) : (planningPolicyQuery.data?.rows ?? []).length > 0 ? (
            <SectionCard
              eyebrow="Site-wide policy"
              title={`${planningPolicyQuery.data!.rows.length} active keys`}
              density="compact"
              contentClassName="p-0"
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/70 bg-bg-subtle/60">
                      <Th>Key</Th>
                      <Th>Value</Th>
                      <Th>UoM</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {planningPolicyQuery.data!.rows.map((r) => (
                      <tr
                        key={r.key}
                        className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-fg">
                          {r.key}
                        </td>
                        <td className="px-3 py-2 font-mono text-fg-strong">
                          {r.value}
                        </td>
                        <td className="px-3 py-2 text-fg-muted">
                          {r.uom ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ) : null}
        </div>
      );
    })(),
  };

  const historyTab: TabDescriptor = {
    key: "history",
    label: "History",
    content: (
      <div className="space-y-3">
        {/* Iter 12 — Rich informational card */}
        <SectionCard
          eyebrow="Audit trail"
          title="Change history"
          description="Every admin mutation on this item is audited and stored server-side."
          density="compact"
        >
          <div className="space-y-3">
            <div className="rounded-md border border-info/30 bg-info-softer px-3 py-2.5 text-xs text-fg-muted">
              <span className="font-semibold text-info-fg">
                The history view will appear here once the audit-trail endpoint
                is live (Gate 3 activity surface).
              </span>{" "}
              Until then, the record of changes is stored and will back-fill
              this timeline when the endpoint ships.
            </div>
            <p className="text-xs text-fg-subtle">
              Audited events include: field edits (name, family, pack size,
              sales unit, case pack, product group, item type), status changes
              (ACTIVE → INACTIVE), and BOM link changes.
            </p>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="What gets tracked"
          title="Audit coverage"
          density="compact"
        >
          <ul className="space-y-2 text-xs text-fg-muted">
            {([
              "All inline field edits: who changed what, when, and from what value.",
              "Status transitions: ACTIVE, PENDING, INACTIVE with actor and timestamp.",
              "BOM link changes: which BOM version became active and who approved it.",
              "Alias actions: approval, rejection, revocation with actor.",
            ] as string[]).map((text, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    ),
  };

  const tabs: TabDescriptor[] = [
    overviewTab,
    aliasesTab,
    bomTab,
    componentsTab,
    suppliersTab,
    planningTab,
    historyTab,
  ];

  // --- Render ---------------------------------------------------------------

  return (
    <>
      {/* Iter 4/18 — MasterSummaryCard hero wrapped in reveal-on-mount */}
      <div className="reveal-on-mount mb-4">
        <MasterSummaryCard
          name={item.item_name}
          code={item.item_id}
          entityType={fmtSupplyMethod(item.supply_method)}
          status={item.status}
          completeness={completenessItems}
          kpis={kpis}
          subtitle={
            item.family || item.product_group ? (
              <span>
                {[item.family, item.product_group]
                  .filter((v): v is string => Boolean(v))
                  .join(" · ")}
              </span>
            ) : undefined
          }
          actions={
            isAdmin ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={statusMutation.isPending}
                onClick={() => {
                  const next =
                    item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                  if (!window.confirm(`Set status to ${next}?`)) return;
                  statusMutation.mutate({
                    newStatus: next,
                    updated_at: item.updated_at,
                  });
                }}
              >
                {item.status === "ACTIVE" ? "Archive" : "Restore"}
              </button>
            ) : undefined
          }
        />
      </div>

      {/* Iter 6 — DetailPage supplies the polished TabStrip + tabpanel with
          key={active.key} animation. Readiness from /api/items/[id]/readiness
          surfaced via the overview tab header. */}
      <DetailPage
        header={{
          eyebrow: "Admin · Products",
          title: item.item_name,
          description: `Product 360 — ${item.item_id}`,
          meta: (
            <>
              <ItemStatusBadge status={item.status} />
              <Badge tone="neutral" dotted>
                {fmtSupplyMethod(item.supply_method)}
              </Badge>
              <ReadinessPill readiness={readinessQuery.data ?? null} />
            </>
          ),
          actions: (
            <Link href="/admin/items" className="btn btn-ghost btn-sm">
              Back to items
            </Link>
          ),
        }}
        tabs={tabs}
      />
    </>
  );
}

export default function AdminProduct360Page({
  params,
}: PageProps): JSX.Element {
  return (
    <Suspense
      fallback={<div className="p-4 text-xs text-fg-muted">Loading…</div>}
    >
      <AdminProduct360PageInner params={params} />
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// ComponentReadinessCell
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SupplierCoverageRow
// ---------------------------------------------------------------------------

function SupplierCoverageRow({
  component_id,
  components,
  suppliers,
  supplierNameOf,
}: {
  component_id: string;
  components: ComponentRow[];
  suppliers: SupplierRow[];
  supplierNameOf: (id: string | null | undefined) => string;
}): JSX.Element {
  const supplierItemsQuery = useQuery<ListEnvelope<SupplierItemRow>>({
    queryKey: ["admin", "supplier-items", "by-component", component_id],
    queryFn: () =>
      fetchJson(
        `/api/supplier-items?component_id=${encodeURIComponent(
          component_id,
        )}&limit=1000`,
      ),
  });

  const component = components.find((c) => c.component_id === component_id);
  const rows = supplierItemsQuery.data?.rows ?? [];
  const primary = rows.find(
    (r) => r.is_primary && r.approval_status === "approved",
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
          <div>
            <Link
              href={`/admin/suppliers/${encodeURIComponent(primary.supplier_id)}`}
              className="font-medium text-fg hover:text-accent"
              title={primary.supplier_id}
            >
              {supplierNameOf(primary.supplier_id)}
            </Link>
          </div>
        ) : rows.length > 0 ? (
          <Badge tone="warning" dotted>
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            No primary
          </Badge>
        ) : (
          <Badge tone="danger" dotted>
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            No suppliers
          </Badge>
        )}
      </td>
      <td className="px-3 py-2">
        {primary ? <LeadTimeChip days={primary.lead_time_days} /> : <span className="text-fg-faint text-xs">—</span>}
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
