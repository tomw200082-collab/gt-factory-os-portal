"use client";

// ---------------------------------------------------------------------------
// Admin · Planning policy — settings-pages redesign iters 1-6.
//
//   1. Audit: 14 KV rows; inline value edit; no key creation (v1 locked).
//   2. "What planning policy controls" description card at top.
//   3. Per-row (?) help popovers explaining downstream impact.
//   4. Rows grouped into sections: Reorder & Safety / Ordering / Horizon /
//      Uncertainty / Other.
//   5. SectionCard wrappers with eyebrow + title per group.
//   6. Save state feedback: role="status" aria-live="polite", "Saving…" while
//      pending, success flash after.
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
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
import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
    throw new Error(
      `Could not load data (HTTP ${res.status}). Check your connection and try refreshing.`,
    );
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Iter 3 — Per-key downstream help copy.
// ---------------------------------------------------------------------------

const KEY_HELP: Record<string, string> = {
  reorder_point:
    "Minimum on-hand units before the planning engine flags a reorder need. A purchase recommendation is raised when projected stock falls below this threshold within the planning horizon.",
  safety_stock_days:
    "Buffer expressed in days of demand. Converted to units using the demand forecast. Protects against lead-time variability and demand spikes — stock below this level is treated as a shortage even if absolute units remain positive.",
  min_order_qty:
    "Smallest quantity the engine will suggest in a single purchase recommendation. Prevents impractically small orders that increase per-unit freight costs.",
  order_multiple:
    "Quantity rounding rule. All recommendation quantities are rounded up to the nearest multiple of this value — typically a case pack or pallet tier.",
  planning_horizon_days:
    "How many calendar days ahead the engine looks when projecting demand and supply. Shorter horizons miss long-lead items; longer horizons increase noise from uncertain forecasts.",
  lead_time_buffer_days:
    "Extra days added to each supplier’s quoted lead time. Acts as a safety cushion for late deliveries. Increases how early recommendations are triggered.",
  demand_uncertainty_pct:
    "Percentage added to base forecast when computing safety stock. A value of 20 means the engine plans for demand 20% above forecast. Higher values increase recommended stock but reduce stockout risk.",
  confidence_interval:
    "Statistical confidence level (0–1) used when deriving safety-stock from demand variance. 0.95 means the plan aims to avoid stockouts in 95% of planning cycles. Only relevant when variance data is available.",
};

// ---------------------------------------------------------------------------
// Iter 4 — Section grouping.
// ---------------------------------------------------------------------------

type SectionKey =
  | "reorder_safety"
  | "ordering"
  | "horizon"
  | "uncertainty"
  | "other";

interface PolicySection {
  key: SectionKey;
  eyebrow: string;
  title: string;
  description: string;
  keys: string[];
}

const SECTIONS: PolicySection[] = [
  {
    key: "reorder_safety",
    eyebrow: "Stock thresholds",
    title: "Reorder & safety",
    description:
      "Define when the planning engine considers stock too low and how much buffer to hold against demand variability.",
    keys: ["reorder_point", "safety_stock_days"],
  },
  {
    key: "ordering",
    eyebrow: "Order sizing",
    title: "Ordering",
    description:
      "Constrain the minimum and rounding behavior of every purchase recommendation so orders stay commercially practical.",
    keys: ["min_order_qty", "order_multiple"],
  },
  {
    key: "horizon",
    eyebrow: "Time window",
    title: "Horizon",
    description:
      "Control how far ahead the engine looks and how much extra lead-time cushion is assumed per supplier.",
    keys: ["planning_horizon_days", "lead_time_buffer_days"],
  },
  {
    key: "uncertainty",
    eyebrow: "Demand variance",
    title: "Uncertainty",
    description:
      "Tune how aggressively the engine hedges against forecast inaccuracy. Higher values reduce stockouts at the cost of more safety stock.",
    keys: ["demand_uncertainty_pct", "confidence_interval"],
  },
  {
    key: "other",
    eyebrow: "Other",
    title: "Additional keys",
    description:
      "Remaining configuration values not covered by the sections above.",
    keys: [],
  },
];

// ---------------------------------------------------------------------------
// Iter 3 — FieldHelp popover.
// ---------------------------------------------------------------------------

