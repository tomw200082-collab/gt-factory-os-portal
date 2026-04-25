"use client";

// ---------------------------------------------------------------------------
// Admin · BOM head detail — AMMC v1 Slice 6 UI.
//
// /admin/boms/[head_id]
//
// Header: item summary + current active version summary.
// Table of versions for this head: version_id (short), version_label,
// status, line_count, created_at, action column (link to editor).
//
// "New draft" button → POST /api/boms/versions with { head_id,
// clone_from_version_id: <current active or null>, idempotency_key } →
// navigates to /admin/boms/[head_id]/versions/[new_version_id].
//
// Backend surfaces consumed:
//   GET /api/boms/heads?limit=1000
//   GET /api/boms/versions?bom_head_id=<head_id>&limit=1000
//   GET /api/items?limit=1000        (for item_name)
//   POST /api/boms/versions           (draft create — Slice 2)
//   GET /api/boms/lines?bom_version_id=<id>   (per-row line count)
// ---------------------------------------------------------------------------

import { useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { AdminMutationError } from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";

interface BomHeadRow {
  bom_head_id: string;
  bom_kind: string;
  display_family: string | null;
  parent_ref_id: string;
  parent_name: string | null;
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
  updated_at: string;
}

interface BomLineRow {
  line_id: string;
  bom_version_id: string;
}

interface ItemRow {
  item_id: string;
  item_name: string;
  supply_method: string;
  sales_uom: string | null;
}

type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

function randomIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

interface PageProps {
  params: Promise<{ head_id: string }>;
}

export default function AdminBomHeadDetailPage({
  params,
}: PageProps): JSX.Element {
  const { head_id } = use(params);
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();
  const router = useRouter();

  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);

  const headsQuery = useQuery<ListEnvelope<BomHeadRow>>({
    queryKey: ["admin", "bom_head", "all"],
    queryFn: () => fetchJson("/api/boms/heads?limit=1000"),
  });
  const head = useMemo(() => {
    return (
      (headsQuery.data?.rows ?? []).find((h) => h.bom_head_id === head_id) ??
      null
    );
  }, [headsQuery.data, head_id]);

  const itemsQuery = useQuery<ListEnvelope<ItemRow>>({
    queryKey: ["admin", "items", "all-for-bom-head"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
    enabled: !!head,
  });
  const item = useMemo(() => {
    if (!head) return null;
    return (
      (itemsQuery.data?.rows ?? []).find((i) => i.item_id === head.parent_ref_id) ??
      null
    );
  }, [itemsQuery.data, head]);

  const versionsQuery = useQuery<ListEnvelope<BomVersionRow>>({
    queryKey: ["admin", "bom_version", "by-head", head_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/versions?bom_head_id=${encodeURIComponent(head_id)}&limit=1000`,
      ),
    enabled: !!head,
  });

  const newDraftMutation = useMutation({
    mutationFn: async () => {
      const body = {
        head_id,
        clone_from_version_id: head?.active_version_id ?? null,
        idempotency_key: randomIdempotencyKey(),
      };
      const res = await fetch("/api/boms/versions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new AdminMutationError(
          res.status,
          (json as { message?: string })?.message ?? `HTTP ${res.status}`,
          (json as { code?: string })?.code,
          json,
        );
      }
      return json as { bom_version_id: string };
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "bom_version", "by-head", head_id],
      });
      if (data?.bom_version_id) {
        router.push(
          `/admin/boms/${encodeURIComponent(head_id)}/versions/${encodeURIComponent(data.bom_version_id)}`,
        );
      }
    },
    onError: (err: Error) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({ kind: "error", message: `New draft failed: ${msg}` });
    },
  });

  if (headsQuery.isLoading) {
    return <div className="p-5 text-sm text-fg-muted">Loading BOM head…</div>;
  }
  if (headsQuery.isError) {
    return (
      <div className="p-5 text-sm text-danger-fg">
        {(headsQuery.error as Error).message}
      </div>
    );
  }
  if (!head) {
    return (
      <div className="p-5 text-sm text-danger-fg">
        BOM head not found: {head_id}
      </div>
    );
  }

  const versions = (versionsQuery.data?.rows ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const activeVersion = versions.find(
    (v) => v.bom_version_id === head.active_version_id,
  );

  return (
    <>
      <div className="mb-2">
        <Link
          href="/admin/boms"
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-sops text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
          BOMs
        </Link>
      </div>

      <WorkflowHeader
        eyebrow={`Admin · BOM · ${head.bom_head_id}`}
        title={item?.item_name ?? head.parent_name ?? head.parent_ref_id}
        description="BOM head — version history. Create a new draft to edit lines without disturbing the active version."
        meta={
          <>
            <Badge tone="neutral" dotted>
              {head.bom_head_id}
            </Badge>
            <Badge tone="info" dotted>
              {head.bom_kind}
            </Badge>
            {item ? (
              <Badge tone="info" dotted>
                {item.supply_method}
              </Badge>
            ) : null}
            <Badge tone="neutral" dotted>
              {head.final_bom_output_qty} {head.final_bom_output_uom ?? ""}
            </Badge>
          </>
        }
        actions={
          isAdmin ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={() => {
                setBanner(null);
                newDraftMutation.mutate();
              }}
              disabled={newDraftMutation.isPending}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              {newDraftMutation.isPending ? "Creating…" : "New draft"}
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

      <SectionCard
        eyebrow="Active version"
        title={
          activeVersion
            ? `v ${activeVersion.version_label}`
            : "No active version"
        }
        tone={activeVersion ? "success" : "warning"}
      >
        {activeVersion ? (
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            <Field label="Version ID">
              <span className="font-mono text-xs">
                {activeVersion.bom_version_id}
              </span>
            </Field>
            <Field label="Activated">
              {activeVersion.activated_at
                ? new Date(activeVersion.activated_at).toLocaleString()
                : "—"}
            </Field>
          </div>
        ) : (
          <p className="text-sm text-warning-fg">
            This BOM head has no active version. Publishing a draft version
            will activate it.
          </p>
        )}
      </SectionCard>

      <SectionCard
        eyebrow="Versions"
        title={`${versions.length} version${versions.length === 1 ? "" : "s"}`}
        contentClassName="p-0"
      >
        {versionsQuery.isLoading ? (
          <div className="p-5 text-sm text-fg-muted">Loading versions…</div>
        ) : versionsQuery.isError ? (
          <div className="p-5 text-sm text-danger-fg">
            {(versionsQuery.error as Error).message}
          </div>
        ) : versions.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No versions yet. Click “New draft” to create the first.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <Th>Version</Th>
                  <Th>Status</Th>
                  <Th>Version ID</Th>
                  <Th align="right">Lines</Th>
                  <Th>Created</Th>
                  <Th>Activated</Th>
                  <Th align="right">Open</Th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <BomVersionListRow
                    key={v.bom_version_id}
                    version={v}
                    head={head}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}

function BomVersionListRow({
  version,
  head,
}: {
  version: BomVersionRow;
  head: BomHeadRow;
}): JSX.Element {
  const linesQuery = useQuery<ListEnvelope<BomLineRow>>({
    queryKey: ["admin", "bom_lines", "by-version", version.bom_version_id],
    queryFn: () =>
      fetchJson(
        `/api/boms/lines?bom_version_id=${encodeURIComponent(version.bom_version_id)}&limit=1000`,
      ),
  });
  const isActive = version.bom_version_id === head.active_version_id;
  const statusLower = (version.status ?? "").toLowerCase();

  return (
    <tr className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40">
      <td className="px-3 py-2 font-mono text-xs text-fg">
        {version.version_label}
      </td>
      <td className="px-3 py-2">
        {isActive ? (
          <Badge tone="success" dotted>
            active
          </Badge>
        ) : statusLower === "draft" ? (
          <Badge tone="warning" dotted>
            draft
          </Badge>
        ) : statusLower === "archived" || statusLower === "superseded" ? (
          <Badge tone="neutral" dotted>
            superseded
          </Badge>
        ) : (
          <Badge tone="neutral" dotted>
            {version.status}
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-3xs font-mono text-fg-muted">
        {version.bom_version_id}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
        {linesQuery.isLoading
          ? "…"
          : (linesQuery.data?.count ?? linesQuery.data?.rows.length ?? 0)}
      </td>
      <td className="px-3 py-2 text-xs text-fg-muted">
        {new Date(version.created_at).toLocaleString()}
      </td>
      <td className="px-3 py-2 text-xs text-fg-muted">
        {version.activated_at
          ? new Date(version.activated_at).toLocaleString()
          : "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          href={`/admin/boms/${encodeURIComponent(head.bom_head_id)}/versions/${encodeURIComponent(version.bom_version_id)}`}
          className="btn btn-ghost btn-sm"
        >
          {statusLower === "draft" ? "Edit" : "View"}
        </Link>
      </td>
    </tr>
  );
}

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
