"use client";

// ---------------------------------------------------------------------------
// Admin · Masters · Suppliers · Detail — 20-iteration UX redesign.
// Canonical URL /admin/masters/suppliers/[supplier_id].
//
// Iteration log:
//   1. Field audit: dropdowns for supplier_type, currency, payment_terms;
//      free-text for name fields + contact fields; locked: supplier_id.
//   2. supplier-field-options.ts + useSupplierFieldOptions hook.
//   3. InlineEditSelectCell wired for supplier_type, currency, payment_terms.
//   4. MasterSummaryCard hero: completeness checklist + KPI strip.
//   5. Tab badge tones: supplier-items success/warning; exceptions danger/warning; po-history info.
//   6. Supplier-items tab: primary hero card + LeadTimeChip + ApprovalBadge + links.
//   7. PO history tab: rich empty state + group by status + last 10 + links.
//   8. Exceptions tab: sort critical first; green "All clear"; "Triage →"; header link.
//   9. Overview restructure: Identity / Commercial terms / Contact SectionCards.
//  10. EditableField helper with (?) help popovers per field.
//  11. Technical details collapsible with lock explanation.
//  12. Completeness deep-links + fix-action buttons stop propagation.
//  13. Mutation feedback: role="status" aria-live="polite".
//  14. Hero subtitle: {supplier_type} · {currency}.
//  15. reveal-on-mount on hero card wrapper.
//  16. Mobile: overflow-x-auto on all tables; responsive grids.
//  17. Cross-variant: ACTIVE/INACTIVE/PENDING; with/without items; with/without POs.
//  18. Header: eyebrow "Admin · Suppliers", title = supplier_name_official, description = supplier_id.
//  19. docs/ux/supplier-detail-redesign.md iteration roadmap written.
//  20. TypeScript clean.
// ---------------------------------------------------------------------------

import { use, useState, useCallback, useMemo, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
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
import { MasterSummaryCard, type CompletenessItem, type KpiStat } from "@/components/admin/MasterSummaryCard";
import { ClassWEditDrawer } from "@/components/admin/ClassWEditDrawer";
import { QuickCreateSupplierItem } from "@/components/admin/quick-create/QuickCreateSupplierItem";
import { type EntityOption } from "@/components/fields/EntityPickerPlus";
import { AdminMutationError, patchEntity, postStatus } from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";
import { useSupplierFieldOptions } from "@/lib/admin/supplier-field-options";
import { cn } from "@/lib/cn";

// --- Types ---------------------------------------------------------------

interface SupplierRow {
  supplier_id: string;
  supplier_name_official: string;
  supplier_name_short: string | null;
  status: string;
  supplier_type: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  currency: string | null;
  payment_terms: string | null;
  default_lead_time_days: number | null;
  default_moq: string | null;
  approval_status: string | null;
  green_invoice_supplier_id: string | null;
  site_id: string;
  created_at: string;
  updated_at: string;
}

interface SuppliersListResponse {
  rows: SupplierRow[];
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
  moq: string | null;
  approval_status: string | null;
  std_cost_per_inv_uom: string | null;
  updated_at: string;
}

interface SupplierItemsListResponse {
  rows: SupplierItemRow[];
  count: number;
}

interface PurchaseOrderRow {
  po_id: string;
  po_number: string;
  supplier_id: string;
  status: string;
  order_date: string;
  expected_receive_date: string | null;
  currency: string;
  total_net: string;
  source_recommendation_id: string | null;
  created_at: string;
}

interface PurchaseOrdersListResponse {
  rows: PurchaseOrderRow[];
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

interface ComponentRow {
  component_id: string;
  component_name: string | null;
}

interface ItemRow {
  item_id: string;
  sku: string | null;
  item_name: string | null;
  supply_method: string;
}

interface ComponentsListResponse { rows: ComponentRow[]; count: number; }
interface ItemsListResponse { rows: ItemRow[]; count: number; }

// --- helpers -------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
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

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return "today";
    if (days === 1) return "1d ago";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  } catch {
    return iso;
  }
}

// --- Badge components ---------------------------------------------------

function SupplierStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "ACTIVE") return <Badge tone="success" dotted>Active</Badge>;
  if (status === "PENDING") return <Badge tone="warning" dotted>Pending</Badge>;
  if (status === "INACTIVE") return <Badge tone="neutral" dotted>Inactive</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

