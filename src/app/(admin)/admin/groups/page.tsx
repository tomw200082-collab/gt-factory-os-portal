"use client";

// ---------------------------------------------------------------------------
// Admin · Groups — Groups v1 management page (Tranche 044).
//
// Two tabs — "Product groups" (items.product_group_key vocabulary) and
// "Material groups" (components.material_group_key vocabulary). Per tab:
//   - table: name_he / name_en / key / display_order / color chip / active
//     toggle / member count (computed client-side from the items /
//     components list rows' group keys — both endpoints already return them)
//   - inline edit of name_he / name_en / display_order via
//     PATCH /api/groups/:kind/:key with body-level If-Match
//     (if_match_updated_at + idempotency_key, the same optimistic-concurrency
//     pattern as /admin/planning-policy via patchEntity)
//   - active toggle via the same PATCH
//   - "New group" form: key, names, display order, color (6 curated tokens)
//
// Admin UI language is English; group Hebrew names render as data
// (dir="auto"), per the portal language contract.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Power, X } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { InlineEditCell } from "@/components/tables/InlineEditCell";
import { AdminMutationError, patchEntity } from "@/lib/admin/mutations";
import {
  GROUP_COLOR_TOKENS,
  groupTone,
  useGroups,
  type MaterialGroup,
  type ProductGroup,
} from "@/lib/taxonomy/groups";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types + small helpers
// ---------------------------------------------------------------------------

type GroupKind = "product" | "material";

type AnyGroup = ProductGroup | MaterialGroup;

type ListEnvelope<T> = { rows: T[]; count: number };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(
      `Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`,
    );
  }
  return (await res.json()) as T;
}

function randomIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Feedback banner (mirrors /admin/planning-policy save feedback semantics)
// ---------------------------------------------------------------------------

interface SaveFeedback {
  kind: "saving" | "success" | "error";
  message: string;
}

