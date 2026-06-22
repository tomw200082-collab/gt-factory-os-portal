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

import { use, useState, useMemo, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { fmtSupplyMethod } from "@/lib/display";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  DetailPage,
  DetailFieldGrid,
  DetailTabEmpty,
  DetailTabError,
  DetailTabLoading,
  type LinkageGroup,
  type TabDescriptor,
  type FieldRow,
} from "@/components/patterns/DetailPage";
import { Badge } from "@/components/badges/StatusBadge";
import { SectionCard } from "@/components/workflow/SectionCard";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { InlineEditSelectCell } from "@/components/tables/InlineEditSelectCell";
import { useItemFieldOptions } from "@/lib/admin/item-field-options";
import { MasterSummaryCard, type CompletenessItem } from "@/components/admin/MasterSummaryCard";
import { AssignPrimarySupplierDrawer } from "@/components/admin/AssignPrimarySupplierDrawer";
import { RecipeHealthCard } from "@/components/admin/recipe-health/RecipeHealthCard";
import { VersionHistorySection } from "@/components/admin/recipe-health/VersionHistorySection";
import { ClassWEditDrawer } from "@/components/admin/ClassWEditDrawer";
import type { EntityOption } from "@/components/fields/EntityPickerPlus";
import { AdminMutationError, patchEntity, postStatus } from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";
import { BomDraftEditorPage } from "@/components/bom-edit/BomDraftEditorPage";
import { fmtNumStr } from "@/lib/utils/format-quantity";

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
  updated_at: string;
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

// Iter 9 — Lead time visual chip: green ≤7d, amber ≤14d, red >14d.
// Tranche 049 (VISUAL-011): renders via the canonical <Badge> primitive.
function LeadTimeChip({ days }: { days: number | null }): JSX.Element {
  if (days === null)
    return <span className="font-mono text-xs text-fg-faint">—</span>;
  const tone = days <= 7 ? "success" : days <= 14 ? "warning" : "danger";
  return (
    <Badge
      tone={tone}
      size="xs"
      className="font-mono"
      tooltip={`Lead time: ${days} days`}
    >
      {days}d
    </Badge>
  );
}