function POStatusBadge({ status }: { status: string }): JSX.Element {
  if (status === "OPEN") return <Badge tone="info" dotted>Open</Badge>;
  if (status === "PARTIAL") return <Badge tone="warning" dotted>Partial</Badge>;
  if (status === "RECEIVED") return <Badge tone="success" variant="solid">Received</Badge>;
  if (status === "CANCELLED") return <Badge tone="neutral" dotted>Cancelled</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

function SeverityBadge({ severity }: { severity: string }): JSX.Element {
  if (severity === "critical") return <Badge tone="danger" dotted>critical</Badge>;
  if (severity === "warning") return <Badge tone="warning" dotted>warning</Badge>;
  return <Badge tone="info" dotted>info</Badge>;
}

// Iter 6 — Lead time visual chip: green ≤7d, amber ≤14d, red >14d.
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

// Iter 6 — Approval badge with contextual tone.
function ApprovalBadge({ status }: { status: string | null }): JSX.Element {
  if (!status) return <span className="text-fg-faint">—</span>;
  const upper = status.toUpperCase();
  if (upper === "APPROVED") return <Badge tone="success">{status}</Badge>;
  if (upper.includes("PENDING")) return <Badge tone="warning">{status}</Badge>;
  if (upper === "REJECTED") return <Badge tone="danger">{status}</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

// Iter 10 — EditableField: label + (?) help popover + slot.
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

function EditableField({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          {label}
        </span>
        {help ? <FieldHelp label={label} help={help} /> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline cost edit cell (preserved from original).
// ---------------------------------------------------------------------------

interface CostPatchBody {
  std_cost_per_inv_uom: number | null;
  if_match_updated_at: string;
  idempotency_key: string;
}

async function patchSupplierItemCost(
  supplierItemId: string,
  body: CostPatchBody,
): Promise<void> {
  const res = await fetch(
    `/api/supplier-items/${encodeURIComponent(supplierItemId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error("Could not save changes. Check your connection and try again.");
  }
}

function CostEditCell({
  supplierItemId,
  updatedAt,
  currentCost,
  queryKey,
}: {
  supplierItemId: string;
  updatedAt: string;
  currentCost: string | null;
  queryKey: readonly unknown[];
}): JSX.Element {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentCost ?? "");
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: CostPatchBody) =>
      patchSupplierItemCost(supplierItemId, body),
    onSuccess: () => {
      setSaved(true);
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: queryKey as string[] });
    },
  });

  const handleSave = useCallback(() => {
    const trimmed = inputValue.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && (isNaN(parsed as number) || (parsed as number) < 0)) {
      return;
    }
    mutation.mutate({
      std_cost_per_inv_uom: parsed,
      if_match_updated_at: updatedAt,
      idempotency_key: crypto.randomUUID(),
    });
  }, [inputValue, updatedAt, mutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleSave();
      if (e.key === "Escape") { setEditing(false); setInputValue(currentCost ?? ""); setSaved(false); }
    },
    [handleSave, currentCost],
  );

  // Iter 13 — mutation feedback wrapped in aria-live region.
  if (editing) {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-atomic
        className="inline-flex items-center gap-1"
      >
        <input
          type="number"
          min="0"
          step="0.0001"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0.0000"
          autoFocus
          className="w-24 rounded border border-border px-1.5 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="rounded bg-accent px-1.5 py-0.5 text-xs text-accent-fg hover:opacity-80 disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => { setEditing(false); setInputValue(currentCost ?? ""); }}
          className="rounded px-1 py-0.5 text-xs text-fg-muted hover:text-fg"
        >
          ✕
        </button>
        {mutation.isError ? (
          <span className="text-xs text-danger-fg" title={(mutation.error as Error).message}>
            Error saving
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic
      className="inline-flex items-center gap-1.5"
    >
      {currentCost !== null && currentCost !== "" ? (
        <span className="font-mono text-xs text-fg">{currentCost}</span>
      ) : (
        <span className="text-fg-faint">—</span>
      )}
      {saved ? (
        <span className="text-xs text-success-fg">Saved</span>
      ) : null}
      <button
        onClick={() => { setEditing(true); setSaved(false); setInputValue(currentCost ?? ""); }}
        className="rounded px-1 py-0.5 text-3xs text-fg-subtle hover:bg-bg-subtle hover:text-fg"
      >
        Edit cost
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminSupplierDetailPage({
  params,
}: {
  params: Promise<{ supplier_id: string }>;
}): JSX.Element {
  const { supplier_id } = use(params);
  const queryClient = useQueryClient();

  const supplierQuery = useQuery<SuppliersListResponse>({
    queryKey: ["admin", "masters", "supplier", supplier_id],
    queryFn: () => fetchJson("/api/suppliers?limit=1000"),
  });
  const row = supplierQuery.data?.rows.find(
    (r) => r.supplier_id === supplier_id,
  );

  // Iter 2 — derive dropdown options from all supplier rows.
  const fieldOptions = useSupplierFieldOptions(supplierQuery.data?.rows);

  const supplierItemsQueryKey = [
    "admin",
    "masters",
    "supplier",
    supplier_id,
    "supplier-items",
  ] as const;

  const supplierItemsQuery = useQuery<SupplierItemsListResponse>({
    queryKey: supplierItemsQueryKey,
    queryFn: () =>
      fetchJson(
        `/api/supplier-items?supplier_id=${encodeURIComponent(supplier_id)}&limit=1000`,
      ),
  });

  const purchaseOrdersQuery = useQuery<PurchaseOrdersListResponse>({
    queryKey: ["admin", "masters", "supplier", supplier_id, "purchase-orders"],
    queryFn: () =>
      fetchJson(
        `/api/purchase-orders?supplier_id=${encodeURIComponent(supplier_id)}&limit=500`,
      ),
  });

  const exceptionsQuery = useQuery<ExceptionsListResponse>({
    queryKey: ["admin", "masters", "supplier", supplier_id, "exceptions"],
    queryFn: () => fetchJson("/api/exceptions?status=open,acknowledged&limit=1000"),
  });

  const componentsQuery = useQuery<ComponentsListResponse>({
    queryKey: ["admin", "components", "all"],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });

  const itemsQuery = useQuery<ItemsListResponse>({
    queryKey: ["admin", "items", "all"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  const [showAddSourcing, setShowAddSourcing] = useState(false);
  const [showStatusDrawer, setShowStatusDrawer] = useState(false);
  const [drawerStatusTarget, setDrawerStatusTarget] = useState<string>("");

  const { session } = useSession();
  const isAdmin = session.role === "admin";

  const supplierFieldMutation = useMutation({
    mutationFn: async (args: { field: string; value: unknown; updated_at: string }) =>
      patchEntity({
        url: `/api/suppliers/${encodeURIComponent(supplier_id)}`,
        fields: { [args.field]: args.value },
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "masters", "supplier", supplier_id] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (args: { newStatus: string; updated_at: string }) =>
      postStatus({
        url: `/api/suppliers/${encodeURIComponent(supplier_id)}/status`,
        status: args.newStatus,
        ifMatchUpdatedAt: args.updated_at,
      }),
    onSuccess: () => {
      setShowStatusDrawer(false);
      void queryClient.invalidateQueries({ queryKey: ["admin", "masters", "supplier", supplier_id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "suppliers"] });
    },
  });

  const supplierOptions: EntityOption[] = supplierQuery.data?.rows.map((s) => ({
    id: s.supplier_id,
    label: s.supplier_name_short ?? s.supplier_name_official,
    sublabel: s.supplier_id,
  })) ?? [];

  const componentOptions: EntityOption[] = componentsQuery.data?.rows.map((c) => ({
    id: c.component_id,
    label: c.component_name ?? c.component_id,
    sublabel: c.component_id,
  })) ?? [];

  const itemOptions: EntityOption[] = (itemsQuery.data?.rows ?? [])
    .filter((i) => i.supply_method === "BOUGHT_FINISHED")
    .map((i) => ({
      id: i.item_id,
      label: i.item_name ?? i.item_id,
      sublabel: i.sku ?? i.item_id,
    }));

  const relatedExceptions =
    exceptionsQuery.data?.rows.filter(
      (e) =>
        e.related_entity_id === supplier_id ||
        (e.related_entity_type === "supplier" &&
          e.related_entity_id === supplier_id),
    ) ?? [];

  // Sort critical exceptions first (iter 8).
  const sortedExceptions = useMemo(
    () =>
      [...relatedExceptions].sort((a, b) => {
        const rank = (s: string) => (s === "critical" ? 0 : s === "warning" ? 1 : 2);
        return rank(a.severity) - rank(b.severity);
      }),
    [relatedExceptions],
  );

  const allSi = supplierItemsQuery.data?.rows ?? [];
  const allPos = purchaseOrdersQuery.data?.rows ?? [];

  const hasCriticalException = relatedExceptions.some((e) => e.severity === "critical");
  const hasAnyException = relatedExceptions.length > 0;
  const hasActiveItems = allSi.length > 0;

  // Iter 4 — completeness checklist with deep-links.
  const detailPath = `/admin/masters/suppliers/${encodeURIComponent(supplier_id)}`;
  const completenessItems = useMemo((): CompletenessItem[] => {
    if (!row) return [];
    const hasShortName = !!row.supplier_name_short;
    const hasType = !!row.supplier_type;
    const hasActiveLinks = allSi.length > 0;
    const hasCost = allSi.some((si) => si.std_cost_per_inv_uom && parseFloat(si.std_cost_per_inv_uom) > 0);
    return [
      {
        label: "Name set",
        status: row.supplier_name_official ? "ok" : "error",
        detail: row.supplier_name_official ? undefined : "Official name is required.",
        href: `${detailPath}?tab=overview`,
      },
      // Iter 12 — fix-action buttons stop propagation so row nav doesn't fire.
      {
        label: "Short name set",
        status: hasShortName ? "ok" : "warn",
        detail: hasShortName
          ? `"${row.supplier_name_short!}"`
          : "Operators see the short name. Set it so labels are concise.",
        href: `${detailPath}?tab=overview`,
      },
      {
        label: "Supplier type set",
        status: hasType ? "ok" : "warn",
        detail: hasType ? row.supplier_type! : "Type drives planning and filtering workflows.",
        href: `${detailPath}?tab=overview`,
      },
      {
        label: "At least 1 active supplier item",
        status: hasActiveLinks ? "ok" : "warn",
        detail: hasActiveLinks ? `${allSi.length} item link(s)` : "No components or items linked.",
        href: `${detailPath}?tab=supplier-items`,
        fixAction: !hasActiveLinks && isAdmin ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowAddSourcing(true);
            }}
            className="rounded bg-warning-softer px-1.5 py-0.5 text-3xs font-semibold text-warning-fg hover:opacity-80"
          >
            Add link
          </button>
        ) : undefined,
      },
      {
        label: "Standard cost on a link",
        status: hasCost ? "ok" : "warn",
        detail: hasCost ? "At least one link has a cost set." : "No cost set on any sourcing link.",
        href: `${detailPath}?tab=supplier-items`,
      },
    ];
  }, [row, allSi, isAdmin, detailPath]);

  // Iter 4 — KPI strip.
  const kpis = useMemo((): KpiStat[] => {
    if (!row) return [];
    return [
      {
        label: "Items supplied",
        value: allSi.length,
        tone: allSi.length > 0 ? "success" : "warning",
        hint: allSi.length > 0 ? `${allSi.length} link(s)` : "None linked",
        href: `${detailPath}?tab=supplier-items`,
      },
      {
        label: "Open exceptions",
        value: relatedExceptions.length,
        tone: hasCriticalException ? "danger" : hasAnyException ? "warning" : "success",
        hint: hasCriticalException ? "Has critical" : hasAnyException ? "Review needed" : "All clear",
        href: relatedExceptions.length > 0 ? `${detailPath}?tab=exceptions` : undefined,
      },
      {
        label: "Last update",
        value: fmtRelative(row.updated_at),
        tone: "muted",
        hint: fmtDateTime(row.updated_at),
      },
    ];
  }, [row, allSi, relatedExceptions, hasCriticalException, hasAnyException, detailPath]);

  // Iter 14 — hero subtitle: {supplier_type} · {currency} (omit nulls).
  const heroSubtitle = useMemo(() => {
    if (!row) return undefined;
    const parts = [row.supplier_type, row.currency].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }, [row]);

  // Iter 5 — tab badge tones.
  const supplierItemsBadgeTone = hasActiveItems ? "success" as const : "warning" as const;
  const exceptionsBadgeTone = hasCriticalException ? "danger" as const : hasAnyException ? "warning" as const : "neutral" as const;
  const poHistoryBadgeTone: TabDescriptor["badgeTone"] = allPos.length > 0 ? "info" : "neutral";

  // ---------------------------------------------------------------------------
  // Header meta (iter 17 — correct tones for all status variants).
  // ---------------------------------------------------------------------------
  const headerMeta = row ? (
    <>
      <SupplierStatusBadge status={row.status} />
      {row.supplier_type ? <Badge tone="neutral" dotted>{row.supplier_type}</Badge> : null}
      {row.currency ? <Badge tone="neutral">{row.currency}</Badge> : null}
      {row.payment_terms ? <Badge tone="neutral">{row.payment_terms}</Badge> : null}
    </>
  ) : null;

  // ---------------------------------------------------------------------------
  // Tab: Overview (iter 9 — 3 SectionCards; iter 10 — EditableField + help).
  // ---------------------------------------------------------------------------

  const overviewTab: TabDescriptor = {
    key: "overview",
    label: "Overview",
    content: (() => {
      if (supplierQuery.isLoading) return <DetailTabLoading />;
      if (supplierQuery.isError) {
        return <DetailTabError message={(supplierQuery.error as Error).message} />;
      }
      if (!row) {
        return (
          <DetailTabEmpty
            message={`Supplier ${supplier_id} not found in the suppliers list.`}
            action={
              <Link href="/admin/suppliers" className="btn btn-sm btn-primary inline-flex">
                Back to suppliers
              </Link>
            }
          />
        );
      }

      // Locked fields for the collapsible (iter 11).
      const lockedFields: FieldRow[] = [
        { label: "Supplier code", value: row.supplier_id, mono: true },
        { label: "Official name", value: row.supplier_name_official },
        { label: "Currency", value: row.currency ?? "—", mono: true },
        { label: "Site", value: row.site_id, mono: true },
        { label: "Approval status", value: row.approval_status ?? "—" },
        { label: "Created", value: fmtDateTime(row.created_at) },
        { label: "Last updated", value: fmtDateTime(row.updated_at) },
      ];

      return (
        <div className="space-y-4 p-1">
          {/* Iter 9 — Card 1: Identity */}
          <SectionCard title="Identity" density="compact">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <EditableField
                label="Official name"
                help="The supplier's full legal name. Used on purchase orders and invoice matching."
              >
                {isAdmin ? (
                  <InlineEditCell
                    value={row.supplier_name_official}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "supplier_name_official", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit official name"
                  />
                ) : (
                  <span className="font-medium text-fg-strong">{row.supplier_name_official}</span>
                )}
              </EditableField>

              <EditableField
                label="Short name"
                help="The display name operators see throughout the portal and on printed documents. Should be concise (max ~20 characters)."
              >
                {isAdmin ? (
                  <InlineEditCell
                    value={row.supplier_name_short ?? ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "supplier_name_short", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit short name"
                  />
                ) : (
                  <span className="text-fg">{row.supplier_name_short ?? <span className="text-fg-faint">—</span>}</span>
                )}
              </EditableField>

              <EditableField
                label="Supplier type"
                help="Used to filter suppliers in planning workflows, PO creation, and reporting. Consistent values improve planning roll-ups."
              >
                {isAdmin ? (
                  // Iter 3 — InlineEditSelectCell for supplier_type.
                  <InlineEditSelectCell
                    value={row.supplier_type}
                    options={fieldOptions.supplier_type}
                    fieldLabel="Supplier type"
                    placeholder="— Select type —"
                    allowAdHoc
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "supplier_type", value: val || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit supplier type"
                  />
                ) : (
                  <span className="text-fg">{row.supplier_type ?? <span className="text-fg-faint">—</span>}</span>
                )}
              </EditableField>

              <EditableField
                label="Green Invoice Supplier ID"
                help="The Green Invoice supplier ID links this supplier to your Green Invoice account. Once set, the matching 'supplier not mapped' alert clears on the next sync. Copy the ID from the alert detail in your inbox."
              >
                {isAdmin ? (
                  <InlineEditCell
                    value={row.green_invoice_supplier_id ?? ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "green_invoice_supplier_id", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit Green Invoice supplier ID"
                  />
                ) : (
                  <span className="font-mono text-fg">{row.green_invoice_supplier_id ?? <span className="text-fg-faint">—</span>}</span>
                )}
              </EditableField>
            </div>
          </SectionCard>

          {/* Iter 9 — Card 2: Commercial terms */}
          <SectionCard title="Commercial terms" density="compact">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <EditableField
                label="Currency"
                help="The invoicing currency for this supplier. Affects cost calculations, PO totals, and Green Invoice reconciliation."
              >
                {isAdmin ? (
                  // Iter 3 — InlineEditSelectCell for currency.
                  <InlineEditSelectCell
                    value={row.currency}
                    options={fieldOptions.currency}
                    fieldLabel="Currency"
                    placeholder="— Select currency —"
                    allowAdHoc
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "currency", value: val || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit currency"
                  />
                ) : (
                  <span className="font-mono text-fg">{row.currency ?? <span className="text-fg-faint">—</span>}</span>
                )}
              </EditableField>

              <EditableField
                label="Payment terms"
                help="Standard payment terms (e.g. Net 30, Net 60). Affects purchase order approval rules and cash-flow planning."
              >
                {isAdmin ? (
                  // Iter 3 — InlineEditSelectCell for payment_terms.
                  <InlineEditSelectCell
                    value={row.payment_terms}
                    options={fieldOptions.payment_terms}
                    fieldLabel="Payment terms"
                    placeholder="— Select terms —"
                    allowAdHoc
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "payment_terms", value: val || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit payment terms"
                  />
                ) : (
                  <span className="text-fg">{row.payment_terms ?? <span className="text-fg-faint">—</span>}</span>
                )}
              </EditableField>

              <EditableField
                label="Default lead time (days)"
                help="Fallback lead time used in planning when no supplier-item override is set. Drives purchase recommendation timing."
              >
                {isAdmin ? (
                  <InlineEditCell
                    value={row.default_lead_time_days !== null ? String(row.default_lead_time_days) : ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "default_lead_time_days", value: val ? Number(val) : null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit default lead time"
                  />
                ) : (
                  <span className="font-mono text-fg">{row.default_lead_time_days ?? <span className="text-fg-faint">—</span>}</span>
                )}
              </EditableField>

              <EditableField
                label="Default min. order qty"
                help="The supplier's standard minimum order quantity. Used as a fallback when no per-item MOQ override is set."
              >
                {isAdmin ? (
                  <InlineEditCell
                    value={row.default_moq ?? ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "default_moq", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit default MOQ"
                  />
                ) : (
                  <span className="text-fg">{row.default_moq ?? <span className="text-fg-faint">—</span>}</span>
                )}
              </EditableField>
            </div>
          </SectionCard>

          {/* Iter 9 — Card 3: Contact */}
          <SectionCard title="Contact" density="compact">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <EditableField label="Contact name">
                {isAdmin ? (
                  <InlineEditCell
                    value={row.primary_contact_name ?? ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "primary_contact_name", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit contact name"
                  />
                ) : (
                  <span className="text-fg">{row.primary_contact_name ?? <span className="text-fg-faint">—</span>}</span>
                )}
              </EditableField>

              <EditableField label="Phone">
                {isAdmin ? (
                  <InlineEditCell
                    value={row.primary_contact_phone ?? ""}
                    onSave={(val) =>
                      supplierFieldMutation.mutateAsync({ field: "primary_contact_phone", value: (val as string) || null, updated_at: row.updated_at }) as Promise<void>
                    }
                    ariaLabel="Edit phone"
                  />
                ) : (
                  <span className="text-fg">{row.primary_contact_phone ?? <span className="text-fg-faint">—</span>}</span>
                )}
              </EditableField>
            </div>
          </SectionCard>

          {/* Iter 11 — Technical details collapsible with lock explanation. */}
          <details className="group rounded-md border border-border/50 bg-bg-subtle transition-colors open:bg-bg-subtle/60">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs text-fg-muted group-open:border-b group-open:border-border/50">
              Technical details (locked fields)
            </summary>
            <div className="px-3 py-3">
              <p className="mb-3 text-xs text-fg-subtle leading-relaxed">
                These fields are locked because changing them requires a migration or an integration update.
                <strong className="font-semibold text-fg-muted"> supplier_id</strong> is the stable primary key referenced
                by purchase orders, supplier-items, and Green Invoice mappings — it cannot be renamed without
                rewriting those references. Contact engineering to change locked fields.
              </p>
              <DetailFieldGrid rows={lockedFields} />
            </div>
          </details>

          {/* Iter 13 — mutation feedback with aria-live. */}
          {supplierFieldMutation.isError || supplierFieldMutation.isPending ? (
            <p
              role="status"
              aria-live="polite"
              aria-atomic
              className={cn(
                "text-xs",
                supplierFieldMutation.isPending ? "text-fg-muted" : "text-danger-fg",
              )}
            >
              {supplierFieldMutation.isPending
                ? "Saving…"
                : supplierFieldMutation.error instanceof AdminMutationError
                  ? supplierFieldMutation.error.message
                  : "Save failed. Please try again."}
            </p>
          ) : null}

          {/* FLOW-004 — confirm the GI link saved and point back to the inbox so
              the operator knows the gi_unmapped_supplier exception will clear. */}
          {supplierFieldMutation.isSuccess &&
          supplierFieldMutation.variables?.field === "green_invoice_supplier_id" ? (
            <p
              role="status"
              aria-live="polite"
              aria-atomic
              className="text-xs text-success-fg"
            >
              Green Invoice supplier ID saved. The{" "}
              <span className="font-medium">gi_unmapped_supplier</span> exception
              clears on the next GI sync.{" "}
              <Link href="/inbox?view=exceptions" className="link font-medium">
                Back to inbox to verify →
              </Link>
            </p>
          ) : null}
        </div>
      );
    })(),
  };

  // ---------------------------------------------------------------------------
  // Tab: Supplier items (iter 6).
  // ---------------------------------------------------------------------------

  const supplierItemsTab: TabDescriptor = {
    key: "supplier-items",
    label: "Items supplied",
    badge: allSi.length > 0 ? `${allSi.length}` : undefined,
    badgeTone: supplierItemsBadgeTone,
    content: (() => {
      if (supplierItemsQuery.isLoading) return <DetailTabLoading />;
      if (supplierItemsQuery.isError) {
        return (
          <DetailTabError message={(supplierItemsQuery.error as Error).message} />
        );
      }
      const addButton = (
        <div className="flex justify-end px-1 pt-1 pb-2">
          {isAdmin ? (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => setShowAddSourcing(true)}
            >
              + Add sourcing link
            </button>
          ) : null}
        </div>
      );

      if (allSi.length === 0) {
        return (
          <div className="space-y-3">
            {addButton}
            <SectionCard tone="warning" density="compact">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge tone="warning" dotted>No items linked</Badge>
                </div>
                <p className="text-sm text-fg-muted">
                  This supplier has no components or products linked yet. Without sourcing links, the planning engine cannot include this supplier in purchase recommendations.
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-fg-muted list-disc list-inside">
                  <li>Use <strong>Add sourcing link</strong> to connect raw materials (components) or finished goods (BOUGHT_FINISHED items).</li>
                  <li>Set a standard cost per sourcing link so the planning engine can compute order values.</li>
                </ul>
                {isAdmin ? (
                  <button
                    type="button"
                    className="btn-primary btn-sm mt-2"
                    onClick={() => setShowAddSourcing(true)}
                  >
                    + Add first sourcing link
                  </button>
                ) : null}
              </div>
            </SectionCard>
          </div>
        );
      }

      // Iter 6 — primary supplier-item hero card above the table.
      const primaryItems = allSi.filter((si) => si.is_primary);
      const primaryItem = primaryItems[0] ?? null;

      return (
        <div className="space-y-3">
          {addButton}

          {primaryItem ? (
            <SectionCard tone="success" density="compact" eyebrow="Primary sourcing link" title={
              primaryItem.component_id
                ? `Component: ${primaryItem.component_id}`
                : primaryItem.item_id
                  ? `Item: ${primaryItem.item_id}`
                  : "Primary link"
            }>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle block mb-0.5">Lead time</span>
                  <LeadTimeChip days={primaryItem.lead_time_days} />
                </div>
                <div>
                  <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle block mb-0.5">Order UoM</span>
                  <span className="font-mono text-fg">{primaryItem.order_uom ?? "—"}</span>
                </div>
                <div>
                  <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle block mb-0.5">MOQ</span>
                  <span className="font-mono text-fg">{primaryItem.moq ?? "—"}</span>
                </div>
                <div>
                  <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle block mb-0.5">Approval</span>
                  <ApprovalBadge status={primaryItem.approval_status} />
                </div>
                <div>
                  <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle block mb-0.5">Std cost</span>
                  <span className="font-mono text-fg">{primaryItem.std_cost_per_inv_uom ?? "—"}</span>
                </div>
                {primaryItem.component_id ? (
                  <Link
                    href={`/admin/masters/components/${encodeURIComponent(primaryItem.component_id)}`}
                    className="text-accent hover:underline text-xs"
                  >
                    View component →
                  </Link>
                ) : primaryItem.item_id ? (
                  <Link
                    href={`/admin/masters/items/${encodeURIComponent(primaryItem.item_id)}`}
                    className="text-accent hover:underline text-xs"
                  >
                    View item →
                  </Link>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {/* Iter 16 — overflow-x-auto wrapper for mobile. */}
          <SectionCard density="compact" contentClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/70 bg-bg-subtle/60">
                    <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Kind</th>
                    <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Target</th>
                    <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Relationship</th>
                    <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Primary</th>
                    <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Order UoM</th>
                    <th scope="col" className="px-3 py-2 text-center text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Lead</th>
                    <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Approval</th>
                    <th scope="col" className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Std cost (ILS)</th>
                  </tr>
                </thead>
                <tbody>
                  {allSi.map((r) => (
                    <tr
                      key={r.supplier_item_id}
                      className={cn(
                        "border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40",
                        r.is_primary && "bg-success-softer/20",
                      )}
                    >
                      <td className="px-3 py-2 text-fg-muted">
                        {r.component_id ? "component" : r.item_id ? "item" : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.component_id ? (
                          <Link
                            href={`/admin/masters/components/${encodeURIComponent(r.component_id)}`}
                            className="text-fg hover:text-accent"
                          >
                            {r.component_id}
                          </Link>
                        ) : r.item_id ? (
                          <Link
                            href={`/admin/masters/items/${encodeURIComponent(r.item_id)}`}
                            className="text-fg hover:text-accent"
                          >
                            {r.item_id}
                          </Link>
                        ) : (
                          <span className="text-fg-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-fg-muted">{r.relationship ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.is_primary ? (
                          <Badge tone="success" dotted>primary</Badge>
                        ) : (
                          <span className="text-fg-faint">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-fg-muted">{r.order_uom ?? "—"}</td>
                      <td className="px-3 py-2 text-center">
                        <LeadTimeChip days={r.lead_time_days} />
                      </td>
                      <td className="px-3 py-2">
                        <ApprovalBadge status={r.approval_status} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <CostEditCell
                          supplierItemId={r.supplier_item_id}
                          updatedAt={r.updated_at}
                          currentCost={r.std_cost_per_inv_uom}
                          queryKey={supplierItemsQueryKey}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      );
    })(),
  };

  // ---------------------------------------------------------------------------
  // Tab: PO history (iter 7).
  // ---------------------------------------------------------------------------

  const poHistoryTab: TabDescriptor = {
    key: "po-history",
    label: "PO history",
    badge: allPos.length > 0 ? `${allPos.length}` : undefined,
    badgeTone: poHistoryBadgeTone,
    content: (() => {
      if (purchaseOrdersQuery.isLoading) return <DetailTabLoading />;
      if (purchaseOrdersQuery.isError) {
        return <DetailTabError message={(purchaseOrdersQuery.error as Error).message} />;
      }

      if (allPos.length === 0) {
        return (
          <SectionCard density="compact">
            <div className="space-y-3 text-center py-4">
              <div className="text-3xl text-fg-faint">📦</div>
              <p className="text-sm font-medium text-fg-strong">No purchase orders against this supplier yet.</p>
              <p className="text-xs text-fg-muted">
                Once the planning engine generates recommendations and a planner approves them, purchase orders will appear here.
              </p>
              <Link
                href={`/purchase-orders/new?supplier_id=${encodeURIComponent(supplier_id)}`}
                className="btn btn-primary btn-sm inline-flex"
              >
                Create a PO
              </Link>
            </div>
          </SectionCard>
        );
      }

      // Iter 7 — group by status, show last 10 total.
      const last10 = allPos.slice(0, 10);
      const grouped: Record<string, PurchaseOrderRow[]> = {};
      for (const po of last10) {
        const grp = grouped[po.status] ?? [];
        grp.push(po);
        grouped[po.status] = grp;
      }
      const statusOrder = ["OPEN", "PARTIAL", "RECEIVED", "CANCELLED"];
      const sortedGroups = statusOrder
        .filter((s) => grouped[s]?.length)
        .map((s) => ({ status: s, rows: grouped[s] }));

      return (
        <div className="space-y-4">
          {sortedGroups.map(({ status, rows }) => (
            <SectionCard
              key={status}
              eyebrow="Purchase orders"
              title={<POStatusBadge status={status} />}
              density="compact"
              contentClassName="p-0"
            >
              {/* Iter 16 — overflow-x-auto for mobile. */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border/70 bg-bg-subtle/60">
                      <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">PO number</th>
                      <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Order date</th>
                      <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Expected receive</th>
                      <th scope="col" className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Total net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr
                        key={p.po_id}
                        className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                      >
                        <td className="px-3 py-2 font-mono text-xs">
                          <Link
                            href={`/purchase-orders/${encodeURIComponent(p.po_id)}`}
                            className="text-fg hover:text-accent"
                          >
                            {p.po_number}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-fg-muted">{fmtDate(p.order_date)}</td>
                        <td className="px-3 py-2 text-fg-muted">{fmtDate(p.expected_receive_date)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-fg">
                          {p.total_net} <span className="text-fg-faint">{p.currency}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ))}
          {allPos.length > 10 ? (
            <p className="text-xs text-fg-muted text-center">
              Showing last 10 of {allPos.length} orders.
            </p>
          ) : null}
        </div>
      );
    })(),
  };

  // ---------------------------------------------------------------------------
  // Tab: Exceptions (iter 8).
  // ---------------------------------------------------------------------------

  const exceptionsTab: TabDescriptor = {
    key: "exceptions",
    label: "Exceptions",
    badge: relatedExceptions.length > 0 ? `${relatedExceptions.length}` : undefined,
    badgeTone: exceptionsBadgeTone,
    content: (() => {
      if (exceptionsQuery.isLoading) return <DetailTabLoading />;
      if (exceptionsQuery.isError) {
        return <DetailTabError message={(exceptionsQuery.error as Error).message} />;
      }

      // Iter 8 — green "All clear" empty state.
      if (sortedExceptions.length === 0) {
        return (
          <SectionCard tone="success" density="compact">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>✓</span>
              <div>
                <p className="text-sm font-semibold text-success-fg">All clear</p>
                <p className="text-xs text-fg-muted">No open or acknowledged exceptions linked to this supplier.</p>
              </div>
            </div>
          </SectionCard>
        );
      }

      return (
        <SectionCard
          density="compact"
          contentClassName="p-0"
          actions={
            <Link
              href="/inbox?view=exceptions"
              className="text-xs text-accent hover:underline"
            >
              View all in Inbox →
            </Link>
          }
          title="Open exceptions"
        >
          <ul className="divide-y divide-border/40">
            {sortedExceptions.map((e) => (
              <li
                key={e.exception_id}
                className={cn(
                  "flex items-start gap-3 px-4 py-2.5 text-xs",
                  e.severity === "critical" && "bg-danger-softer/20",
                )}
              >
                <SeverityBadge severity={e.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-fg">{e.title}</span>
                    <Badge tone={e.status === "acknowledged" ? "warning" : "neutral"}>
                      {e.status}
                    </Badge>
                  </div>
                  {e.detail ? (
                    <div className="mt-0.5 truncate text-fg-muted">{e.detail}</div>
                  ) : null}
                  <div className="mt-0.5 text-3xs text-fg-faint">
                    {e.category} · {fmtDateTime(e.created_at)}
                  </div>
                </div>
                {/* Iter 8 — "Triage →" CTA per row. */}
                <Link
                  href={`/inbox?view=exceptions&exception_id=${encodeURIComponent(e.exception_id)}`}
                  className="shrink-0 rounded px-2 py-1 text-3xs font-semibold text-accent border border-accent/30 hover:bg-accent/5 transition-colors"
                >
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
    supplierItemsTab,
    poHistoryTab,
    exceptionsTab,
  ];

  // --- Linkage card --------------------------------------------------------
  const linkages: LinkageGroup[] = [];

  const sourcedComponents = Array.from(
    new Set(allSi.filter((si) => si.component_id).map((si) => si.component_id!)),
  );
  linkages.push({
    label: "Components sourced",
    items: sourcedComponents.slice(0, 10).map((cid) => ({
      label: cid,
      href: `/admin/masters/components/${encodeURIComponent(cid)}`,
    })),
    emptyText: "No components sourced.",
  });

  linkages.push({
    label: "Recent POs",
    items: allPos.slice(0, 5).map((p) => ({
      label: p.po_number,
      href: `/purchase-orders/${encodeURIComponent(p.po_id)}`,
      subtitle: fmtDate(p.order_date),
      badge: <POStatusBadge status={p.status} />,
    })),
    emptyText: "No purchase orders yet.",
  });

  if (row?.green_invoice_supplier_id) {
    linkages.push({
      label: "Green Invoice mapping",
      items: [
        {
          label: row.green_invoice_supplier_id,
          href: `/admin/integrations`,
          subtitle: "gi_supplier_id",
          badge: <Badge tone="info" dotted>GI</Badge>,
        },
      ],
    });
  }

  linkages.push({
    label: "Exceptions",
    items: relatedExceptions.slice(0, 5).map((e) => ({
      label: e.title.slice(0, 48),
      href: `/inbox?view=exceptions&exception_id=${encodeURIComponent(e.exception_id)}`,
      badge: <SeverityBadge severity={e.severity} />,
    })),
    emptyText: "No open exceptions for this supplier.",
  });

  return (
    <>
      {/* Iter 15 — reveal-on-mount wrapper. */}
      {row ? (
        <div className="reveal-on-mount mb-4">
          <MasterSummaryCard
            name={row.supplier_name_official}
            code={row.supplier_id}
            entityType="Supplier"
            status={row.status}
            completeness={completenessItems}
            kpis={kpis}
            subtitle={heroSubtitle}
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
      ) : null}

      <ClassWEditDrawer
        open={showStatusDrawer}
        onClose={() => setShowStatusDrawer(false)}
        title={drawerStatusTarget === "INACTIVE" ? "Archive supplier" : "Restore supplier"}
        warning={
          drawerStatusTarget === "INACTIVE"
            ? "Archiving this supplier hides it from sourcing workflows and purchase order creation. Existing POs and sourcing links are not deleted."
            : "Restoring this supplier makes it available again for sourcing and purchase order creation."
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
            ? "This will set the supplier status to Archived."
            : "This will set the supplier status to Active."}
        </p>
      </ClassWEditDrawer>

      {/* Iter 18 — header: eyebrow, title = supplier_name_official, description = supplier_id. */}
      <DetailPage
        header={{
          eyebrow: "Admin · Suppliers",
          title: row ? row.supplier_name_official : supplier_id,
          description: row ? `Supplier ${row.supplier_id}` : "Loading supplier…",
          meta: headerMeta,
          actions: (
            <Link href="/admin/suppliers" className="btn btn-ghost btn-sm">
              Back to suppliers
            </Link>
          ),
        }}
        tabs={tabs}
        linkages={linkages}
      />

      <QuickCreateSupplierItem
        open={showAddSourcing}
        onClose={() => setShowAddSourcing(false)}
        onCreated={() => {
          setShowAddSourcing(false);
          void queryClient.invalidateQueries({ queryKey: supplierItemsQueryKey as unknown as string[] });
        }}
        suppliers={supplierOptions}
        components={componentOptions}
        items={itemOptions}
        defaultSupplierId={supplier_id}
      />
    </>
  );
}
