"use client";

// ---------------------------------------------------------------------------
// Admin · Planning policy — AMMC v1 Slice 4 UN-QUARANTINE.
//
// Prior state: src/components/system/QuarantinedPage stub only. This slice
// lights up the live KV table read + inline-edit on value column per plan
// §C.2 + §D.2:
//
//   - Fetches the full list via GET /api/planning-policy (14 rows v1)
//   - Renders key / value (InlineEditCell) / uom / description / updated_at
//   - PATCH /api/planning-policy/[key] on Enter, with if_match_updated_at
//   - No "+ New key" (plan §D.2 locks no creation in v1)
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import {
  AdminMutationError,
  patchEntity,
} from "@/lib/admin/mutations";
import { useSession } from "@/lib/auth/session-provider";

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
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${url} failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

export default function AdminPlanningPolicyPage(): JSX.Element {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);

  const policyQuery = useQuery<ListEnvelope<PlanningPolicyRow>>({
    queryKey: ["admin", "planning-policy"],
    queryFn: () => fetchJson("/api/planning-policy?limit=1000"),
  });

  const valueMutation = useMutation({
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
      setBanner({
        kind: "success",
        message: `Updated ${vars.key} → ${vars.value}.`,
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "planning-policy"],
      });
    },
    onError: (err: Error, vars) => {
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setBanner({
        kind: "error",
        message: `Update failed on ${vars.key}: ${msg}`,
      });
    },
  });

  const rows = policyQuery.data?.rows ?? [];
  const filtered = useMemo(() => {
    if (!query) return rows;
    const qLower = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.key.toLowerCase().includes(qLower) ||
        (r.description ?? "").toLowerCase().includes(qLower),
    );
  }, [rows, query]);

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · planning policy"
        title="Planning policy"
        description="Canonical KV configuration consumed by planning engine. Inline-edit value column. No key creation in v1 — schema-controlled."
        meta={
          <>
            <Badge tone="info" dotted>
              {policyQuery.data?.count ?? 0} keys
            </Badge>
            <Badge tone="neutral" dotted>
              live API
            </Badge>
          </>
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

      <SectionCard title="Filter" density="compact">
        <label className="block">
          <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Search (key / description)
          </span>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="filter client-side…"
          />
        </label>
      </SectionCard>

      <SectionCard
        eyebrow="Policy keys"
        title={`Showing ${filtered.length} of ${rows.length}`}
        contentClassName="p-0"
      >
        {policyQuery.isLoading ? (
          <div className="p-5 text-sm text-fg-muted">Loading…</div>
        ) : policyQuery.isError ? (
          <div className="p-5 text-sm text-danger-fg">
            {(policyQuery.error as Error).message}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5 text-sm text-fg-muted">No keys match filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Key
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Value
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    UoM
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Description
                  </th>
                  <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
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
                          onSave={async (newValue) => {
                            await valueMutation.mutateAsync({
                              key: r.key,
                              value: newValue,
                              updated_at: r.updated_at,
                            });
                          }}
                          ariaLabel={`Edit value for ${r.key}`}
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
                    <td className="px-3 py-2 text-xs text-fg-muted">
                      {new Date(r.updated_at).toLocaleString()}
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