// Approval status with contextual tone: approved=green, pending=amber, rejected=red.
function ApprovalBadge({ status }: { status: string | null }): JSX.Element {
  if (!status) return <span className="text-fg-faint">—</span>;
  const upper = status.toUpperCase();
  if (upper === "APPROVED") return <Badge tone="success">{status}</Badge>;
  if (upper.includes("PENDING")) return <Badge tone="warning">{status}</Badge>;
  if (upper === "REJECTED") return <Badge tone="danger">{status}</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

// EditableField — label + optional help tooltip + value slot.
// Local helper so the Overview tab can render a consistent column without
// repeating the label / spacing / aria scaffolding for every field. The
// `help` text appears as a small (?) icon next to the label; click to
// reveal a Radix popover so the user gets context without leaving the page.
// `strict` adds a small lock chip indicating this field is enum-locked
// (currently only sales_uom).
function EditableField({
  label,
  help,
  strict,
  emptyHint: _emptyHint,
  children,
}: {
  label: string;
  help?: string;
  strict?: boolean;
  emptyHint?: string;
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

function FieldHelp({ label, help }: { label: string; help: string }): JSX.Element {
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

  // Derive option sets for the controlled dropdown fields from the items list
  // we already loaded above. Free-text fields (family, product_group, item_type,
  // pack_size) become "soft" dropdowns over the union of values currently in
  // use; sales_uom and supply_method use the locked enums in
  // src/lib/contracts/enums.ts. See lib/admin/item-field-options.ts.
  const fieldOptions = useItemFieldOptions(itemQuery.data?.rows);

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
  const [showAssignPrimary, setShowAssignPrimary] = useState(false);
  const [editingBomState, setEditingBomState] = useState<{ headId: string; versionId: string } | null>(null);

  // Suppliers picker options — needed so the assign-primary drawer can show
  // names (not IDs). Loaded for everyone so the rendered dropdown labels are
  // the same name set the rest of the UI uses.
  const supplierOptions: EntityOption[] = useMemo(
    () =>
      (suppliersQuery.data?.rows ?? []).map((s) => ({
        id: s.supplier_id,
        label: s.supplier_name_official,
        sublabel: s.supplier_id,
      })),
    [suppliersQuery.data],
  );

  const itemSupplierItems = itemSupplierItemsQuery.data?.rows ?? [];
  const itemHasPrimarySupplier = itemSupplierItems.some((si) => si.is_primary);
  const isBoughtFinished = row?.supply_method === "BOUGHT_FINISHED";
  const showAssignPrimaryCta = isAdmin && isBoughtFinished && !itemHasPrimarySupplier;

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

  // Setup-completeness checklist. Each row carries an optional href for
  // deep-linking to the relevant tab (so a planner clicking "No BOM linked"
  // lands on the BOM tab instead of hunting through the surface). The "fix"
  // button on the right edge is reserved for one-tap actions that don't need
  // a navigation (e.g. opening the assign-primary-supplier drawer in place).
  const detailPath = `/admin/masters/items/${encodeURIComponent(item_id)}`;
  const completenessItems = useMemo((): CompletenessItem[] => {
    if (!row) return [];
    const isBought = row.supply_method === "BOUGHT_FINISHED";
    const isManufactured = row.supply_method === "MANUFACTURED" || row.supply_method === "REPACK";
    const hasActiveBom = !!(row.primary_bom_head_id || row.base_bom_head_id);
    const primarySi = (itemSupplierItemsQuery.data?.rows ?? []).filter((si) => si.is_primary);
    const items: CompletenessItem[] = [];

    items.push({
      label: "Name set",
      status: row.item_name ? "ok" : "error",
      detail: row.item_name ? undefined : "Operators see the SKU, not a name.",
      href: `${detailPath}?tab=overview`,
    });

    items.push({
      label: "Family",
      status: row.family ? "ok" : "warn",
      detail: row.family ?? "Not categorised — planning groupings will treat it as Other.",
      href: `${detailPath}?tab=overview`,
    });

    items.push({
      label: "Sales unit",
      status: row.sales_uom ? "ok" : "warn",
      detail: row.sales_uom ?? "No sales unit — production output rejects on submit.",
      href: `${detailPath}?tab=overview`,
    });

    if (isManufactured) {
      items.push({
        label: "Active recipe (BOM)",
        status: hasActiveBom ? "ok" : "error",
        detail: hasActiveBom
          ? "Linked — production can derive consumption."
          : "No BOM linked — item cannot be planned or produced.",
        href: `${detailPath}?tab=bom`,
      });
    }

    if (isBought) {
      items.push({
        label: "Primary supplier",
        status: primarySi.length > 0 ? "ok" : "warn",
        detail:
          primarySi.length > 0
            ? supplierNameOf(primarySi[0]!.supplier_id)
            : "No primary supplier set — purchase recommendations will skip this item.",
        href: `${detailPath}?tab=supplier-items`,
        fixAction:
          primarySi.length === 0 && isAdmin ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                // The whole row is also a deep link; intercept so a one-tap
                // assign drawer wins over the navigation.
                e.preventDefault();
                e.stopPropagation();
                setShowAssignPrimary(true);
              }}
            >
              Assign primary supplier
            </button>
          ) : undefined,
      });
    }

    return items;
  }, [row, itemSupplierItemsQuery.data, isAdmin, detailPath, supplierNameOf]);

  // KPI strip — at-a-glance numeric summary of operational health for this
  // product. Each pill deep-links to the tab where the user can drill in.
  const kpis = useMemo(() => {
    if (!row) return [] as { label: string; value: ReactNode; hint?: string; href?: string; tone?: "default" | "success" | "warning" | "danger" | "muted" }[];
    const exceptionsCount = relatedExceptions.length;
    const isBought = row.supply_method === "BOUGHT_FINISHED";
    const supplierCount = itemSupplierItems.length;
    const lastUpdate = (() => {
      try {
        const d = new Date(row.updated_at);
        const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
        if (days <= 0) return "today";
        if (days === 1) return "yesterday";
        return `${days}d ago`;
      } catch {
        return "—";
      }
    })();
    return [
      {
        label: "Open exceptions",
        value: exceptionsCount,
        hint: exceptionsCount === 0 ? "Clean" : "Tap to triage",
        href: `${detailPath}?tab=exceptions`,
        tone: (exceptionsCount === 0 ? "success" : exceptionsCount > 2 ? "danger" : "warning") as "success" | "danger" | "warning",
      },
      ...(isBought
        ? [
            {
              label: "Supplier links",
              value: supplierCount,
              hint:
                supplierCount === 0
                  ? "Add at least one"
                  : `${itemHasPrimarySupplier ? "primary set" : "no primary"}`,
              href: `${detailPath}?tab=supplier-items`,
              tone: (supplierCount === 0
                ? "warning"
                : itemHasPrimarySupplier
                  ? "success"
                  : "warning") as "success" | "warning",
            },
          ]
        : [
            {
              label: "Pack BOM",
              value: row.primary_bom_head_id ? "Linked" : "—",
              hint: row.primary_bom_head_id ?? "No pack BOM linked",
              href: row.primary_bom_head_id
                ? `/admin/masters/boms/${encodeURIComponent(row.primary_bom_head_id)}`
                : `${detailPath}?tab=bom`,
              tone: (row.primary_bom_head_id ? "success" : "warning") as "success" | "warning",
            },
          ]),
      {
        label: "Last update",
        value: lastUpdate,
        hint: fmtDateTime(row.updated_at),
        tone: "muted" as const,
      },
    ];
  }, [row, relatedExceptions, itemSupplierItems, itemHasPrimarySupplier, detailPath]);

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
        return (
          <DetailTabError
            message={(itemQuery.error as Error).message}
            onRetry={() => itemQuery.refetch()}
          />
        );
      }
      if (!row) {
        return (
          <DetailTabEmpty
            message={`Item ${item_id} not found in the items list.`}
            action={
              <Link href="/admin/items" className="btn btn-sm btn-primary">
                Back to Items
              </Link>
            }
          />
        );
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
      const saveField = (field: string) => (val: unknown) =>
        itemFieldMutation.mutateAsync({
          field,
          value: val,
          updated_at: row.updated_at,
        }) as Promise<void>;

      return (
        <div className="space-y-4 p-1">
          {/* --- Identity & category ----------------------------------------
              The fields a planner / admin curates to keep the catalogue
              navigable. Categorized fields use a dropdown so every product
              shares the same vocabulary; the Name is free-text because each
              product has a unique label. */}
          <SectionCard
            eyebrow="Section 1 of 2"
            title="Identity & category"
            description="What this product is called and how it's classified. Click any field to edit."
            density="compact"
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              <EditableField
                label="Name"
                help="What operators see in pickers and forms. Hebrew is fine — picker labels render with auto-direction."
              >
                {isAdmin ? (
                  <InlineEditCell
                    value={row.item_name}
                    onSave={saveField("item_name")}
                    ariaLabel="Edit item name"
                  />
                ) : (
                  <span className="font-medium text-fg-strong" dir="auto">{row.item_name}</span>
                )}
              </EditableField>

              <EditableField
                label="Family"
                help="High-level operational family (e.g. MATCHA, COCKTAIL). Drives planning groupings and dashboard rollups. Pick from the existing set so all products in a line share the same value."
                emptyHint="Picks the dashboard rollup bucket."
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    fieldLabel="Family"
                    value={row.family}
                    options={fieldOptions.family}
                    placeholder="— Choose family —"
                    allowAdHoc
                    onSave={saveField("family")}
                  />
                ) : (
                  <span className="text-fg" dir="auto">{row.family ?? "—"}</span>
                )}
              </EditableField>

              <EditableField
                label="Product group"
                help="Sub-grouping inside the family — used by purchase recommendations and forecast cohorts."
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    fieldLabel="Product group"
                    value={row.product_group}
                    options={fieldOptions.product_group}
                    placeholder="— Choose product group —"
                    allowAdHoc
                    onSave={saveField("product_group")}
                  />
                ) : (
                  <span className="text-fg" dir="auto">{row.product_group ?? "—"}</span>
                )}
              </EditableField>

              <EditableField
                label="Item type"
                help="Free-form tag layered on top of family / supply_method (e.g. KIT, SINGLE, GIFT). Optional."
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    fieldLabel="Item type"
                    value={row.item_type}
                    options={fieldOptions.item_type}
                    placeholder="— Choose item type —"
                    allowAdHoc
                    onSave={saveField("item_type")}
                  />
                ) : (
                  <span className="text-fg" dir="auto">{row.item_type ?? "—"}</span>
                )}
              </EditableField>
            </div>
          </SectionCard>

          {/* --- Packaging & units ------------------------------------------
              The numbers that drive Goods Receipt, Production Output, and the
              Shopify on-hand sync. Sales unit is the only strict enum here
              (FK to private_core.uom). */}
          <SectionCard
            eyebrow="Section 2 of 2"
            title="Packaging & units"
            description="How the product is packaged and counted. Sales unit is shared with production output, GR, and the Shopify sync."
            density="compact"
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-3">
              <EditableField
                label="Pack size"
                help="Volume / mass per pack (e.g. 250ML, 100G). Stored as text — pick from the existing set, or admins can add a new value."
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    fieldLabel="Pack size"
                    value={row.pack_size}
                    options={fieldOptions.pack_size}
                    placeholder="— Choose pack size —"
                    allowAdHoc
                    onSave={saveField("pack_size")}
                  />
                ) : (
                  <span className="text-fg">{row.pack_size ?? "—"}</span>
                )}
              </EditableField>

              <EditableField
                label="Sales unit"
                help="Strict enum (UOM table). Production Output rejects on submit if its UoM does not match. New UoMs require a DB migration."
                strict
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    fieldLabel="Sales unit"
                    value={row.sales_uom}
                    options={fieldOptions.sales_uom}
                    placeholder="— Choose sales unit —"
                    onSave={saveField("sales_uom")}
                  />
                ) : (
                  <span className="text-fg">{row.sales_uom ?? "—"}</span>
                )}
              </EditableField>

              <EditableField
                label="Case pack"
                help="Units per shipping case. Used by purchase recommendations to round MOQs and by LionWheel route planning."
              >
                {isAdmin ? (
                  <InlineEditCell
                    value={row.case_pack !== null ? String(row.case_pack) : ""}
                    type="number"
                    inputMode="numeric"
                    onSave={(val) =>
                      itemFieldMutation.mutateAsync({
                        field: "case_pack",
                        value: val ? Number(val) : null,
                        updated_at: row.updated_at,
                      }) as Promise<void>
                    }
                    ariaLabel="Edit case pack"
                  />
                ) : (
                  <span className="text-fg">{row.case_pack ?? "—"}</span>
                )}
              </EditableField>
            </div>
          </SectionCard>

          {/* --- Technical details (locked) --------------------------------
              These fields are either system identifiers (item_id, sku),
              schema-locked once referenced (supply_method), or maintained
              elsewhere via a workflow (BOM links). Rendered in a plain
              card with a muted heading so admins know they are reference,
              not actions. */}
          <details className="group rounded-md border border-border/50 bg-bg-subtle/40 open:bg-bg-subtle/60 transition-colors">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-fg-muted group-open:border-b group-open:border-border/50">
              <span>Technical details — system fields</span>
              <span className="text-3xs font-normal text-fg-faint">
                read-only · changing these requires a migration or workflow
              </span>
            </summary>
            <div className="px-3 py-3">
              <p className="mb-2 text-xs text-fg-subtle">
                Supply method, BOM links, and the item code itself are locked
                here. To change a supply method, archive existing BOM
                references first; to swap a BOM head, use the BOM editor.
              </p>
              <DetailFieldGrid rows={classLFields} />
            </div>
          </details>

          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="min-h-[1.25rem]"
          >
            {itemFieldMutation.isPending ? (
              <p className="text-xs text-fg-muted">Saving…</p>
            ) : itemFieldMutation.isError ? (
              <p className="text-xs text-danger-fg">
                {itemFieldMutation.error instanceof AdminMutationError
                  ? itemFieldMutation.error.message
                  : "Save failed. Please try again."}
              </p>
            ) : null}
          </div>
        </div>
      );
    })(),
  };

  const bomTab: TabDescriptor = {
    key: "bom",
    label: "BOM",
    badge: row && row.supply_method !== "BOUGHT_FINISHED"
      ? row.primary_bom_head_id || row.base_bom_head_id
        ? undefined
        : "!"
      : undefined,
    badgeTone:
      row &&
      row.supply_method !== "BOUGHT_FINISHED" &&
      !row.primary_bom_head_id &&
      !row.base_bom_head_id
        ? "danger"
        : "neutral",
    content: (() => {
      // Inline BOM editor — activated when user clicks "Edit draft" on a version.
      if (editingBomState) {
        return (
          <BomDraftEditorPage
            bomHeadId={editingBomState.headId}
            versionId={editingBomState.versionId}
            onClose={() => {
              setEditingBomState(null);
              void queryClient.invalidateQueries({ queryKey: ["admin", "masters", "item", item_id, "bom-versions"] });
              void queryClient.invalidateQueries({ queryKey: ["admin", "masters", "item", item_id, "base-bom-versions"] });
              void queryClient.invalidateQueries({ queryKey: ["admin", "masters", "item", item_id, "bom-head"] });
            }}
          />
        );
      }
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
          <SectionCard tone="warning" density="compact">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 max-w-xl">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone="warning" dotted>Setup blocker</Badge>
                  <span className="text-3xs uppercase tracking-sops text-fg-subtle">
                    {fmtSupplyMethod(row.supply_method)}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-fg-strong">
                  No recipe linked to this product
                </h3>
                <p className="mt-1 text-sm text-fg-muted">
                  {row.supply_method === "MANUFACTURED"
                    ? "Manufactured products need an active BOM before they can be planned, produced, or appear on the daily production plan. Link a BOM head with at least one active version."
                    : "Repack products need an active BOM that defines the input component(s) so production can deduct stock correctly."}
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-fg-subtle">
                  <li>· Planning will skip this item until a BOM is linked.</li>
                  <li>· Production Output rejects on submit (`UNRESOLVED_BOM`).</li>
                  <li>· Purchase recommendations cannot net it.</li>
                </ul>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href="/admin/masters/boms"
                  className="btn-primary inline-flex items-center gap-1.5"
                >
                  Open BOM editor
                </Link>
              </div>
            </div>
          </SectionCard>
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
          <DetailTabError
            message={(bomHeadQuery.error as Error).message}
            onRetry={() => bomHeadQuery.refetch()}
          />
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
              onEditVersion={(hId, vId) => setEditingBomState({ headId: hId, versionId: vId })}
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
              onEditVersion={(hId, vId) => setEditingBomState({ headId: hId, versionId: vId })}
            />
          )}
        </div>
      );
    })(),
  };

  const supplierItemsTab: TabDescriptor = {
    key: "supplier-items",
    label: "Supplier items",
    badge:
      row?.supply_method === "BOUGHT_FINISHED" && itemSupplierItems.length > 0
        ? `${itemSupplierItems.length}`
        : undefined,
    badgeTone:
      row?.supply_method === "BOUGHT_FINISHED" && itemSupplierItems.length === 0
        ? "warning"
        : itemHasPrimarySupplier
          ? "success"
          : "neutral",
    content: (() => {
      if (!row) return <DetailTabEmpty message="Item row not loaded yet." />;
      if (row.supply_method === "BOUGHT_FINISHED") {
        if (itemSupplierItemsQuery.isLoading) return <DetailTabLoading />;
        if (itemSupplierItemsQuery.isError) {
          return (
            <DetailTabError
              message={(itemSupplierItemsQuery.error as Error).message}
              onRetry={() => itemSupplierItemsQuery.refetch()}
            />
          );
        }
        const rows = itemSupplierItemsQuery.data?.rows ?? [];
        if (rows.length === 0) {
          return (
            <div className="space-y-3">
              <DetailTabEmpty message="No supplier linked to this purchased product." />
              {isAdmin ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    className="btn-primary inline-flex items-center gap-1.5"
                    onClick={() => setShowAssignPrimary(true)}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Assign primary supplier
                  </button>
                </div>
              ) : null}
            </div>
          );
        }
        return <SupplierItemsTable rows={rows} supplierNameOf={supplierNameOf} />;
      }
      // MANUFACTURED / REPACK: supplier coverage is at the component level.
      // A fan-out aggregation (bom_line → component → supplier_item) belongs
      // to a later tranche endpoint rather than N+1 client-side fetches.
      return (
        <div className="space-y-3">
          <SectionCard
            eyebrow="Component-level suppliers"
            title={
              row.supply_method === "MANUFACTURED"
                ? "Supplier coverage is per ingredient"
                : "Supplier coverage is per input component"
            }
            description={
              row.supply_method === "MANUFACTURED"
                ? "Manufactured products source their ingredients through component supplier links — not through a direct item-level supplier. Navigate to the BOM tab, then open each component to review its supplier coverage and lead times."
                : "Repack products use an input component as their main supply. Navigate to the BOM tab to find the input component, then open it to review supplier links."
            }
            density="compact"
          >
            <div className="flex flex-wrap gap-2">
              <Link
                href={`${detailPath}?tab=bom`}
                className="inline-flex items-center gap-1 rounded border border-border/60 bg-bg-subtle/40 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/60 hover:text-accent"
              >
                Go to BOM tab →
              </Link>
              <Link
                href="/admin/masters/components"
                className="inline-flex items-center gap-1 rounded border border-border/60 bg-bg-subtle/40 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/60 hover:text-accent"
              >
                Browse all components →
              </Link>
            </div>
          </SectionCard>
          {row.primary_bom_head_id ? (
            <div className="rounded-md border border-border/50 bg-bg-subtle/40 px-3 py-2.5 text-xs text-fg-muted">
              Pack BOM{" "}
              <Link
                href={`/admin/masters/boms/${encodeURIComponent(row.primary_bom_head_id)}`}
                className="font-mono text-accent hover:underline"
              >
                {row.primary_bom_head_id}
              </Link>{" "}
              is linked — open it to review per-component supplier coverage.
            </div>
          ) : (
            <div className="rounded-md border border-warning/30 bg-warning-softer px-3 py-2.5 text-xs text-warning-fg">
              No BOM linked yet — supplier coverage cannot be determined until a BOM is assigned.
            </div>
          )}
        </div>
      );
    })(),
  };

  const anchorsTab: TabDescriptor = {
    key: "anchors",
    label: "Anchors",
    content: (
      <div className="space-y-3">
        <SectionCard
          eyebrow="Balance checkpoints"
          title="Count anchors"
          description="A count anchor is a trusted balance snapshot created when an approved Physical Count is submitted. Current stock = latest anchor + all ledger events posted after the anchor date."
          density="compact"
        >
          <div className="space-y-3">
            <div className="rounded-md border border-info/30 bg-info-softer px-3 py-2.5 text-xs text-fg-muted">
              <span className="font-semibold text-info-fg">
                Per-item anchor history will appear here once the Physical Count workflow is live (Gate 3).
              </span>{" "}
              Until then, submit a Physical Count to establish a trusted baseline for this item.
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/stock/movement-log?item_id=${encodeURIComponent(item_id)}`}
                className="inline-flex items-center gap-1 rounded border border-border/60 bg-bg-subtle/40 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/60 hover:text-accent"
              >
                View stock movements →
              </Link>
              <Link
                href="/stock/physical-count"
                className="inline-flex items-center gap-1 rounded border border-border/60 bg-bg-subtle/40 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/60 hover:text-accent"
              >
                Submit a Physical Count →
              </Link>
            </div>
          </div>
        </SectionCard>
        <SectionCard
          eyebrow="How anchor math works"
          title="Why anchors keep stock trustworthy"
          density="compact"
        >
          <ul className="space-y-2 text-xs text-fg-muted">
            {([
              "An anchor is created when a Physical Count is approved — verified physical observation replaces projections.",
              "Stock = latest anchor + ledger events since that anchor date. Events before the anchor are already absorbed into it.",
              "Large count discrepancies require approval before becoming an anchor (configurable threshold).",
              "A monthly full count + anchor keeps projection drift in check and maintains operator confidence.",
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

  const policyTab: TabDescriptor = {
    key: "policy",
    label: "Policy",
    content: (
      <div className="space-y-3">
        <SectionCard
          eyebrow="Per-item overrides"
          title="Planning policy"
          description="Planning policy controls when purchase recommendations fire, how much safety stock to hold, and how demand uncertainty is handled. Per-item overrides supersede the global defaults."
          density="compact"
        >
          <div className="space-y-3">
            <div className="rounded-md border border-info/30 bg-info-softer px-3 py-2.5 text-xs text-fg-muted">
              <span className="font-semibold text-info-fg">
                Per-item policy overrides are not yet available (Gate 5).
              </span>{" "}
              Global planning defaults apply. When per-item overrides land, this tab will show an editable form pinned to this product.
            </div>
            <Link
              href="/admin/planning-policy"
              className="inline-flex items-center gap-1 rounded border border-border/60 bg-bg-subtle/40 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/60 hover:text-accent"
            >
              View global planning defaults →
            </Link>
          </div>
        </SectionCard>
        <SectionCard
          eyebrow="Policy fields reference"
          title="What each field controls"
          density="compact"
        >
          <dl className="space-y-2.5 text-xs">
            {(
              [
                ["Reorder point", "When projected stock falls below this, a purchase recommendation fires. Measured in sales units."],
                ["Safety stock", "Minimum buffer held against demand uncertainty. Prevents recommendations cutting right to zero."],
                ["MOQ override", "Per-item minimum order quantity that overrides the supplier default. Useful for contractual minimums."],
                ["Planning horizon", "Days forward the engine looks when computing need. Longer = more conservative stock building."],
                ["Uncertainty band", "Demand confidence interval. Wider band → more safety stock → fewer stock-outs at higher inventory cost."],
              ] as [string, string][]
            ).map(([term, def]) => (
              <div key={term} className="flex items-start gap-2">
                <dt className="w-36 shrink-0 font-semibold text-fg">{term}</dt>
                <dd className="text-fg-muted">{def}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>
    ),
  };

  const exceptionsTab: TabDescriptor = {
    key: "exceptions",
    label: "Exceptions",
    badge:
      relatedExceptions.length > 0
        ? `${relatedExceptions.length}`
        : undefined,
    badgeTone: relatedExceptions.some((e) => e.severity === "critical")
      ? "danger"
      : relatedExceptions.length > 0
        ? "warning"
        : "neutral",
    content: (() => {
      if (exceptionsQuery.isLoading) return <DetailTabLoading />;
      if (exceptionsQuery.isError) {
        return (
          <DetailTabError
            message={(exceptionsQuery.error as Error).message}
            onRetry={() => exceptionsQuery.refetch()}
          />
        );
      }
      if (relatedExceptions.length === 0) {
        return (
          <SectionCard density="compact">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-success"
              />
              <div>
                <div className="text-sm font-semibold text-fg">All clear</div>
                <div className="text-xs text-fg-muted">
                  No open or acknowledged exceptions for this item.
                </div>
              </div>
            </div>
          </SectionCard>
        );
      }
      const sortedExceptions = [...relatedExceptions].sort((a, b) => {
        const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
        return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
      });
      const criticalCount = sortedExceptions.filter((e) => e.severity === "critical").length;
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <span>
                {sortedExceptions.length} exception{sortedExceptions.length === 1 ? "" : "s"}
              </span>
              {criticalCount > 0 ? (
                <Badge tone="danger" dotted>
                  {criticalCount} critical
                </Badge>
              ) : null}
            </div>
            <Link
              href={`/inbox?view=exceptions&related_entity_id=${encodeURIComponent(item_id)}`}
              className="text-xs text-accent hover:underline"
            >
              View all in Inbox →
            </Link>
          </div>
          <SectionCard density="compact" contentClassName="p-0">
            <ul className="divide-y divide-border/40">
              {sortedExceptions.map((e) => (
                <li
                  key={e.exception_id}
                  className={`flex items-start gap-3 px-4 py-3 text-xs ${
                    e.severity === "critical" ? "bg-danger-softer/20" : ""
                  }`}
                >
                  <SeverityBadge severity={e.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-fg">{e.title}</div>
                    {e.detail ? (
                      <div className="mt-0.5 text-fg-muted">{e.detail}</div>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-3xs text-fg-faint">
                      <span>{e.category}</span>
                      <span>·</span>
                      <Badge tone={e.status === "open" ? "warning" : "neutral"} dotted>
                        {e.status}
                      </Badge>
                      <span>·</span>
                      <span>{fmtDateTime(e.created_at)}</span>
                    </div>
                  </div>
                  <Link
                    href={`/inbox?view=exceptions&exception_id=${encodeURIComponent(
                      e.exception_id,
                    )}`}
                    className="shrink-0 rounded border border-border/60 px-2 py-1 text-3xs font-medium text-fg transition-colors hover:border-accent/60 hover:text-accent"
                  >
                    Triage →
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
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
        <>
          {/* Single hero card for every product — manufactured, repack, or
              purchased finished. The RecipeHealthCard below is the BOM-
              specific drill-down for manufactured items only. The hero is
              wrapped in a reveal-on-mount class so the whole detail page
              feels intentional on first paint. */}
          <div className="reveal-on-mount">
            <MasterSummaryCard
            name={row.item_name}
            code={row.item_id}
            entityType={fmtSupplyMethod(row.supply_method)}
            status={row.status}
            completeness={completenessItems}
            kpis={kpis}
            subtitle={
              row.family || row.product_group ? (
                <span>
                  {[row.family, row.product_group]
                    .filter((v): v is string => Boolean(v))
                    .join(" · ")}
                </span>
              ) : undefined
            }
            primaryAction={
              showAssignPrimaryCta ? (
                <button
                  type="button"
                  className="btn-primary btn-sm inline-flex items-center gap-1.5"
                  onClick={() => setShowAssignPrimary(true)}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Assign primary supplier
                </button>
              ) : null
            }
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
          </div>
          {row.supply_method === "MANUFACTURED" ? (
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
          ) : null}
        </>
      ) : null}

      <ClassWEditDrawer
        open={showStatusDrawer}
        onClose={() => setShowStatusDrawer(false)}
        title={drawerStatusTarget === "INACTIVE" ? "Archive item" : "Restore item"}
        confirmLabel={drawerStatusTarget === "INACTIVE" ? "Archive item" : "Restore item"}
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

      {isAdmin && isBoughtFinished ? (
        <AssignPrimarySupplierDrawer
          open={showAssignPrimary}
          onClose={() => setShowAssignPrimary(false)}
          onAssigned={() => {
            void queryClient.invalidateQueries({
              queryKey: ["admin", "masters", "item", item_id, "supplier-items"],
            });
            void queryClient.invalidateQueries({
              queryKey: ["admin", "masters", "item", item_id],
            });
          }}
          suppliers={supplierOptions}
          existingSupplierItems={itemSupplierItems.map((si) => ({
            supplier_item_id: si.supplier_item_id,
            supplier_id: si.supplier_id,
            is_primary: si.is_primary,
            updated_at: si.updated_at,
          }))}
          itemId={item_id}
          targetNoun="product"
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// BomSection — renders one BOM (pack or base) within the unified BOM tab.
// Shared by both primary_bom_head_id and base_bom_head_id paths.
// ---------------------------------------------------------------------------

// Human-readable version label — replaces raw UUIDs and ISO timestamps with
// contextual labels like "Current (activated 3 Nov 2025)" or "Draft — edited 2d ago".
function humanVersionLabel(v: BomVersionRow): string {
  if (v.status === "ACTIVE") {
    const dateStr = v.activated_at ?? v.created_at;
    try {
      const label = new Date(dateStr).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      return `Current (activated ${label})`;
    } catch {
      return "Current version";
    }
  }
  if (v.status === "DRAFT") {
    try {
      const ageDays = Math.round((Date.now() - new Date(v.created_at).getTime()) / 86_400_000);
      if (ageDays <= 0) return "Draft — created today";
      if (ageDays === 1) return "Draft — edited yesterday";
      return `Draft — edited ${ageDays}d ago`;
    } catch {
      return "Draft version";
    }
  }
  // SUPERSEDED
  try {
    const label = new Date(v.created_at).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
    return `Archived — ${label}`;
  } catch {
    return "Archived version";
  }
}

function BomSection({
  sectionLabel,
  sectionDescription,
  headId,
  head,
  versions,
  versionsLoading,
  onEditVersion,
}: {
  sectionLabel: string;
  sectionDescription: string;
  headId: string;
  head: BomHeadRow | null;
  versions: BomVersionRow[];
  versionsLoading: boolean;
  onEditVersion?: (headId: string, versionId: string) => void;
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

  const draftVersion = versions.find((v) => v.status === "DRAFT");

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
      value: `${fmtNumStr(head.final_bom_output_qty)} ${head.final_bom_output_uom}`,
      mono: true,
    },
    {
      label: "Active version",
      value: head.active_version_id ? (
        <span className="text-success-fg font-medium">
          {activeVersion ? humanVersionLabel(activeVersion) : "Current version"}
        </span>
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
      {/* Edit action row — shown when a draft exists or as a link to create one */}
      {onEditVersion && (
        <div className="flex flex-wrap items-center gap-2">
          {draftVersion ? (
            <button
              type="button"
              onClick={() => onEditVersion(headId, draftVersion.bom_version_id)}
              className="inline-flex items-center gap-1.5 rounded border border-warning/50 bg-warning-softer px-3 py-1.5 text-xs font-medium text-warning-fg transition-colors hover:border-warning hover:bg-warning-soft"
            >
              Edit draft in-page →
            </button>
          ) : (
            <Link
              href={`/admin/masters/boms/${encodeURIComponent(headId)}`}
              className="inline-flex items-center gap-1.5 rounded border border-border/60 bg-bg-subtle/40 px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/60 hover:text-accent"
            >
              Open BOM editor to create a new draft →
            </Link>
          )}
        </div>
      )}

      <DetailFieldGrid rows={fields} />
      <SectionCard
        eyebrow="Version history"
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
          <div className="p-3 text-xs text-fg-muted">No versions yet.</div>
        ) : (
          <ul className="divide-y divide-border/40">
            {versions.map((v) => {
              const statusTone =
                v.status === "ACTIVE"
                  ? "success"
                  : v.status === "DRAFT"
                    ? "warning"
                    : "neutral";
              return (
                <li
                  key={v.bom_version_id}
                  className={`flex items-center justify-between gap-3 px-3 py-2 text-xs ${
                    v.status === "ACTIVE" ? "bg-success-softer/20" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-fg">
                      {humanVersionLabel(v)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={statusTone} dotted>
                      {v.status}
                    </Badge>
                    {v.status === "DRAFT" && onEditVersion ? (
                      <button
                        type="button"
                        onClick={() => onEditVersion(headId, v.bom_version_id)}
                        className="rounded border border-warning/50 bg-warning-softer px-2 py-0.5 text-3xs font-medium text-warning-fg hover:bg-warning-soft"
                      >
                        Edit in-page
                      </button>
                    ) : (
                      <Link
                        href={`/admin/masters/boms/${encodeURIComponent(v.bom_head_id)}/${encodeURIComponent(v.bom_version_id)}`}
                        className="text-3xs text-fg-faint hover:text-accent"
                      >
                        View →
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// SupplierItemsTable — Iter 9 redesign.
//
// Shows a primary-supplier hero card at the top (the supplier planners care
// most about) with at-a-glance lead time + approval chips.  The full table
// below shows all links with enhanced row highlighting for the primary row.
// Wrapped in overflow-x-auto for narrow / mobile viewports (iter 17).
// ---------------------------------------------------------------------------

function SupplierItemsTable({
  rows,
  supplierNameOf,
}: {
  rows: SupplierItemRow[];
  supplierNameOf: (id: string) => string;
}): JSX.Element {
  const primary = rows.find((r) => r.is_primary);

  return (
    <div className="space-y-3">
      {/* Primary supplier hero -------------------------------------------- */}
      {primary ? (
        <SectionCard density="compact">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-1.5">
                <Badge tone="success" dotted>
                  Primary supplier
                </Badge>
              </div>
              <Link
                href={`/admin/masters/suppliers/${encodeURIComponent(primary.supplier_id)}`}
                className="text-base font-semibold text-fg-strong hover:text-accent"
              >
                {supplierNameOf(primary.supplier_id)}
              </Link>
              {primary.relationship ? (
                <p className="mt-0.5 text-xs text-fg-muted">{primary.relationship}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-5 text-xs">
              <div className="flex flex-col gap-1">
                <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Lead time
                </span>
                <LeadTimeChip days={primary.lead_time_days} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Order UoM
                </span>
                <span className="font-mono text-xs text-fg">
                  {primary.order_uom ?? "—"}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Approval
                </span>
                <ApprovalBadge status={primary.approval_status} />
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {/* Full supplier links table ---------------------------------------- */}
      <SectionCard
        eyebrow={rows.length === 1 ? "Supplier link" : "All supplier links"}
        title={`${rows.length} supplier${rows.length === 1 ? "" : "s"} linked`}
        density="compact"
        contentClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/70 bg-bg-subtle/60">
                <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Supplier
                </th>
                <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Relationship
                </th>
                <th scope="col" className="px-3 py-2 text-center text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Primary
                </th>
                <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Order UoM
                </th>
                <th scope="col" className="px-3 py-2 text-center text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Lead time
                </th>
                <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                  Approval
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.supplier_item_id}
                  className={`border-b border-border/40 last:border-b-0 ${
                    r.is_primary
                      ? "bg-success-softer/20 hover:bg-success-softer/40"
                      : "hover:bg-bg-subtle/40"
                  }`}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/masters/suppliers/${encodeURIComponent(r.supplier_id)}`}
                      className={`hover:text-accent ${r.is_primary ? "font-semibold text-fg-strong" : "text-fg"}`}
                      title={r.supplier_id}
                    >
                      {supplierNameOf(r.supplier_id)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    {r.relationship ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.is_primary ? (
                      <Badge tone="success" dotted>
                        primary
                      </Badge>
                    ) : (
                      <span className="text-fg-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-fg-muted">
                    {r.order_uom ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <LeadTimeChip days={r.lead_time_days} />
                  </td>
                  <td className="px-3 py-2">
                    <ApprovalBadge status={r.approval_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
