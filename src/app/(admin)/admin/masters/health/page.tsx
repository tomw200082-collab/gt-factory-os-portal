"use client";

// ---------------------------------------------------------------------------
// Admin · Master Data Health — corridor 7.
//
// Surfaces actionable gaps in master data so admins can fix records
// without hunting through individual list pages.
//
// Checks (all computed client-side from existing API calls):
//   1. Components missing a primary supplier
//   2. Manufactured / Repack items missing an active BOM
//   3. Items or components with PENDING status (stuck in draft)
//
// /admin/masters/health
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle } from "lucide-react";
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

function HealthSection({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <SectionCard
      eyebrow={count === 0 ? "OK" : `${count} issue${count !== 1 ? "s" : ""}`}
      title={title}
      contentClassName="p-0"
    >
      <p className="px-4 pt-3 pb-2 text-xs text-fg-muted">{description}</p>
      {count === 0 ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-success-fg">
          <CheckCircle className="h-4 w-4" />
          All clear
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

      {isError ? (
        <div className="rounded-md border border-danger/40 bg-danger-softer p-4 text-sm text-danger-fg">
          Failed to load data. Check your connection and refresh.
        </div>
      ) : null}

      {/* Check 1: Active components missing a primary supplier */}
      <HealthSection
        title="Components missing a primary supplier"
        description="Active raw materials and packaging with no primary supplier set. Planning cannot compute purchase requirements for these."
        count={componentsNoSupplier.length}
      >
        <IssueTable
          headers={["Code", "Name", "Action"]}
          rows={componentsNoSupplier.map((c) => [
            <Link
              href={`/admin/masters/components/${encodeURIComponent(c.component_id)}`}
              className="font-mono text-fg hover:text-accent"
            >
              {c.component_id}
            </Link>,
            <span className="text-fg-muted">{c.component_name ?? "—"}</span>,
            <Link
              href={`/admin/masters/components/${encodeURIComponent(c.component_id)}?tab=supplier-items`}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-accent hover:bg-bg-subtle"
            >
              <AlertTriangle className="h-3 w-3" />
              Add supplier →
            </Link>,
          ])}
        />
      </HealthSection>

      {/* Check 2: Manufactured/Repack items missing an active BOM */}
      <HealthSection
        title="Manufactured / repack items without an active recipe"
        description="Active items that are produced or repacked but have no active BOM version. Production Actual and BOM simulation will fail for these."
        count={itemsNoActiveBom.length}
      >
        <IssueTable
          headers={["Item ID", "Name", "Supply method", "Action"]}
          rows={itemsNoActiveBom.map((item) => [
            <Link
              href={`/admin/masters/items/${encodeURIComponent(item.item_id)}`}
              className="font-mono text-fg hover:text-accent"
            >
              {item.item_id}
            </Link>,
            <span className="text-fg-muted">{item.item_name ?? "—"}</span>,
            <Badge tone="info" dotted>
              {item.supply_method === "MANUFACTURED" ? "Manufactured" : "Repack"}
            </Badge>,
            <Link
              href={`/admin/masters/boms`}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-accent hover:bg-bg-subtle"
            >
              <AlertTriangle className="h-3 w-3" />
              Open BOMs →
            </Link>,
          ])}
        />
      </HealthSection>

      {/* Check 3: PENDING records */}
      {(pendingComponents.length > 0 || pendingItems.length > 0) ? (
        <HealthSection
          title="Records stuck in Pending status"
          description="Items or components with PENDING status are not included in planning. Activate them when ready or deactivate to exclude permanently."
          count={pendingComponents.length + pendingItems.length}
        >
          <IssueTable
            headers={["Type", "Code", "Name", "Action"]}
            rows={[
              ...pendingComponents.map((c) => [
                <Badge tone="neutral" dotted>Component</Badge>,
                <Link
                  href={`/admin/masters/components/${encodeURIComponent(c.component_id)}`}
                  className="font-mono text-fg hover:text-accent"
                >
                  {c.component_id}
                </Link>,
                <span className="text-fg-muted">{c.component_name ?? "—"}</span>,
                <Link
                  href={`/admin/masters/components/${encodeURIComponent(c.component_id)}`}
                  className="text-accent hover:underline text-xs"
                >
                  Review →
                </Link>,
              ]),
              ...pendingItems.map((i) => [
                <Badge tone="neutral" dotted>Item</Badge>,
                <Link
                  href={`/admin/masters/items/${encodeURIComponent(i.item_id)}`}
                  className="font-mono text-fg hover:text-accent"
                >
                  {i.item_id}
                </Link>,
                <span className="text-fg-muted">{i.item_name ?? "—"}</span>,
                <Link
                  href={`/admin/masters/items/${encodeURIComponent(i.item_id)}`}
                  className="text-accent hover:underline text-xs"
                >
                  Review →
                </Link>,
              ]),
            ]}
          />
        </HealthSection>
      ) : (
        <HealthSection
          title="Records stuck in Pending status"
          description="Items or components with PENDING status are not included in planning."
          count={0}
        >
          {null}
        </HealthSection>
      )}
    </>
  );
}