function FeedbackBanner({
  feedback,
  onDismiss,
}: {
  feedback: SaveFeedback;
  onDismiss: () => void;
}): JSX.Element {
  const cls =
    feedback.kind === "success"
      ? "rounded-md border border-success/40 bg-success-softer p-3 text-sm text-success-fg"
      : feedback.kind === "error"
        ? "rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
        : "rounded-md border border-info/40 bg-info-softer p-3 text-sm text-info-fg";
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={cls}>
      <div className="flex items-center justify-between gap-3">
        <span>{feedback.message}</span>
        {feedback.kind !== "saving" ? (
          <button
            type="button"
            aria-label="Dismiss"
            className="shrink-0 text-current opacity-60 hover:opacity-100"
            onClick={onDismiss}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New-group form
// ---------------------------------------------------------------------------

interface NewGroupDraft {
  key: string;
  name_en: string;
  name_he: string;
  display_order: string;
  color_token: string;
}

const EMPTY_DRAFT: NewGroupDraft = {
  key: "",
  name_en: "",
  name_he: "",
  display_order: "100",
  color_token: "neutral",
};

function NewGroupForm({
  kind,
  pending,
  onCreate,
  onCancel,
}: {
  kind: GroupKind;
  pending: boolean;
  onCreate: (draft: NewGroupDraft) => void;
  onCancel: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState<NewGroupDraft>(EMPTY_DRAFT);
  const keyValid = /^[a-z0-9_]+$/.test(draft.key);
  const orderValid =
    draft.display_order.trim() !== "" &&
    Number.isInteger(Number(draft.display_order)) &&
    Number(draft.display_order) >= 0;
  const canSubmit =
    keyValid && orderValid && draft.name_en.trim() !== "" && draft.name_he.trim() !== "";

  return (
    <form
      data-testid={`groups-new-form-${kind}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit && !pending) onCreate(draft);
      }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-6"
    >
      <label className="block">
        <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Key
        </span>
        <input
          className="input font-mono"
          value={draft.key}
          onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
          placeholder="e.g. cocktail_mix"
          data-testid="groups-new-key"
        />
        {draft.key && !keyValid ? (
          <span className="mt-1 block text-3xs text-danger-fg">
            Use lowercase letters, numbers, and underscores only (e.g. cocktail_mix)
          </span>
        ) : null}
      </label>
      <label className="block">
        <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Name (English)
        </span>
        <input
          className="input"
          value={draft.name_en}
          onChange={(e) => setDraft((d) => ({ ...d, name_en: e.target.value }))}
          data-testid="groups-new-name-en"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Name (Hebrew)
        </span>
        <input
          className="input"
          dir="rtl"
          value={draft.name_he}
          onChange={(e) => setDraft((d) => ({ ...d, name_he: e.target.value }))}
          data-testid="groups-new-name-he"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Display order
        </span>
        <input
          className="input"
          type="number"
          min={0}
          value={draft.display_order}
          onChange={(e) =>
            setDraft((d) => ({ ...d, display_order: e.target.value }))
          }
          data-testid="groups-new-order"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Color
        </span>
        <select
          className="input"
          value={draft.color_token}
          onChange={(e) =>
            setDraft((d) => ({ ...d, color_token: e.target.value }))
          }
          data-testid="groups-new-color"
        >
          {GROUP_COLOR_TOKENS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="btn-primary inline-flex items-center gap-1.5"
          disabled={!canSubmit || pending}
          data-testid="groups-new-submit"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          {pending ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Group table (one per tab)
// ---------------------------------------------------------------------------

function GroupTable({
  kind,
  groups,
  memberCounts,
  countsReady,
  isAdmin,
  pendingKey,
  onPatch,
}: {
  kind: GroupKind;
  groups: AnyGroup[];
  memberCounts: Map<string, number>;
  countsReady: boolean;
  isAdmin: boolean;
  /** Group key with an in-flight PATCH (row renders muted while saving). */
  pendingKey: string | null;
  onPatch: (
    group: AnyGroup,
    fields: Record<string, unknown>,
    describe: string,
  ) => Promise<void>;
}): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" data-testid={`groups-table-${kind}`}>
        <thead>
          <tr className="border-b border-border/70 bg-bg-subtle/60">
            {[
              "Name (Hebrew)",
              "Name (English)",
              "Key",
              "Order",
              "Color",
              "Members",
              "Status",
              "Actions",
            ].map((h) => (
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
          {groups.map((g) => {
            const saving = pendingKey === g.key;
            const members = memberCounts.get(g.key) ?? 0;
            return (
              <tr
                key={g.key}
                className={cn(
                  "border-b border-border/40 last:border-b-0",
                  saving ? "bg-info-softer/40" : "hover:bg-bg-subtle/40",
                  !g.active && "opacity-60",
                )}
              >
                <td className="px-3 py-2" dir="rtl">
                  {isAdmin ? (
                    <InlineEditCell
                      value={g.name_he}
                      type="text"
                      ifMatchUpdatedAt={g.updated_at}
                      ariaLabel={`Edit Hebrew name for ${g.key}`}
                      onSave={async (v) =>
                        onPatch(g, { name_he: String(v) }, "Hebrew name")
                      }
                    />
                  ) : (
                    <span>{g.name_he}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isAdmin ? (
                    <InlineEditCell
                      value={g.name_en}
                      type="text"
                      ifMatchUpdatedAt={g.updated_at}
                      ariaLabel={`Edit English name for ${g.key}`}
                      onSave={async (v) =>
                        onPatch(g, { name_en: String(v) }, "English name")
                      }
                    />
                  ) : (
                    <span>{g.name_en}</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-fg-muted">
                  {g.key}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {isAdmin ? (
                    <InlineEditCell
                      value={g.display_order}
                      type="number"
                      inputMode="numeric"
                      ifMatchUpdatedAt={g.updated_at}
                      ariaLabel={`Edit display order for ${g.key}`}
                      onSave={async (v) => {
                        const n = Number(v);
                        if (!Number.isInteger(n) || n < 0) {
                          throw new Error(
                            "Display order must be a whole number ≥ 0.",
                          );
                        }
                        await onPatch(g, { display_order: n }, "display order");
                      }}
                    />
                  ) : (
                    <span>{g.display_order}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={groupTone(g.color_token)} dotted>
                    {g.color_token}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-fg-muted">
                  {countsReady ? members : "…"}
                </td>
                <td className="px-3 py-2">
                  {g.active ? (
                    <Badge tone="success" dotted>Active</Badge>
                  ) : (
                    <Badge tone="neutral" dotted>Inactive</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isAdmin ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm inline-flex items-center gap-1"
                      disabled={saving}
                      title={`Toggle active (currently ${g.active ? "active" : "inactive"})`}
                      data-testid={`groups-active-toggle-${g.key}`}
                      onClick={() =>
                        void onPatch(
                          g,
                          { active: !g.active },
                          g.active ? "deactivate" : "activate",
                        )
                      }
                    >
                      <Power className="h-3 w-3" strokeWidth={2} />
                      {g.active ? "Deactivate" : "Activate"}
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminGroupsPage(): JSX.Element {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<GroupKind>("product");
  const [showCreate, setShowCreate] = useState(false);
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const groupsQuery = useGroups();

  // Member counts — computed client-side from the list endpoints' group keys.
  const itemsQuery = useQuery<ListEnvelope<{ product_group_key: string | null }>>({
    queryKey: ["admin", "groups", "items-for-counts"],
    queryFn: () => fetchJson("/api/items?limit=1000"),
    staleTime: 60_000,
  });
  const componentsQuery = useQuery<
    ListEnvelope<{ material_group_key: string | null }>
  >({
    queryKey: ["admin", "groups", "components-for-counts"],
    queryFn: () => fetchJson("/api/components?limit=1000"),
    staleTime: 60_000,
  });

  const productCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of itemsQuery.data?.rows ?? []) {
      if (r.product_group_key) {
        m.set(r.product_group_key, (m.get(r.product_group_key) ?? 0) + 1);
      }
    }
    return m;
  }, [itemsQuery.data]);

  const materialCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of componentsQuery.data?.rows ?? []) {
      if (r.material_group_key) {
        m.set(r.material_group_key, (m.get(r.material_group_key) ?? 0) + 1);
      }
    }
    return m;
  }, [componentsQuery.data]);

  // --- Mutations -----------------------------------------------------------

  const patchMutation = useMutation({
    mutationFn: async (args: {
      kind: GroupKind;
      group: AnyGroup;
      fields: Record<string, unknown>;
      describe: string;
    }) =>
      patchEntity({
        url: `/api/groups/${args.kind}/${encodeURIComponent(args.group.key)}`,
        fields: args.fields,
        ifMatchUpdatedAt: args.group.updated_at,
      }),
    onMutate: (vars) => {
      setPendingKey(vars.group.key);
      setFeedback({ kind: "saving", message: `Saving ${vars.group.key}…` });
    },
    onSuccess: (_data, vars) => {
      setPendingKey(null);
      setFeedback({
        kind: "success",
        message: `Updated ${vars.describe} on ${vars.group.key}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (err: Error, vars) => {
      setPendingKey(null);
      const msg =
        err instanceof AdminMutationError
          ? err.message
          : err.message;
      setFeedback({
        kind: "error",
        message: `Update failed on ${vars.group.key}: ${msg}`,
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (args: { kind: GroupKind; draft: NewGroupDraft }) => {
      const res = await fetch(`/api/groups/${args.kind}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          idempotency_key: randomIdempotencyKey(),
          key: args.draft.key.trim(),
          name_en: args.draft.name_en.trim(),
          name_he: args.draft.name_he.trim(),
          display_order: Number(args.draft.display_order),
          color_token: args.draft.color_token,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { reason_code?: string; detail?: string; error?: string }
          | null;
        throw new AdminMutationError(
          res.status,
          body?.detail ?? body?.error ?? "Could not create group. Try again.",
          body?.reason_code,
          body,
        );
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      setShowCreate(false);
      setFeedback({
        kind: "success",
        message: `Created ${vars.kind} group ${vars.draft.key}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (err: Error, vars) => {
      const msg =
        err instanceof AdminMutationError
          ? err.message
          : err.message;
      setFeedback({
        kind: "error",
        message: `Create failed on ${vars.draft.key}: ${msg}`,
      });
    },
  });

  const handlePatch = async (
    group: AnyGroup,
    fields: Record<string, unknown>,
    describe: string,
  ): Promise<void> => {
    await patchMutation.mutateAsync({ kind: tab, group, fields, describe });
  };

  // --- Derived view state ----------------------------------------------------

  const groups: AnyGroup[] =
    tab === "product"
      ? (groupsQuery.data?.product_groups ?? [])
      : (groupsQuery.data?.material_groups ?? []);

  const memberCounts = tab === "product" ? productCounts : materialCounts;
  const countsReady =
    tab === "product" ? itemsQuery.isSuccess : componentsQuery.isSuccess;

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · groups"
        title="Groups"
        description="Curated product and material group vocabularies. Groups drive the category chips on Inventory, the flow-page filters, and future planning breakdowns. Inactive groups stay visible greyed-out on consuming surfaces."
        meta={
          <>
            <Badge tone="info" dotted>
              {(groupsQuery.data?.product_groups.length ?? 0) +
                (groupsQuery.data?.material_groups.length ?? 0)}{" "}
              groups
            </Badge>
            <Badge tone="neutral" dotted>
              Live data
            </Badge>
          </>
        }
        actions={
          isAdmin ? (
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5"
              onClick={() => setShowCreate((v) => !v)}
              data-testid="groups-new-button"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              New group
            </button>
          ) : null
        }
      />

      {feedback ? (
        <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} />
      ) : null}

      {/* Tabs */}
      <div
        className="flex items-center gap-1 rounded-md bg-bg-subtle/50 p-0.5"
        role="tablist"
        aria-label="Group kind"
      >
        {(
          [
            { kind: "product" as const, label: "Product groups" },
            { kind: "material" as const, label: "Material groups" },
          ]
        ).map((t) => {
          const isActive = tab === t.kind;
          const count =
            t.kind === "product"
              ? groupsQuery.data?.product_groups.length
              : groupsQuery.data?.material_groups.length;
          return (
            <button
              key={t.kind}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.kind)}
              data-testid={`groups-tab-${t.kind}`}
              className={cn(
                "inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                isActive ? "bg-bg text-fg shadow-sm" : "text-fg-muted hover:text-fg",
              )}
            >
              {t.label}
              {count != null ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0 text-2xs tabular-nums ring-1",
                    isActive
                      ? "bg-accent-softer text-accent-fg ring-accent/30"
                      : "bg-bg-subtle text-fg-subtle ring-border",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {showCreate && isAdmin ? (
        <SectionCard
          eyebrow="Create"
          title={`New ${tab} group`}
          description="The key is permanent. Names and display order can be edited later; assignment to products / materials happens on the Items / Components pages."
          density="compact"
        >
          <NewGroupForm
            kind={tab}
            pending={createMutation.isPending}
            onCreate={(draft) => createMutation.mutate({ kind: tab, draft })}
            onCancel={() => setShowCreate(false)}
          />
        </SectionCard>
      ) : null}

      <SectionCard
        eyebrow="Vocabulary"
        title={tab === "product" ? "Product groups" : "Material groups"}
        description={
          tab === "product"
            ? "Finished-goods categories. Member counts reflect how many products are assigned to each group."
            : "Raw-material and packaging categories. Member counts reflect how many materials are assigned to each group."
        }
        contentClassName="p-0"
      >
        {groupsQuery.isLoading ? (
          <div className="p-5">
            <LoadingState
              title="Loading groups…"
              description="Fetching the shared group vocabulary."
            />
          </div>
        ) : groupsQuery.isError ? (
          <div className="p-5">
            <ErrorState
              title="Could not load groups"
              description={(groupsQuery.error as Error).message}
              onRetry={() => void groupsQuery.refetch()}
            />
          </div>
        ) : groups.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={`No ${tab} groups yet`}
              description="Create the first group to start categorizing. Groups appear immediately as filter chips on Inventory and the flow pages."
              action={
                isAdmin ? (
                  <button
                    type="button"
                    className="btn-primary inline-flex items-center gap-1.5"
                    onClick={() => setShowCreate(true)}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    New group
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <GroupTable
            kind={tab}
            groups={groups}
            memberCounts={memberCounts}
            countsReady={countsReady}
            isAdmin={isAdmin}
            pendingKey={pendingKey}
            onPatch={handlePatch}
          />
        )}
      </SectionCard>
    </>
  );
}
