"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · Components · Detail
// Canonical URL /admin/masters/components/[component_id].
// All 20 iterations applied — see docs/ux/component-detail-redesign.md.
// ---------------------------------------------------------------------------

import { use, useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, HelpCircle } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
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
import { useConfirm } from "@/components/overlays/ConfirmDialog";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { InlineEditSelectCell } from "@/components/tables/InlineEditSelectCell";
import { QuickCreateSupplierItem } from "@/components/admin/quick-create/QuickCreateSupplierItem";
import {
  MasterSummaryCard,
  type CompletenessItem,
  type KpiStat,
} from "@/components/admin/MasterSummaryCard";
import { AssignPrimarySupplierDrawer } from "@/components/admin/AssignPrimarySupplierDrawer";
import { ClassWEditDrawer } from "@/components/admin/ClassWEditDrawer";
import { UsedInRecipes } from "@/components/admin/UsedInRecipes";
import type { EntityOption } from "@/components/fields/EntityPickerPlus";
import { AdminMutationError, patchEntity, postStatus } from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";
import { useComponentFieldOptions } from "@/lib/admin/component-field-options";
import { cn } from "@/lib/cn";

// --- Types ---------------------------------------------------------------

interface ComponentRow {
  component_id: string;
  component_name: string;
  component_class: string | null;
  component_group: string | null;
  status: string;
  inventory_uom: string | null;
  purchase_uom: string | null;
  bom_uom: string | null;
  purchase_to_inv_factor: string;
  planning_policy_code: string | null;
  primary_supplier_id: string | null;
  lead_time_days: number | null;
  moq_purchase_uom: string | null;
  order_multiple_purchase_uom: string | null;
  criticality: string | null;
  planned_flag: boolean;
  site_id: string;
  created_at: string;
  updated_at: string;
}

interface ComponentsListResponse {
  rows: ComponentRow[];
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
  inventory_uom: string | null;
  pack_conversion: string;
  lead_time_days: number | null;
  moq: string | null;
  safety_days: number;
  std_cost_per_inv_uom: string | null;
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

// --- helpers -------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
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

function ComponentStatusBadge({ status }: { status: string }): JSX.Element {
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

// iter 6: LeadTimeChip — green ≤7d, amber ≤14d, red >14d
function LeadTimeChip({ days }: { days: number | null }): JSX.Element {
  if (days === null) return <span className="text-xs text-fg-faint">—</span>;
  const tone =
    days <= 7
      ? "text-success-fg bg-success-softer border-success/30"
      : days <= 14
        ? "text-warning-fg bg-warning-softer border-warning/30"
        : "text-danger-fg bg-danger-softer border-danger/30";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-3xs font-semibold",
        tone,
      )}
    >
      {days}d lead
    </span>
  );
}

