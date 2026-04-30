"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";

type SourceChannel = "shopify" | "lionwheel" | "green_invoice";
type ApprovalStatus = "pending" | "approved" | "rejected";

interface SkuMapRow {
  alias_id: string;
  source_channel: SourceChannel | string;
  external_sku: string;
  item_id: string;
  approval_status: ApprovalStatus;
  notes: string | null;
  created_at: string;
}

type ListEnvelope = { rows: SkuMapRow[] };

const CHANNEL_LABELS: Record<string, string> = {
  shopify: "Shopify",
  lionwheel: "LionWheel",
  green_invoice: "Green Invoice",
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`);
  }
  return (await res.json()) as T;
}

function StatusChip({ status }: { status: string }): JSX.Element {
  if (status === "approved") return <Badge tone="success" dotted>Approved</Badge>;
  if (status === "pending") return <Badge tone="warning" dotted>Pending</Badge>;
  if (status === "rejected") return <Badge tone="danger" dotted>Rejected</Badge>;
  return <Badge tone="neutral" dotted>{status}</Badge>;
}

export default function AdminSkuMapPage(): JSX.Element {
  const { session } = useSession();
  const queryClient = useQueryClient();

  if (session.role !== "admin") {
    return (
      <div className="card mx-auto mt-8 max-w-lg p-6 text-center">
        <div className="text-sm font-semibold text-fg">SKU Mappings</div>
        <div className="mt-2 text-xs text-fg-muted">
          This surface is restricted to admin. Current role:{" "}
          <span className="font-mono text-fg">{session.role}</span>.
        </div>
      </div>
    );
  }

  const [channel, setChannel] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [approveError, setApproveError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const listQuery = useQuery<ListEnvelope>({
    queryKey: ["admin", "sku-map", channel, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (channel) params.set("source_channel", channel);
      params.set("approval_status", statusFilter);
      return fetchJson(`/api/integration-sku-map?${params.toString()}`);
    },
  });

  const approveMutation = useMutation<unknown, Error, string>({
    mutationFn: async (alias_id: string) => {
      const res = await fetch("/api/integration-sku-map/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias_id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (body as { error?: string } | null)?.error ?? "Could not approve mapping. Check your connection and try again.",
        );
      }
      return body;
    },
    onSuccess: () => {
      setApproveError(null);
      setSuccessBanner("Mapping approved.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "sku-map"] });
    },
    onError: (err) => {
      setSuccessBanner(null);
      setApproveError(err.message);
    },
  });

  const rows = listQuery.data?.rows ?? [];

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · System"
        title="SKU Mappings"
        description="Review and approve external SKU → platform item mappings for Shopify, LionWheel, and Green Invoice integrations. Approving a mapping unblocks integration writes."
      />

      {successBanner ? (
        <div className="rounded-md border border-success/40 bg-success-softer p-4 text-sm text-success-fg">
          <div className="font-semibold">{successBanner}</div>
        </div>
      ) : null}

      {approveError ? (
        <div className="rounded-md border border-danger/40 bg-danger-softer p-4 text-sm text-danger-fg">
          <div className="font-semibold">Approval failed</div>
          <div className="mt-1 text-xs opacity-80">{approveError}</div>
        </div>
      ) : null}

      <SectionCard title="Filters" density="compact">
        <div className="flex flex-wrap gap-4">
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Source Channel
            </span>
            <select
              className="input"
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value);
                setSuccessBanner(null);
                setApproveError(null);
              }}
            >
              <option value="">All channels</option>
              <option value="shopify">Shopify</option>
              <option value="lionwheel">LionWheel</option>
              <option value="green_invoice">Green Invoice</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Approval Status
            </span>
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setSuccessBanner(null);
                setApproveError(null);
              }}
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard
        title="Mappings"
        description={
          listQuery.isSuccess
            ? `${rows.length} row${rows.length === 1 ? "" : "s"} found`
            : undefined
        }
        contentClassName="p-0"
      >
        {listQuery.isLoading ? (
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                  <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        ) : listQuery.isError ? (
          <div className="p-5">
            <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
              <div className="font-semibold">Could not load mappings</div>
              <div className="mt-1 text-xs">{(listQuery.error as Error).message}</div>
              <button
                type="button"
                onClick={() => void listQuery.refetch()}
                className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">
            No mappings found for the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Channel
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    External SKU
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    → Platform Item
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Created
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.alias_id}
                    className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  >
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {CHANNEL_LABELS[row.source_channel] ?? row.source_channel}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      {row.external_sku}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-fg">
                      {row.item_id}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={row.approval_status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      {row.approval_status === "pending" ? (
                        <button
                          type="button"
                          className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={approveMutation.isPending}
                          onClick={() => {
                            setSuccessBanner(null);
                            setApproveError(null);
                            approveMutation.mutate(row.alias_id);
                          }}
                        >
                          {approveMutation.isPending &&
                          approveMutation.variables === row.alias_id
                            ? "Approving…"
                            : "Approve"}
                        </button>
                      ) : (
                        <span className="text-xs text-fg-subtle">—</span>
                      )}
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
