"use client";

// ---------------------------------------------------------------------------
// Admin: Master Data Health -- UX iters 1-5
//   1. SummaryCard panel with total issues + checked-at time + ShieldCheck
//   2. (combined with 1)
//   3. HealthSection tone prop -- danger for checks 1+2, warning for check 3
//   4. CtaLink with ArrowUpRight icon
//   5. Per-section empty state: No issues in this category.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle, Clock, ArrowUpRight, ShieldCheck } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";

interface ComponentRow {
  component_id: string;
  component_name: string | null;
  status: string;
  primary_supplier_id: string | null;
}

interface ItemRow {
  item_id: string;
  item_name: string | null;
  supply_method: string;
  status: string;
}

interface BomHeadRow {
  bom_head_id: string;
  parent_ref_id: string;
  active_version_id: string | null;
}

type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Iter 1+2 -- SummaryCard
// ---------------------------------------------------------------------------

function SummaryCard({
  totalIssues,
  checkedAt,
  isLoading,
}: {
  totalIssues: number;
  checkedAt: Date;
  isLoading: boolean;
}): JSX.Element {
  const timeStr = checkedAt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <SectionCard
      eyebrow="Summary"
      title={
        isLoading
          ? "Checking master data…"
          : totalIssues === 0
            ? "All checks passed"
            : `${totalIssues} issue${totalIssues !== 1 ? "s" : ""} found`
      }
      contentClassName="px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm">
        <div className="flex items-center gap-2 text-fg-muted">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs">Checked at {timeStr}</span>
        </div>
        {!isLoading && totalIssues === 0 ? (
          <div className="flex items-center gap-2 text-success-fg">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs font-medium">
              Master data is clean — safe to run planning.
            </span>
          </div>
        ) : null}
        {!isLoading && totalIssues > 0 ? (
          <div className="flex items-center gap-2 text-warning-fg">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="text-xs font-medium">
              Fix issues below before running planning or generating recommendations.
            </span>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Iter 4 -- CtaLink
// ---------------------------------------------------------------------------

function CtaLink({
  href,
  label,
  tone = "default",
}: {
  href: string;
  label: string;
  tone?: "default" | "warning";
}): JSX.Element {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium hover:bg-bg-subtle ${
        tone === "warning" ? "text-warning-fg" : "text-accent"
      }`}
    >
      <ArrowUpRight className="h-3 w-3 shrink-0" />
      {label}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Iter 3 -- HealthSection with tone prop
// ---------------------------------------------------------------------------

function HealthSection({
  title,
  description,
  count,
  tone = "default",
  children,
}: {
  title: string;
  description: string;
  count: number;
  tone?: "default" | "danger" | "warning";
  children: React.ReactNode;
}): JSX.Element {
  const activeTone = count === 0 ? "default" : tone;
  return (
    <SectionCard
      eyebrow={count === 0 ? "OK" : `${count} issue${count !== 1 ? "s" : ""}`}
      title={title}
      tone={activeTone}
      contentClassName="p-0"
    >
      <p className="px-4 pt-3 pb-2 text-xs text-fg-muted">{description}</p>
      {count === 0 ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-success-fg">
          <CheckCircle className="h-4 w-4" />
          No issues in this category.
        </div>
      ) : (
        children
      )}
    </SectionCard>
  );
}

function IssueTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/70 bg-bg-subtle/60">
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr
              key={i}
              className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
            >
              {cells.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-xs">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminMasterDataHealthPage(): JSX.Element {
  const checkedAt = useMemo(() => new Date(), []);

  const componentsQuery = useQuery<ListEnvelope<ComponentRow>>({
    queryKey: ["admin", "health", "components"],
    queryFn: () => fetchJson("/api/components?limit=1000"),
  });

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "health", "items"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
  });

  const bomsQuery = useQuery<ListEnvelope<BomHeadRow>>({
    queryKey: ["admin", "health", "bom-heads"],
    queryFn: () => fetchJson("/api/boms/heads?limit=1000"),
  });

  const isLoading =
    componentsQuery.isLoading || itemsQuery.isLoading || bomsQuery.isLoading;
  const isError =
    componentsQuery.isError || itemsQuery.isError || bomsQuery.isError;

  const {
    componentsNoSupplier,
    itemsNoActiveBom,
    pendingComponents,
    pendingItems,
  } = useMemo(() => {
    const allComponents = componentsQuery.data?.rows ?? [];
    const allItems = itemsQuery.data?.rows ?? [];
    const allBoms = bomsQuery.data?.rows ?? [];

    const bomsByParentRef = new Map<string, BomHeadRow>();
    for (const b of allBoms) {
      bomsByParentRef.set(b.parent_ref_id, b);
    }

    const componentsNoSupplier = allComponents.filter(
      (c) => c.status === "ACTIVE" && !c.primary_supplier_id,
    );

    const itemsNoActiveBom = allItems.filter((item) => {
      if (item.supply_method !== "MANUFACTURED" && item.supply_method !== "REPACK") return false;
      if (item.status !== "ACTIVE") return false;
      const bom = bomsByParentRef.get(item.item_id);
      return !bom || !bom.active_version_id;
    });

    const pendingComponents = allComponents.filter((c) => c.status === "PENDING");
    const pendingItems = allItems.filter((i) => i.status === "PENDING");

    return { componentsNoSupplier, itemsNoActiveBom, pendingComponents, pendingItems };
  }, [componentsQuery.data, itemsQuery.data, bomsQuery.data]);

  const totalIssues =
    componentsNoSupplier.length +
    itemsNoActiveBom.length +
    pendingComponents.length +
    pendingItems.length;

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · Masters"
        title="Master data health"
        description="Actionable gaps in master data. Fix these before running planning or generating recommendations."
        meta={
          isLoading ? (
            <Badge tone="neutral" dotted>Loading…</Badge>
          ) : isError ? (
            <Badge tone="danger" dotted>Error loading data</Badge>
          ) : totalIssues === 0 ? (
            <Badge tone="success" dotted>All clear</Badge>
          ) : (
            <Badge tone="warning" dotted>
              {totalIssues} issue{totalIssues !== 1 ? "s" : ""}
            </Badge>
          )
        }
      />

      <SummaryCard
        totalIssues={totalIssues}
        checkedAt={checkedAt}
        isLoading={isLoading}
      />

      {isError ? (
        <div className="rounded-md border border-danger/40 bg-danger-softer p-4 text-sm text-danger-fg">
          <div className="font-semibold">Could not load master data health</div>
          <div className="mt-1 text-xs">Check your connection. Health checks will rerun once the API is reachable.</div>
          <button
            type="button"
            onClick={() => {
              void componentsQuery.refetch();
              void itemsQuery.refetch();
              void bomsQuery.refetch();
            }}
            className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* On error, do not render the HealthSections — a failed load must
          never show a green "no issues" all-clear. */}
      {!isError && (
        <>
      {/* Check 1: Active components missing a primary supplier */}
      <HealthSection
        title="Components missing a primary supplier"
        description="Active raw materials and packaging with no primary supplier set. Planning cannot compute purchase requirements for these."
        count={componentsNoSupplier.length}
        tone="danger"
      >
        <IssueTable
          headers={["Code", "Name", "Action"]}
          rows={componentsNoSupplier.map((c) => [
            <Link
              key={`${c.component_id}-code`}
              href={`/admin/masters/components/${encodeURIComponent(c.component_id)}`}
              className="font-mono text-fg hover:text-accent"
            >
              {c.component_id}
            </Link>,
            <span key={`${c.component_id}-name`} className="text-fg-muted">{c.component_name ?? "—"}</span>,
            <CtaLink
              key={`${c.component_id}-action`}
              href={`/admin/masters/components/${encodeURIComponent(c.component_id)}?tab=supplier-items`}
              label="Add supplier"
            />,
          ])}
        />
      </HealthSection>

      {/* Check 2: Manufactured/Repack items missing an active BOM */}
      <HealthSection
        title="Manufactured / repack items without an active recipe"
        description="Active items that are produced or repacked but have no active BOM version. Production Actual and BOM simulation will fail for these."
        count={itemsNoActiveBom.length}
        tone="danger"
      >
        <IssueTable
          headers={["Item ID", "Name", "Supply method", "Action"]}
          rows={itemsNoActiveBom.map((item) => [
            <Link
              key={`${item.item_id}-code`}
              href={`/admin/masters/items/${encodeURIComponent(item.item_id)}`}
              className="font-mono text-fg hover:text-accent"
            >
              {item.item_id}
            </Link>,
            <span key={`${item.item_id}-name`} className="text-fg-muted">{item.item_name ?? "—"}</span>,
            <Badge key={`${item.item_id}-supply-method`} tone="info" dotted>
              {item.supply_method === "MANUFACTURED" ? "Manufactured" : "Repack"}
            </Badge>,
            <CtaLink
              key={`${item.item_id}-action`}
              href={`/admin/masters/items/${encodeURIComponent(item.item_id)}?tab=bom`}
              label="Open BOM"
            />,
          ])}
        />
      </HealthSection>

      {/* Check 3: PENDING records */}
      <HealthSection
        title="Records stuck in Pending status"
        description="Items or components with PENDING status are not included in planning. Activate them when ready or deactivate to exclude permanently."
        count={pendingComponents.length + pendingItems.length}
        tone="warning"
      >
        <IssueTable
          headers={["Type", "Code", "Name", "Action"]}
          rows={[
            ...pendingComponents.map((c) => [
              <Badge key={`component-${c.component_id}-type`} tone="neutral" dotted>Component</Badge>,
              <Link
                key={`component-${c.component_id}-code`}
                href={`/admin/masters/components/${encodeURIComponent(c.component_id)}`}
                className="font-mono text-fg hover:text-accent"
              >
                {c.component_id}
              </Link>,
              <span key={`component-${c.component_id}-name`} className="text-fg-muted">{c.component_name ?? "—"}</span>,
              <CtaLink
                key={`component-${c.component_id}-action`}
                href={`/admin/masters/components/${encodeURIComponent(c.component_id)}`}
                label="Review"
                tone="warning"
              />,
            ]),
            ...pendingItems.map((i) => [
              <Badge key={`item-${i.item_id}-type`} tone="neutral" dotted>Item</Badge>,
              <Link
                key={`item-${i.item_id}-code`}
                href={`/admin/masters/items/${encodeURIComponent(i.item_id)}`}
                className="font-mono text-fg hover:text-accent"
              >
                {i.item_id}
              </Link>,
              <span key={`item-${i.item_id}-name`} className="text-fg-muted">{i.item_name ?? "—"}</span>,
              <CtaLink
                key={`item-${i.item_id}-action`}
                href={`/admin/masters/items/${encodeURIComponent(i.item_id)}`}
                label="Review"
                tone="warning"
              />,
            ]),
          ]}
        />
      </HealthSection>
        </>
      )}
    </>
  );
}