// iter 6: ApprovalBadge — APPROVED=success, PENDING*=warning, REJECTED=danger
function ApprovalBadge({ status }: { status: string | null }): JSX.Element | null {
  if (!status) return null;
  const upper = status.toUpperCase();
  if (upper === "APPROVED") return <Badge tone="success">Approved</Badge>;
  if (upper === "REJECTED") return <Badge tone="danger">Rejected</Badge>;
  if (upper.startsWith("PENDING")) return <Badge tone="warning">Pending</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

// iter 15: EditableField — label + (?) help popover (Radix Popover) + optional enum chip
function EditableField({
  label,
  help,
  enumChip,
  children,
}: {
  label: string;
  help?: string;
  enumChip?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1">
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          {label}
        </span>
        {enumChip ? (
          <span className="rounded border border-info/30 bg-info-softer px-1 text-3xs font-semibold text-info-fg">
            enum
          </span>
        ) : null}
        {help ? (
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="text-fg-faint transition-colors hover:text-fg-muted"
                aria-label={`Help: ${label}`}
              >
                <HelpCircle className="h-3 w-3" strokeWidth={2} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side="top"
                sideOffset={4}
                align="start"
                className="z-50 max-w-[220px] animate-fade-in-up rounded-md border border-border/70 bg-bg-raised px-3 py-2 text-xs text-fg shadow-pop"
              >
                {help}
                <Popover.Arrow className="fill-border/70" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        ) : null}
      </div>
      {children}
    </div>
  );
}

// iter 12: relative time formatter for KPI strip
function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    const hrs = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    if (days < 30) return `${days}d ago`;
    return fmtDateTime(iso);
  } catch {
    return "—";
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminComponentDetailPage({
  params,
}: {
  params: Promise<{ component_id: string }>;
}): JSX.Element {
  const { component_id } = use(params);
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();

  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showAssignPrimary, setShowAssignPrimary] = useState(false);
  const [editBanner, setEditBanner] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [showStatusDrawer, setShowStatusDrawer] = useState(false);
  const [drawerStatusTarget, setDrawerStatusTarget] = useState<string>("");
  const { confirm, dialog: confirmDialog } = useConfirm();

  const componentQuery = useQuery<ComponentsListResponse>({
    queryKey: ["admin", "masters", "component", component_id],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });
  const row = componentQuery.data?.rows.find(
    (r) => r.component_id === component_id,
  );

  // iter 2: hook for dropdown options (component_group, category, uom, criticality)
  const fieldOptions = useComponentFieldOptions(componentQuery.data?.rows);

  const siQueryKey = ["admin", "masters", "component", component_id, "supplier-items"] as const;

  const supplierItemsQuery = useQuery<SupplierItemsListResponse>({
    queryKey: siQueryKey,
    queryFn: () =>
      fetchJson(
        `/api/supplier-items?component_id=${encodeURIComponent(component_id)}&limit=1000`,
      ),
  });

  // Suppliers list — used by the picker AND to render names everywhere a
  // supplier_id appears in the UI. Loaded for everyone (not just admin) so
  // non-admin viewers also read names instead of raw IDs.
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

  const exceptionsQuery = useQuery<ExceptionsListResponse>({
    queryKey: ["admin", "masters", "component", component_id, "exceptions"],
    queryFn: () => fetchJson("/api/exceptions?status=open,acknowledged&limit=1000"),
  });
  const relatedExceptions =
    exceptionsQuery.data?.rows.filter(
      (e) => e.related_entity_id === component_id,
    ) ?? [];

  // iter 9: sort critical first
  const sortedExceptions = useMemo(() => {
    const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    return [...relatedExceptions].sort((a, b) => {
      const ao = order[a.severity] ?? 3;
      const bo = order[b.severity] ?? 3;
      return ao - bo;
    });
  }, [relatedExceptions]);

  const primarySi = supplierItemsQuery.data?.rows.filter((si) => si.is_primary) ?? [];
  const allSi = supplierItemsQuery.data?.rows ?? [];

  // Planning parameters — derived from primary supplier item, falling back to
  // component-level defaults, then global policy constants.
  const primarySupplierItem = primarySi[0] ?? null;

  const effectiveLeadTime =
    primarySupplierItem?.lead_time_days ??
    row?.lead_time_days ??
    14;

  const leadTimeSource =
    primarySupplierItem?.lead_time_days != null
      ? "Primary supplier"
      : row?.lead_time_days != null
      ? "Supplier default"
      : "Global policy (14d)";

  const effectiveMoq = primarySupplierItem?.moq ?? null;
  const moqSource = effectiveMoq != null ? "Primary supplier" : null;

  const effectiveSafetyDays = primarySupplierItem?.safety_days ?? 0;
  const safetyDaysSource =
    primarySupplierItem?.safety_days != null
      ? "Primary supplier"
      : "Global policy (0d)";

  const effectiveReorderLead = effectiveLeadTime + effectiveSafetyDays;

  const supplierOptions: EntityOption[] = useMemo(
    () =>
      (suppliersQuery.data?.rows ?? []).map((s) => ({
        id: s.supplier_id,
        label: s.supplier_name_official,
        sublabel: s.supplier_id,
      })),
    [suppliersQuery.data],
  );

  // Supplier-item field mutation (lead/MOQ/cost)
  const fieldMutation = useMutation({
    mutationFn: async (args: {
      supplier_item_id: string;
      field: "lead_time_days" | "moq" | "pack_conversion" | "std_cost_per_inv_uom";
      value: string | number;
      updated_at: string;
    }) =>
      patchEntity({
        url: `/api/supplier-items/${encodeURIComponent(args.supplier_item_id)}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setEditBanner({ kind: "success", message: "Saved." });
      void queryClient.invalidateQueries({ queryKey: siQueryKey });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? err.message
          : err.message;
      setEditBanner({ kind: "error", message: `Update failed: ${msg}` });
    },
  });

  const promotePrimaryMutation = useMutation({
    mutationFn: async (args: { supplier_item_id: string; updated_at: string }) =>
      patchEntity({
        url: `/api/supplier-items/${encodeURIComponent(args.supplier_item_id)}`,
        fields: { is_primary: true },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setEditBanner({ kind: "success", message: "Promoted to primary." });
      void queryClient.invalidateQueries({ queryKey: siQueryKey });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? err.message
          : err.message;
      setEditBanner({ kind: "error", message: `Promote failed: ${msg}` });
    },
  });

  // Component field mutation — PATCHes the component's own scalar fields
  const componentFieldMutation = useMutation({
    mutationFn: async (args: { field: string; value: unknown; updated_at: string }) =>
      patchEntity({
        url: `/api/components/${encodeURIComponent(component_id)}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setEditBanner({ kind: "success", message: "Saved." });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "masters", "component", component_id],
      });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? err.message
          : err.message;
      setEditBanner({ kind: "error", message: `Update failed: ${msg}` });
    },
  });

  // Status mutation — archive / restore
  const statusMutation = useMutation({
    mutationFn: (args: { newStatus: string; updated_at: string }) =>
      postStatus({
        url: `/api/components/${encodeURIComponent(component_id)}/status`,
        status: args.newStatus,
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setShowStatusDrawer(false);
      void queryClient.invalidateQueries({
        queryKey: ["admin", "masters", "component", component_id],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin", "components"] });
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? err.message
          : err.message;
      setEditBanner({ kind: "error", message: `Status update failed: ${msg}` });
    },
  });

  // iter 4 + iter 11: Completeness items with deep-links and stopPropagation fix actions
  const completenessItems = useMemo((): CompletenessItem[] => {
    if (!row) return [];
    const primarySiItem = allSi.find((si) => si.is_primary);
    const hasCost = allSi.some(
      (si) => si.std_cost_per_inv_uom && parseFloat(si.std_cost_per_inv_uom) > 0,
    );
    const hasUom = Boolean(row.inventory_uom);
    return [
      {
        label: "Name set",
        status: row.component_name?.trim() ? "ok" : "error",
        detail: row.component_name?.trim() ? undefined : "Component name is required",
        href: "?tab=overview",
      },
      {
        label: "UOM set",
        status: hasUom ? "ok" : "error",
        detail: hasUom ? (row.inventory_uom ?? undefined) : "Inventory UOM not set — contact a developer",
        href: "?tab=overview",
      },
      {
        label: "Primary supplier set",
        status: primarySiItem ? "ok" : "error",
        detail: primarySiItem
          ? supplierNameOf(primarySiItem.supplier_id)
          : "No primary supplier — component cannot be planned",
        href: "?tab=supplier-items",
        fixAction:
          !primarySiItem && isAdmin ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowAssignPrimary(true);
              }}
            >
              Assign primary supplier
            </button>
          ) : undefined,
      },
      {
        label: "Used in at least 1 active recipe",
        status: "na",
        detail: "See Used in recipes tab",
        href: "?tab=used-in-recipes",
      },
      {
        label: "Standard cost",
        status: hasCost ? "ok" : "warn",
        detail: hasCost ? undefined : "No cost on any sourcing link — affects BOM cost rollups",
        href: "?tab=supplier-items",
      },
    ];
  }, [row, allSi, isAdmin]);

  // iter 4: KPI strip
  const kpis = useMemo((): KpiStat[] => {
    const criticalExc = relatedExceptions.filter((e) => e.severity === "critical").length;
    const anyExc = relatedExceptions.length;
    const supplierLinkCount = allSi.length;
    const hasPrimary = allSi.some((si) => si.is_primary);
    return [
      {
        label: "Open exceptions",
        value: anyExc > 0 ? `${anyExc}` : "None",
        tone: criticalExc > 0 ? "danger" : anyExc > 0 ? "warning" : "success",
        hint: criticalExc > 0 ? `${criticalExc} critical` : undefined,
        href: anyExc > 0 ? "?tab=exceptions" : undefined,
      },
      {
        label: "Supplier links",
        value: supplierLinkCount > 0 ? `${supplierLinkCount}` : "None",
        tone: hasPrimary ? "success" : supplierLinkCount > 0 ? "warning" : "danger",
        hint: hasPrimary ? "Primary set" : "No primary",
        href: "?tab=supplier-items",
      },
      {
        label: "Last updated",
        value: row ? fmtRelative(row.updated_at) : "—",
        tone: "muted",
        hint: row ? fmtDateTime(row.updated_at) : undefined,
      },
    ];
  }, [relatedExceptions, allSi, row]);

  // iter 13: hero subtitle = component_group · category (nulls omitted)
  const heroSubtitle = useMemo(() => {
    if (!row) return undefined;
    const parts = [row.component_group, row.component_class].filter(Boolean);
    if (parts.length === 0) return undefined;
    return parts.join(" · ");
  }, [row]);

  const noPrimarySupplier = !allSi.some((si) => si.is_primary);

  const headerMeta = row ? (
    <>
      <ComponentStatusBadge status={row.status} />
      {row.component_class ? (
        <Badge tone="neutral" dotted>{row.component_class}</Badge>
      ) : null}
      {row.component_group ? (
        <Badge tone="neutral">{row.component_group}</Badge>
      ) : null}
      {row.criticality ? (
        <Badge tone={row.criticality === "HIGH" ? "danger" : "neutral"}>
          {row.criticality}
        </Badge>
      ) : null}
    </>
  ) : null;

  // iter 5: tab badge tones
  const hasCriticalExc = relatedExceptions.some((e) => e.severity === "critical");

  // --- Tabs ----------------------------------------------------------------

  const overviewTab: TabDescriptor = {
    key: "overview",
    label: "Overview",
    content: (() => {
      if (componentQuery.isLoading) return <DetailTabLoading />;
      if (componentQuery.isError) {
        return (
          <DetailTabError
            message={(componentQuery.error as Error).message}
            onRetry={() => componentQuery.refetch()}
          />
        );
      }
      if (!row) {
        return (
          <DetailTabEmpty
            message={`Component ${component_id} not found in the components list.`}
            action={
              <Link href="/admin/components" className="btn btn-sm btn-primary">
                Back to Components
              </Link>
            }
          />
        );
      }

      // iter 12: mutation aria-live feedback
      const mutationFeedback = (
        <div role="status" aria-live="polite" aria-atomic="true" className="min-h-[1.25rem]">
          {componentFieldMutation.isPending ? (
            <span className="text-xs text-fg-muted">Saving…</span>
          ) : componentFieldMutation.isError ? (
            <span className="text-xs text-danger-fg">
              {(componentFieldMutation.error as Error).message}
            </span>
          ) : editBanner?.kind === "success" ? (
            <span className="text-xs text-success-fg">{editBanner.message}</span>
          ) : editBanner?.kind === "error" ? (
            <span className="text-xs text-danger-fg">{editBanner.message}</span>
          ) : null}
        </div>
      );

      // iter 10: Technical details locked fields
      const classLFields: FieldRow[] = [
        { label: "Component ID (locked)", value: row.component_id, mono: true },
        { label: "BOM unit (locked)", value: row.bom_uom ?? "—", mono: true },
        { label: "Purchase → stock factor (locked)", value: row.purchase_to_inv_factor, mono: true },
        { label: "Site", value: row.site_id, mono: true },
        { label: "Created", value: fmtDateTime(row.created_at) },
        { label: "Last updated", value: fmtDateTime(row.updated_at) },
      ];

      return (
        <div className="space-y-4 p-1">
          {mutationFeedback}

          {/* iter 14: Card 1 — Identity & classification */}
          <SectionCard title="Identity & classification" density="compact">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EditableField
                label="Name"
                help="The canonical name for this raw material or packaging component. Appears on purchase recommendations, goods receipt forms, and BOM explosion views."
              >
                {isAdmin ? (
                  <InlineEditCell
                    value={row.component_name}
                    onSave={(val) =>
                      componentFieldMutation.mutateAsync({
                        field: "component_name",
                        value: val,
                        updated_at: row.updated_at,
                      }) as Promise<void>
                    }
                    ariaLabel="Edit component name"
                  />
                ) : (
                  <span className="font-medium text-fg-strong">{row.component_name}</span>
                )}
              </EditableField>

              {/* iter 3: InlineEditSelectCell for category */}
              <EditableField
                label="Category"
                help="Operational category (e.g. Packaging, Raw Material, Label). Groups components on planning screens and purchase recommendation reports."
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    value={row.component_class}
                    options={fieldOptions.category}
                    onSave={(val) =>
                      componentFieldMutation.mutateAsync({
                        field: "component_class",
                        value: val ?? null,
                        updated_at: row.updated_at,
                      }) as Promise<void>
                    }
                    fieldLabel="Category"
                    placeholder="— Select category —"
                    allowAdHoc
                    ariaLabel="Edit category"
                  />
                ) : (
                  <span className="text-fg">{row.component_class ?? "—"}</span>
                )}
              </EditableField>

              {/* iter 3: InlineEditSelectCell for component_group */}
              <EditableField
                label="Group"
                help="Broader grouping used for planning rollups (e.g. Bottles, Caps, Flavors). Affects how purchase recommendations are aggregated."
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    value={row.component_group}
                    options={fieldOptions.component_group}
                    onSave={(val) =>
                      componentFieldMutation.mutateAsync({
                        field: "component_group",
                        value: val ?? null,
                        updated_at: row.updated_at,
                      }) as Promise<void>
                    }
                    fieldLabel="Group"
                    placeholder="— Select group —"
                    allowAdHoc
                    ariaLabel="Edit group"
                  />
                ) : (
                  <span className="text-fg">{row.component_group ?? "—"}</span>
                )}
              </EditableField>

              {/* iter 3: InlineEditSelectCell for criticality */}
              <EditableField
                label="Criticality"
                help="Operational criticality of this component. HIGH items trigger earlier reorder alerts and may require approval for large stock adjustments."
              >
                {isAdmin ? (
                  <InlineEditSelectCell
                    value={row.criticality}
                    options={fieldOptions.criticality}
                    onSave={(val) =>
                      componentFieldMutation.mutateAsync({
                        field: "criticality",
                        value: val ?? null,
                        updated_at: row.updated_at,
                      }) as Promise<void>
                    }
                    fieldLabel="Criticality"
                    placeholder="— Select —"
                    ariaLabel="Edit criticality"
                  />
                ) : (
                  <span className="text-fg">{row.criticality ?? "—"}</span>
                )}
              </EditableField>

              <EditableField
                label="Primary supplier"
                help="The default supplier used by purchase recommendations. Override by assigning a new primary in the Supplier items tab."
              >
                {row.primary_supplier_id ? (
                  <Link
                    href={`/admin/masters/suppliers/${encodeURIComponent(row.primary_supplier_id)}`}
                    className="text-xs text-accent hover:underline"
                    title={row.primary_supplier_id}
                  >
                    {supplierNameOf(row.primary_supplier_id)}
                  </Link>
                ) : (
                  <span className="text-xs text-fg-muted">—</span>
                )}
              </EditableField>

              <EditableField
                label="Included in planning"
                help="When false, this component is excluded from purchase recommendation runs. Flip to true once the component is operationally ready."
              >
                <span className="text-fg">{row.planned_flag ? "Yes" : "No"}</span>
              </EditableField>
            </div>
          </SectionCard>

          {/* iter 14: Card 2 — Units & procurement */}
          <SectionCard title="Units & procurement" density="compact">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EditableField
                label="Stock unit"
                help="The unit in which on-hand stock is tracked in the ledger. Locked once historical balances exist — contact a developer to change."
                enumChip
              >
                <span className="font-mono text-xs text-fg">{row.inventory_uom ?? "—"}</span>
              </EditableField>

              {row.purchase_uom && row.purchase_uom !== row.inventory_uom ? (
                <EditableField
                  label="Purchase unit"
                  help="The unit in which this component is ordered from suppliers. Converted to stock units using the purchase-to-stock factor."
                  enumChip
                >
                  <span className="font-mono text-xs text-fg">{row.purchase_uom}</span>
                </EditableField>
              ) : null}

              <EditableField
                label="Planning policy"
                help="The reorder policy code applied by the planning engine (e.g. MIN_MAX, EOQ). Override in the policy tab or via admin."
              >
                <span className="font-mono text-xs text-fg">{row.planning_policy_code ?? "—"}</span>
              </EditableField>

              <EditableField
                label="Lead time (days)"
                help="Default lead time used by planning when no supplier-specific override exists. Prefer the supplier-item-level lead time for accuracy."
              >
                <span className="text-fg">{row.lead_time_days ?? "—"}</span>
              </EditableField>

              <EditableField
                label="Min. order qty"
                help="Default minimum order quantity in purchase units. The planning engine respects this floor when generating purchase recommendations."
              >
                <span className="font-mono text-xs text-fg">{row.moq_purchase_uom ?? "—"}</span>
              </EditableField>

              {row.order_multiple_purchase_uom ? (
                <EditableField
                  label="Order multiple"
                  help="Orders are rounded up to the nearest multiple of this quantity in purchase units."
                >
                  <span className="font-mono text-xs text-fg">{row.order_multiple_purchase_uom}</span>
                </EditableField>
              ) : null}
            </div>
          </SectionCard>

          {/* Planning parameters — read-only summary derived from primary supplier item */}
          <SectionCard title="Planning parameters">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border/50">
                <tr>
                  <td className="py-2 pr-4 text-fg-muted w-1/2">Lead time</td>
                  <td className="py-2 font-medium tabular-nums">{effectiveLeadTime}d</td>
                  <td className="py-2 pl-4 text-xs text-fg-muted">{leadTimeSource}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-fg-muted">MOQ</td>
                  <td className="py-2 font-medium tabular-nums">
                    {effectiveMoq != null
                      ? `${Number(effectiveMoq).toLocaleString()} ${row.purchase_uom ?? "UNIT"}`
                      : "—"}
                  </td>
                  <td className="py-2 pl-4 text-xs text-fg-muted">{moqSource ?? "—"}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-fg-muted">Safety days</td>
                  <td className="py-2 font-medium tabular-nums">{effectiveSafetyDays}d</td>
                  <td className="py-2 pl-4 text-xs text-fg-muted">{safetyDaysSource}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-fg-muted font-medium">Effective reorder lead</td>
                  <td className="py-2 font-semibold tabular-nums">{effectiveReorderLead}d</td>
                  <td className="py-2 pl-4 text-xs text-fg-muted">lead + safety</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-fg-muted">
              <Link
                href="?tab=supplier-items"
                className="underline hover:no-underline"
              >
                Edit in supplier items ↓
              </Link>
            </p>
          </SectionCard>

          {/* iter 10: Technical details collapsible with open:bg-bg-subtle/60 */}
          <details className="group rounded-md border border-border/40 transition-colors open:bg-bg-subtle/60">
            <summary className="flex cursor-pointer select-none list-none items-center gap-1 px-3 py-2 text-xs text-fg-muted hover:text-fg">
              <span className="inline-block transition-transform group-open:rotate-90">▶</span>
              Technical details (locked fields)
            </summary>
            <div className="px-3 pb-3">
              <DetailFieldGrid rows={classLFields} />
              <p className="mt-2 text-xs text-fg-subtle">
                Component ID, BOM unit, and the purchase-to-stock conversion factor are locked once any
                historical stock event references this component. These fields are denominated in the original
                units and changing them would corrupt the ledger. Contact a developer if a structural
                correction is required.
              </p>
            </div>
          </details>
        </div>
      );
    })(),
  };

  const usedInRecipesTab: TabDescriptor = {
    key: "used-in-recipes",
    label: "Used in recipes",
    content: <UsedInRecipes component_id={component_id} />,
  };

  const supplierItemsTab: TabDescriptor = {
    key: "supplier-items",
    label: "Supplier items",
    badge: allSi.length > 0 ? `${allSi.length}` : undefined,
    badgeTone: allSi.length > 0 ? (noPrimarySupplier ? "warning" : "success") : undefined,
    content: (() => {
      if (supplierItemsQuery.isLoading) return <DetailTabLoading />;
      if (supplierItemsQuery.isError) {
        return (
          <DetailTabError
            message={(supplierItemsQuery.error as Error).message}
            onRetry={() => supplierItemsQuery.refetch()}
          />
        );
      }

      // iter 12: mutation feedback aria-live
      const siMutationFeedback = (
        <div role="status" aria-live="polite" aria-atomic="true" className="min-h-[1.25rem]">
          {fieldMutation.isPending || promotePrimaryMutation.isPending ? (
            <span className="text-xs text-fg-muted">Saving…</span>
          ) : editBanner?.kind === "success" ? (
            <span className="text-xs text-success-fg">{editBanner.message}</span>
          ) : editBanner?.kind === "error" ? (
            <span className="text-xs text-danger-fg">{editBanner.message}</span>
          ) : null}
        </div>
      );

      // iter 6: primary supplier hero card
      const primarySiRow = allSi.find((si) => si.is_primary) ?? null;
      const primaryHeroCard = primarySiRow ? (
        <SectionCard density="compact">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/masters/suppliers/${encodeURIComponent(primarySiRow.supplier_id)}`}
                  className="font-semibold text-fg hover:text-accent"
                  title={primarySiRow.supplier_id}
                >
                  {supplierNameOf(primarySiRow.supplier_id)}
                </Link>
                <Badge tone="success" dotted>Primary</Badge>
                <ApprovalBadge status={primarySiRow.approval_status} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                {primarySiRow.order_uom ? (
                  <span>Order unit: <span className="font-mono">{primarySiRow.order_uom}</span></span>
                ) : null}
                <LeadTimeChip days={primarySiRow.lead_time_days} />
              </div>
            </div>
          </div>
        </SectionCard>
      ) : (
        <SectionCard density="compact" tone="warning">
          <div className="flex items-start gap-3">
            <Badge tone="warning" dotted>No primary supplier</Badge>
            <div className="text-sm text-fg-muted">
              No primary supplier assigned. The planning engine cannot generate purchase recommendations for this component.
              {isAdmin ? (
                <button
                  type="button"
                  className="ml-2 text-xs font-medium text-accent hover:underline"
                  onClick={() => setShowAssignPrimary(true)}
                >
                  Assign primary supplier →
                </button>
              ) : null}
            </div>
          </div>
        </SectionCard>
      );

      return (
        <div className="space-y-3">
          {siMutationFeedback}
          {primaryHeroCard}
          {isAdmin ? (
            <div className="flex items-center justify-end px-1 pt-1">
              <button
                type="button"
                className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
                onClick={() => setShowAddSupplier(true)}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                Add supplier
              </button>
            </div>
          ) : null}
          {allSi.length === 0 ? (
            <div className="space-y-3">
              <DetailTabEmpty message="No sourcing links for this component." />
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
          ) : (
            <SupplierItemsTable
              rows={allSi}
              isAdmin={isAdmin}
              supplierNameOf={supplierNameOf}
              onFieldSave={async (id, field, value, updated_at) => {
                setEditBanner(null);
                await fieldMutation.mutateAsync({ supplier_item_id: id, field, value, updated_at });
              }}
              onPromotePrimary={async (id, updated_at) => {
                setEditBanner(null);
                const ok = await confirm({
                  title: "Set this supplier as primary?",
                  description:
                    "The existing primary (if any) will be demoted. This affects planning cost and lead time for this component.",
                  confirmLabel: "Set as primary",
                });
                if (!ok) return;
                promotePrimaryMutation.mutate({ supplier_item_id: id, updated_at });
              }}
            />
          )}
        </div>
      );
    })(),
  };

  // iter 8: Anchors tab — rich two-card informational layout
  const anchorsTab: TabDescriptor = {
    key: "anchors",
    label: "Anchors",
    content: (
      <div className="space-y-4">
        <SectionCard title="Balance checkpoints" density="compact">
          <div className="space-y-3 text-sm text-fg-muted">
            <p>
              An <strong className="text-fg">anchor</strong> is a verified on-hand snapshot. The stock
              projection computes: <code className="font-mono text-xs">current stock = last anchor qty + Σ ledger deltas since anchor</code>
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href={`/stock/movements?component_id=${encodeURIComponent(component_id)}`} className="btn btn-ghost btn-sm text-xs">View stock movements →</Link>
              <Link href="/forms/physical-count" className="btn btn-ghost btn-sm text-xs">Open Physical Count form →</Link>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Why anchors keep stock trustworthy" density="compact">
          <ul className="space-y-2 text-sm text-fg-muted">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-accent/60" aria-hidden /><span><strong className="text-fg">Immutable history.</strong> Ledger is append-only; anchors give a verified starting point.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-accent/60" aria-hidden /><span><strong className="text-fg">Drift detection.</strong> New count variance is flagged as a discrepancy exception for planner review.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-accent/60" aria-hidden /><span><strong className="text-fg">Compact replay.</strong> Large approvals post a new anchor, keeping ledger replay fast.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-accent/60" aria-hidden /><span><strong className="text-fg">No round-trip Excel.</strong> Counts flow directly to the ledger — no manual workbook edits.</span>
            </li>
          </ul>
        </SectionCard>
      </div>
    ),
  };

  // iter 9: Exceptions tab — sorted, "All clear" state, triage CTA, iter 5 badge tones
  const exceptionsTab: TabDescriptor = {
    key: "exceptions",
    label: "Exceptions",
    badge: relatedExceptions.length > 0 ? `${relatedExceptions.length}` : undefined,
    badgeTone: hasCriticalExc ? "danger" : relatedExceptions.length > 0 ? "warning" : undefined,
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
      if (sortedExceptions.length === 0) {
        return (
          <SectionCard density="compact">
            <div className="flex items-center gap-3 py-2">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-success-fg">All clear</p>
                <p className="mt-0.5 text-xs text-fg-muted">No open or acknowledged exceptions linked to this component.</p>
              </div>
            </div>
          </SectionCard>
        );
      }
      return (
        <SectionCard density="compact" contentClassName="p-0">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">{sortedExceptions.length} exception{sortedExceptions.length === 1 ? "" : "s"}</span>
            <Link href="/inbox?view=exceptions" className="text-3xs font-medium text-accent hover:underline">View all in Inbox →</Link>
          </div>
          <ul className="divide-y divide-border/40">
            {sortedExceptions.map((e) => (
              <li key={e.exception_id} className={cn("flex items-start gap-3 px-4 py-2 text-xs", e.severity === "critical" && "bg-danger-softer/20")}>
                <SeverityBadge severity={e.severity} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-fg">{e.title}</div>
                  {e.detail ? <div className="truncate text-fg-muted">{e.detail}</div> : null}
                  <div className="mt-0.5 text-3xs text-fg-faint">{e.category} · {e.status} · {fmtDateTime(e.created_at)}</div>
                </div>
                <Link href={`/inbox?view=exceptions&exception_id=${encodeURIComponent(e.exception_id)}`} className="shrink-0 rounded-sm border border-border/40 bg-bg-subtle/60 px-2 py-0.5 text-3xs font-medium text-fg-muted transition-colors hover:border-accent/50 hover:text-accent">
                  Triage →
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
    usedInRecipesTab,
    supplierItemsTab,
    anchorsTab,
    exceptionsTab,
  ];

  // --- Linkage card --------------------------------------------------------
  const linkages: LinkageGroup[] = [];

  if (row?.primary_supplier_id) {
    linkages.push({
      label: "Primary supplier",
      items: [
        {
          label: supplierNameOf(row.primary_supplier_id),
          href: `/admin/masters/suppliers/${encodeURIComponent(row.primary_supplier_id)}`,
          badge: <Badge tone="success" dotted>primary</Badge>,
        },
      ],
    });
  }

  linkages.push({
    label: "All sourcing links",
    items: allSi.slice(0, 10).map((si) => ({
      label: supplierNameOf(si.supplier_id),
      href: `/admin/masters/suppliers/${encodeURIComponent(si.supplier_id)}`,
      subtitle: si.relationship ?? undefined,
      badge: si.is_primary ? (
        <Badge tone="success" dotted>primary</Badge>
      ) : undefined,
    })),
    emptyText: "No sourcing links.",
  });

  linkages.push({
    label: "Exceptions",
    items: relatedExceptions.slice(0, 5).map((e) => ({
      label: e.title.slice(0, 48),
      href: `/inbox?view=exceptions&exception_id=${encodeURIComponent(e.exception_id)}`,
      badge: <SeverityBadge severity={e.severity} />,
    })),
    emptyText: "No open exceptions.",
  });

  return (
    <>
      {confirmDialog}
      {/* Summary card — iter 4: KPI strip; iter 13: subtitle; iter 18: reveal-on-mount */}
      {row ? (
        <div className="reveal-on-mount">
          <MasterSummaryCard
            name={row.component_name}
            code={row.component_id}
            entityType="Raw material / Packaging component"
            status={row.status}
            completeness={completenessItems}
            kpis={kpis}
            subtitle={heroSubtitle}
            primaryAction={
              isAdmin && noPrimarySupplier ? (
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
                    setDrawerStatusTarget(row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
                    setShowStatusDrawer(true);
                  }}
                >
                  {row.status === "ACTIVE" ? "Archive" : "Restore"}
                </button>
              ) : null
            }
          />
        </div>
      ) : null}

      {/* Archive / restore drawer */}
      <ClassWEditDrawer
        open={showStatusDrawer}
        onClose={() => setShowStatusDrawer(false)}
        title={
          drawerStatusTarget === "INACTIVE"
            ? "Archive this component?"
            : "Restore this component?"
        }
        warning={
          drawerStatusTarget === "INACTIVE"
            ? "Archiving hides this raw material from active lists and excludes it from planning. Recipes that reference it still exist but this component won't appear in purchase recommendations."
            : "Restoring sets this component back to Active. It will reappear in active lists and be included in the next planning run."
        }
        onSave={async () => {
          if (!row) return;
          await statusMutation.mutateAsync({
            newStatus: drawerStatusTarget,
            updated_at: row.updated_at,
          });
        }}
        isSaving={statusMutation.isPending}
        error={statusMutation.isError ? (statusMutation.error as Error).message : null}
      >
        <p className="text-sm text-fg-muted">
          Current status: <strong>{row?.status}</strong>
        </p>
      </ClassWEditDrawer>

      <DetailPage
        header={{
          eyebrow: "Admin · Components",
          title: row ? row.component_name : component_id,
          description: row ? row.component_id : "Loading component…",
          meta: headerMeta,
          actions: (
            <Link href="/admin/masters/components" className="btn btn-ghost btn-sm">
              Back to components
            </Link>
          ),
        }}
        tabs={tabs}
        linkages={linkages}
      />
      {isAdmin ? (
        <>
          <QuickCreateSupplierItem
            open={showAddSupplier}
            onClose={() => setShowAddSupplier(false)}
            onCreated={() => {
              setEditBanner({ kind: "success", message: "Sourcing link added." });
              void queryClient.invalidateQueries({ queryKey: siQueryKey });
            }}
            suppliers={supplierOptions}
            components={[]}
            items={[]}
            defaultComponentId={component_id}
          />
          <AssignPrimarySupplierDrawer
            open={showAssignPrimary}
            onClose={() => setShowAssignPrimary(false)}
            onAssigned={() => {
              setEditBanner({ kind: "success", message: "Primary supplier assigned." });
              void queryClient.invalidateQueries({ queryKey: siQueryKey });
              void queryClient.invalidateQueries({
                queryKey: ["admin", "masters", "component", component_id],
              });
            }}
            suppliers={supplierOptions}
            existingSupplierItems={allSi.map((si) => ({
              supplier_item_id: si.supplier_item_id,
              supplier_id: si.supplier_id,
              is_primary: si.is_primary,
              updated_at: si.updated_at,
            }))}
            componentId={component_id}
            targetNoun="raw material"
          />
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// SupplierItemsTable
// ---------------------------------------------------------------------------

function SupplierItemsTable({
  rows,
  isAdmin,
  supplierNameOf,
  onFieldSave,
  onPromotePrimary,
}: {
  rows: SupplierItemRow[];
  isAdmin: boolean;
  supplierNameOf: (id: string) => string;
  onFieldSave: (id: string, field: "lead_time_days" | "moq" | "std_cost_per_inv_uom", value: string | number, updated_at: string) => Promise<void>;
  onPromotePrimary: (id: string, updated_at: string) => void;
}): JSX.Element {
  return (
    // iter 16: overflow-x-auto for mobile
    <div className="overflow-x-auto">
      <SectionCard density="compact" contentClassName="p-0">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border/70 bg-bg-subtle/60">
              <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Supplier</th>
              <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Relationship</th>
              <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Order unit</th>
              <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Lead time</th>
              <th scope="col" className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">MOQ</th>
              <th scope="col" className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Std cost</th>
              <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Approval</th>
              <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Primary</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.supplier_item_id}
                className={cn(
                  "border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40",
                  // iter 6: primary row highlighted
                  r.is_primary && "bg-success-softer/20",
                )}
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
                <td className="px-3 py-2 text-fg-muted">{r.relationship ?? "—"}</td>
                <td className="px-3 py-2 text-fg-muted">{r.order_uom ?? "—"}</td>
                {/* iter 6: LeadTimeChip */}
                <td className="px-3 py-2" title="Affects planning recommendations.">
                  {isAdmin ? (
                    <div className="flex items-center gap-1.5">
                      <InlineEditCell
                        value={r.lead_time_days ?? ""}
                        type="number"
                        inputMode="numeric"
                        ifMatchUpdatedAt={r.updated_at}
                        onSave={(v) => onFieldSave(r.supplier_item_id, "lead_time_days", v, r.updated_at)}
                        ariaLabel={`Edit lead time for ${r.supplier_id}`}
                      />
                      <LeadTimeChip days={r.lead_time_days} />
                    </div>
                  ) : (
                    <LeadTimeChip days={r.lead_time_days} />
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted" title="Affects planning recommendations.">
                  {isAdmin ? (
                    <InlineEditCell
                      value={r.moq ?? ""}
                      type="number"
                      inputMode="decimal"
                      ifMatchUpdatedAt={r.updated_at}
                      onSave={(v) => onFieldSave(r.supplier_item_id, "moq", v, r.updated_at)}
                      ariaLabel={`Edit MOQ for ${r.supplier_id}`}
                    />
                  ) : (
                    r.moq ?? "—"
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-fg-muted" title="Changing standard cost affects BOM costing rollups.">
                  {isAdmin ? (
                    <InlineEditCell
                      value={r.std_cost_per_inv_uom ?? ""}
                      type="number"
                      inputMode="decimal"
                      ifMatchUpdatedAt={r.updated_at}
                      onSave={(v) => onFieldSave(r.supplier_item_id, "std_cost_per_inv_uom", v, r.updated_at)}
                      ariaLabel={`Edit cost for ${r.supplier_id}`}
                    />
                  ) : (
                    r.std_cost_per_inv_uom ?? "—"
                  )}
                </td>
                {/* iter 6: ApprovalBadge column */}
                <td className="px-3 py-2">
                  <ApprovalBadge status={r.approval_status} />
                </td>
                <td className="px-3 py-2">
                  {r.is_primary ? (
                    <Badge tone="success" dotted>Primary</Badge>
                  ) : isAdmin ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onPromotePrimary(r.supplier_item_id, r.updated_at)}
                    >
                      Promote
                    </button>
                  ) : (
                    <span className="text-fg-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}