function FieldHelp({ copy }: { copy: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <span className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        aria-label="Field help"
        className="inline-flex items-center justify-center rounded text-fg-faint transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onClick={() => setOpen((v) => !v)}
      >
        <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-5 top-0 z-50 w-64 rounded border border-border/80 bg-bg-raised p-3 text-xs leading-relaxed text-fg shadow-lg"
        >
          <span className="flex items-start justify-between gap-2">
            <span>{copy}</span>
            <button
              type="button"
              aria-label="Close help"
              className="ml-1 shrink-0 text-fg-faint hover:text-fg"
              onClick={() => setOpen(false)}
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          </span>
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Iter 6 — save feedback banner with aria-live.
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
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={cls}
    >
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
// Policy table
// ---------------------------------------------------------------------------

function PolicyTable({
  rows,
  isAdmin,
  activeSaveKey,
  onSave,
}: {
  rows: PlanningPolicyRow[];
  isAdmin: boolean;
  activeSaveKey: string | null;
  onSave: (key: string, value: string, updated_at: string) => Promise<void>;
}): JSX.Element {
  if (rows.length === 0) return <></>;

  return (
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
          {rows.map((r) => {
            const helpCopy = KEY_HELP[r.key];
            const isSaving = activeSaveKey === r.key;
            return (
              <tr
                key={r.key}
                className={cn(
                  "border-b border-border/40 last:border-b-0",
                  isSaving ? "bg-info-softer/40" : "hover:bg-bg-subtle/40",
                )}
              >
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-mono text-xs text-fg">{r.key}</span>
                    {helpCopy ? <FieldHelp copy={helpCopy} /> : null}
                  </span>
                </td>
                <td className="px-3 py-2 text-fg-strong">
                  {isSaving ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-info-fg">
                      <span
                        className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-info/40 border-t-info"
                        aria-hidden
                      />
                      Saving…
                    </span>
                  ) : isAdmin ? (
                    <InlineEditCell
                      value={r.value}
                      type="text"
                      ifMatchUpdatedAt={r.updated_at}
                      onSave={async (newValue) => {
                        await onSave(r.key, String(newValue), r.updated_at);
                      }}
                      ariaLabel={`Edit value for ${r.key}`}
                    />
                  ) : (
                    <span className="font-mono text-sm">{r.value}</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-fg-muted">
                  {r.uom ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs text-fg-muted">
                  {r.description ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs text-fg-muted">
                  {new Date(r.updated_at).toLocaleString()}
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

export default function AdminPlanningPolicyPage(): JSX.Element {
  const { session } = useSession();
  const isAdmin = session.role === "admin";
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
  const [activeSaveKey, setActiveSaveKey] = useState<string | null>(null);

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
    onMutate: (vars) => {
      setActiveSaveKey(vars.key);
      setFeedback({ kind: "saving", message: `Saving ${vars.key}…` });
    },
    onSuccess: (_data, vars) => {
      setActiveSaveKey(null);
      setFeedback({
        kind: "success",
        message: `Updated ${vars.key} → ${vars.value}.`,
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", "planning-policy"],
      });
    },
    onError: (err: Error, vars) => {
      setActiveSaveKey(null);
      const msg =
        err instanceof AdminMutationError
          ? `${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`
          : err.message;
      setFeedback({
        kind: "error",
        message: `Update failed on ${vars.key}: ${msg}`,
      });
    },
  });

  const handleSave = async (
    key: string,
    value: string,
    updated_at: string,
  ): Promise<void> => {
    await valueMutation.mutateAsync({ key, value, updated_at });
  };

  const allRows = policyQuery.data?.rows ?? [];

  const filteredRows = useMemo(() => {
    if (!query) return allRows;
    const qLower = query.toLowerCase();
    return allRows.filter(
      (r) =>
        r.key.toLowerCase().includes(qLower) ||
        (r.description ?? "").toLowerCase().includes(qLower),
    );
  }, [allRows, query]);

  const sectioned = useMemo(() => {
    const knownKeys = new Set(SECTIONS.flatMap((s) => s.keys));
    const otherKeys = allRows
      .map((r) => r.key)
      .filter((k) => !knownKeys.has(k));

    return SECTIONS.map((section) => {
      const sectionKeys =
        section.key === "other" ? otherKeys : section.keys;
      return {
        ...section,
        rows: allRows.filter((r) => sectionKeys.includes(r.key)),
      };
    }).filter((s) => s.rows.length > 0);
  }, [allRows]);

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · planning policy"
        title="Planning policy"
        description="Global defaults for the planning engine. Click any value to edit it. Changes take effect on the next planning run."
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

      <SectionCard
        eyebrow="About this page"
        title="What planning policy controls"
        tone="info"
        density="compact"
      >
        <p className="text-sm leading-relaxed text-fg-muted">
          Planning policy values are the shared defaults used by the planning
          engine to compute{" "}
          <strong className="text-fg">purchase recommendations</strong>,
          calculate <strong className="text-fg">safety stock</strong>, and
          determine{" "}
          <strong className="text-fg">demand planning horizons</strong>. Each
          item may override these defaults in its own policy tab. Edits here
          affect the next planning run — they do not retroactively change
          committed purchase orders or existing recommendations. Only admins can
          edit values; planners and viewers see the current configuration
          read-only.
        </p>
      </SectionCard>

      {feedback ? (
        <FeedbackBanner
          feedback={feedback}
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      {allRows.length > 0 ? (
        <SectionCard title="Filter" density="compact">
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Search (key / description)
            </span>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by key or description…"
            />
          </label>
        </SectionCard>
      ) : null}

      {policyQuery.isLoading ? (
        <SectionCard
          eyebrow="Policy keys"
          title="Loading…"
          contentClassName="p-0"
        >
          <div className="p-5">
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse gap-3 border-b border-border/30 pb-2"
                >
                  <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
                  <div className="h-4 flex-1 rounded bg-bg-subtle" />
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      ) : policyQuery.isError ? (
        <SectionCard eyebrow="Policy keys" title="Error" contentClassName="p-5">
          <div className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
            <div className="font-semibold">Could not load policy keys</div>
            <div className="mt-1 text-xs">
              {(policyQuery.error as Error).message}
            </div>
            <button
              type="button"
              onClick={() => void policyQuery.refetch()}
              className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        </SectionCard>
      ) : query ? (
        <SectionCard
          eyebrow="Policy keys"
          title={`${filteredRows.length} of ${allRows.length} matching "${query}"`}
          contentClassName="p-0"
        >
          {filteredRows.length === 0 ? (
            <div className="p-5 text-sm text-fg-muted">
              No keys match filter.
            </div>
          ) : (
            <PolicyTable
              rows={filteredRows}
              isAdmin={isAdmin}
              activeSaveKey={activeSaveKey}
              onSave={handleSave}
            />
          )}
        </SectionCard>
      ) : (
        sectioned.map((section) => (
          <SectionCard
            key={section.key}
            eyebrow={section.eyebrow}
            title={section.title}
            description={section.description}
            contentClassName="p-0"
          >
            <PolicyTable
              rows={section.rows}
              isAdmin={isAdmin}
              activeSaveKey={activeSaveKey}
              onSave={handleSave}
            />
          </SectionCard>
        ))
      )}
    </>
  );
}
