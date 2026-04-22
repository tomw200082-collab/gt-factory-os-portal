"use client";

// ---------------------------------------------------------------------------
// /inbox — unified triage surface (Tranche B §D of
// portal-full-production-refactor).
//
// Merges four source streams into one filtered, sorted list:
//   1. Pending Waste/Adjustment approvals   (features/inbox/client.ts)
//   2. Pending Physical Count approvals
//   3. Pending planning-run recommendation approvals
//   4. Non-approval exceptions
//
// Filter bar + sort toggle write back to the URL query string so views are
// shareable. Exception rows expose inline Acknowledge/Resolve (gated out for
// viewers). Approval rows expose a deep-link Review button to their
// respective detail page. No invented backend contracts.
// ---------------------------------------------------------------------------

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
} from "lucide-react";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { NotesBox } from "@/components/fields/NotesBox";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";

import {
  fetchExceptions,
  fetchPendingPhysicalCountApprovals,
  fetchPendingPlanningRecApprovals,
  fetchPendingWasteApprovals,
  mergeInboxRows,
  applyInboxView,
} from "@/features/inbox/client";
import {
  acknowledgeException,
  newIdempotencyKey,
  resolveException,
} from "@/features/inbox/actions";
import {
  INBOX_SORTS,
  INBOX_VIEWS,
  type InboxFilter,
  type InboxRow,
  type InboxSeverity,
  type InboxSort,
  type InboxView,
} from "@/features/inbox/types";

// ---------------------------------------------------------------------------
// Query keys. The SideNav reads ["inbox", "all_rows"] for the unfiltered
// count pill, so we seed THAT cache entry with the merged list on every
// render via a lightweight second useQuery. Per-source keys are independent
// so each fetcher can be invalidated in isolation by a future action.
// ---------------------------------------------------------------------------
const QK_WASTE = ["inbox", "source", "approvals", "waste"] as const;
const QK_PC = ["inbox", "source", "approvals", "physical_count"] as const;
const QK_REC = ["inbox", "source", "approvals", "recommendations"] as const;
const QK_EXC = ["inbox", "source", "exceptions"] as const;
const QK_ALL = ["inbox", "all_rows"] as const;

// ---------------------------------------------------------------------------
// URL filter ↔ InboxFilter translation.
// ---------------------------------------------------------------------------
function readFilterFromSearchParams(
  sp: URLSearchParams | null,
): InboxFilter {
  const view = sp?.get("view") ?? "all";
  const sort = sp?.get("sort") ?? "severity_then_age";
  const safeView: InboxView = (INBOX_VIEWS as readonly string[]).includes(view)
    ? (view as InboxView)
    : "all";
  const safeSort: InboxSort = (INBOX_SORTS as readonly string[]).includes(sort)
    ? (sort as InboxSort)
    : "severity_then_age";
  return { view: safeView, sort: safeSort };
}

// ---------------------------------------------------------------------------
// Severity visual config (UI-only projection of the backend enum).
// ---------------------------------------------------------------------------
const SEVERITY_CONFIG: Record<
  InboxSeverity,
  {
    tone: "danger" | "warning" | "info";
    icon: typeof AlertCircle;
    label: string;
    accentBar: string;
  }
> = {
  critical: {
    tone: "danger",
    icon: AlertCircle,
    label: "Critical",
    accentBar: "bg-danger",
  },
  warning: {
    tone: "warning",
    icon: AlertTriangle,
    label: "Warning",
    accentBar: "bg-warning",
  },
  info: {
    tone: "info",
    icon: Info,
    label: "Info",
    accentBar: "bg-info",
  },
};

const TYPE_LABELS: Record<string, string> = {
  "approval:waste": "Waste approval",
  "approval:physical_count": "Count approval",
  "approval:purchase_recommendation": "Purchase rec",
  "approval:production_recommendation": "Production rec",
};

function typeLabel(type: InboxRow["type"]): string {
  if (TYPE_LABELS[type]) return TYPE_LABELS[type];
  if (type.startsWith("exception:")) return "Exception";
  return type;
}

const VIEW_LABELS: Record<InboxView, string> = {
  all: "All",
  approvals: "Approvals",
  exceptions: "Exceptions",
  stock: "Stock",
  planning: "Planning",
  integrations: "Integrations",
  data_quality: "Data Quality",
  mine: "Mine",
};

const SORT_LABELS: Record<InboxSort, string> = {
  severity_then_age: "Severity, then age",
  age_only: "Newest first",
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ageHumanized(iso: string, now: Date): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const deltaMs = now.getTime() - ts;
  const mins = Math.max(0, Math.round(deltaMs / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Inline resolve panel — reused from the legacy /exceptions page pattern
// (one required textarea, 1..2000 chars).
// ---------------------------------------------------------------------------
function ResolvePanel({
  onConfirm,
  onCancel,
  busy,
}: {
  onConfirm: (notes: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [notes, setNotes] = useState("");
  const canSubmit = notes.trim().length >= 1 && notes.length <= 2000 && !busy;
  return (
    <div className="mt-3 rounded border border-warning/40 bg-warning-softer p-3">
      <div className="text-3xs font-semibold uppercase tracking-sops text-warning-fg">
        Resolution notes (required)
      </div>
      <NotesBox
        data-testid="inbox-resolve-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Explain what was done."
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          data-testid="inbox-resolve-confirm"
          disabled={!canSubmit}
          onClick={() => onConfirm(notes)}
        >
          {busy ? "Submitting…" : "Confirm resolve"}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          data-testid="inbox-resolve-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page.
// ---------------------------------------------------------------------------
export default function InboxListPage() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const filter = useMemo(
    () => readFilterFromSearchParams(searchParams),
    [searchParams],
  );

  const canAct = session.role === "planner" || session.role === "admin";

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Memoize a stable "now" per render tree so all row ages use the same frame
  // of reference.
  const now = useMemo(() => new Date(), []);

  // -------------------------------------------------------------------------
  // Source fetchers (parallel). Each has an independent queryKey so a future
  // mutation can invalidate exactly the affected stream.
  // -------------------------------------------------------------------------
  const sources = useQueries({
    queries: [
      {
        queryKey: QK_WASTE,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchPendingWasteApprovals(signal),
      },
      {
        queryKey: QK_PC,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchPendingPhysicalCountApprovals(signal),
      },
      {
        queryKey: QK_REC,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchPendingPlanningRecApprovals(signal),
      },
      {
        queryKey: QK_EXC,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchExceptions(signal),
      },
    ],
  });

  const [wasteQ, pcQ, recQ, excQ] = sources;

  const anyLoading =
    wasteQ.isLoading || pcQ.isLoading || recQ.isLoading || excQ.isLoading;

  const sourceErrors: Array<{ label: string; message: string }> = [];
  if (wasteQ.isError)
    sourceErrors.push({
      label: "Waste approvals",
      message: (wasteQ.error as Error).message,
    });
  if (pcQ.isError)
    sourceErrors.push({
      label: "Count approvals",
      message: (pcQ.error as Error).message,
    });
  if (recQ.isError)
    sourceErrors.push({
      label: "Planning rec approvals",
      message: (recQ.error as Error).message,
    });
  if (excQ.isError)
    sourceErrors.push({
      label: "Exceptions",
      message: (excQ.error as Error).message,
    });

  // -------------------------------------------------------------------------
  // Merge + filter. The unfiltered merged rows are seeded into the
  // ["inbox", "all_rows"] cache so SideNav's badge count reads a stable value.
  // -------------------------------------------------------------------------
  const allRows = useMemo(
    () =>
      mergeInboxRows(
        [
          wasteQ.data ?? [],
          pcQ.data ?? [],
          recQ.data ?? [],
          excQ.data ?? [],
        ],
        filter,
      ),
    [wasteQ.data, pcQ.data, recQ.data, excQ.data, filter],
  );

  // Expose the merged row list to the sidebar badge selector via its own
  // cache key. useQuery with a resolver function keeps the cache fresh.
  useQuery<InboxRow[]>({
    queryKey: QK_ALL,
    queryFn: () => allRows,
    // Refetch-on-render pattern: keep the cache in lockstep with the merged
    // memo. Static on mount; effect below pushes updates.
    enabled: !anyLoading,
  });
  useEffect(() => {
    if (anyLoading) return;
    queryClient.setQueryData<InboxRow[]>(QK_ALL, allRows);
  }, [allRows, anyLoading, queryClient]);

  const visibleRows = useMemo(
    () => applyInboxView(allRows, filter.view, session.user_id || null),
    [allRows, filter.view, session.user_id],
  );

  // -------------------------------------------------------------------------
  // URL-backed filter writers.
  // -------------------------------------------------------------------------
  const updateUrl = useCallback(
    (next: InboxFilter) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      sp.set("view", next.view);
      sp.set("sort", next.sort);
      router.replace(`/inbox?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const setView = useCallback(
    (view: InboxView) => {
      updateUrl({ ...filter, view });
    },
    [filter, updateUrl],
  );

  const setSort = useCallback(
    (sort: InboxSort) => {
      updateUrl({ ...filter, sort });
    },
    [filter, updateUrl],
  );

  // -------------------------------------------------------------------------
  // Mutations — only wired for non-approval exception rows.
  // -------------------------------------------------------------------------
  const invalidateExceptions = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: QK_EXC });
    void queryClient.invalidateQueries({ queryKey: QK_WASTE });
    void queryClient.invalidateQueries({ queryKey: QK_PC });
  }, [queryClient]);

  const ackMutation = useMutation({
    mutationFn: (id: string) => acknowledgeException(id, newIdempotencyKey()),
    onSuccess: (res, id) => {
      if (res.ok) {
        setActionMessage("Acknowledged.");
        invalidateExceptions();
      } else {
        const tail = res.reason_code
          ? `${res.reason_code}${res.detail ? `: ${res.detail}` : ""}`
          : res.detail ?? `HTTP ${res.status}`;
        setActionMessage(`Acknowledge failed — ${tail}`);
      }
      return id;
    },
    onError: (err: unknown) => {
      setActionMessage(
        `Acknowledge failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      resolveException(id, notes, newIdempotencyKey()),
    onSuccess: (res) => {
      if (res.ok) {
        setActionMessage("Resolved.");
        setResolvingId(null);
        invalidateExceptions();
      } else {
        const tail = res.reason_code
          ? `${res.reason_code}${res.detail ? `: ${res.detail}` : ""}`
          : res.detail ?? `HTTP ${res.status}`;
        setActionMessage(`Resolve failed — ${tail}`);
      }
    },
    onError: (err: unknown) => {
      setActionMessage(
        `Resolve failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    },
  });

  // -------------------------------------------------------------------------
  // Render.
  // -------------------------------------------------------------------------
  return (
    <>
      <WorkflowHeader
        eyebrow="Inbox"
        title="Inbox"
        description="Unified triage surface. Approvals + exceptions in one list. Filter by view, sort by severity or age."
        meta={
          <Badge tone="neutral" dotted>
            {visibleRows.length} row{visibleRows.length === 1 ? "" : "s"}
          </Badge>
        }
      />

      <SectionCard contentClassName="p-0">
        <div
          className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3"
          data-testid="inbox-filter-bar"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              View
            </span>
            {INBOX_VIEWS.map((v) => {
              const active = filter.view === v;
              return (
                <button
                  key={v}
                  type="button"
                  data-testid={`inbox-filter-view-${v}`}
                  aria-pressed={active}
                  onClick={() => setView(v)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                    active
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  {VIEW_LABELS[v]}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Sort
            </span>
            {INBOX_SORTS.map((s) => {
              const active = filter.sort === s;
              return (
                <button
                  key={s}
                  type="button"
                  data-testid={`inbox-filter-sort-${s}`}
                  aria-pressed={active}
                  onClick={() => setSort(s)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                    active
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  {SORT_LABELS[s]}
                </button>
              );
            })}
          </div>
        </div>

        {sourceErrors.length > 0 ? (
          <div
            className="border-b border-danger/40 bg-danger-softer px-5 py-2 text-xs text-danger-fg"
            data-testid="inbox-source-errors"
          >
            <div className="font-semibold">
              Some sources failed to load ({sourceErrors.length}/4):
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {sourceErrors.map((e) => (
                <li key={e.label}>
                  <span className="font-medium">{e.label}:</span> {e.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {actionMessage ? (
          <div
            className="border-b border-border/60 bg-bg-subtle/40 px-5 py-2 text-xs text-fg-muted"
            data-testid="inbox-action-message"
          >
            {actionMessage}
          </div>
        ) : null}

        {anyLoading ? (
          <LoadingSkeleton />
        ) : visibleRows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={`No rows in this view — everything caught up.`}
              description={`Try the "All" filter to see rows in other domains.`}
            />
          </div>
        ) : (
          <ul
            className="divide-y divide-border/60"
            data-testid="inbox-list"
          >
            {visibleRows.map((row) => (
              <InboxRowItem
                key={row.id}
                row={row}
                now={now}
                canAct={canAct}
                isResolvingThis={resolvingId === row.id}
                onStartResolve={(id) => {
                  setActionMessage(null);
                  setResolvingId(id);
                }}
                onCancelResolve={() => setResolvingId(null)}
                onConfirmResolve={(id, notes) =>
                  resolveMutation.mutate({ id, notes })
                }
                onAcknowledge={(id) => {
                  setActionMessage(null);
                  ackMutation.mutate(id);
                }}
                ackBusy={
                  ackMutation.isPending &&
                  ackMutation.variables === row.id
                }
                resolveBusy={
                  resolveMutation.isPending &&
                  resolveMutation.variables?.id === row.id
                }
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div
      className="flex flex-col divide-y divide-border/60"
      data-testid="inbox-loading"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-4 px-5 py-4">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded border border-border/50 bg-bg-subtle" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-bg-subtle" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-bg-subtle" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-bg-subtle" />
          </div>
        </div>
      ))}
    </div>
  );
}

function InboxRowItem({
  row,
  now,
  canAct,
  isResolvingThis,
  onStartResolve,
  onCancelResolve,
  onConfirmResolve,
  onAcknowledge,
  ackBusy,
  resolveBusy,
}: {
  row: InboxRow;
  now: Date;
  canAct: boolean;
  isResolvingThis: boolean;
  onStartResolve: (id: string) => void;
  onCancelResolve: () => void;
  onConfirmResolve: (id: string, notes: string) => void;
  onAcknowledge: (id: string) => void;
  ackBusy: boolean;
  resolveBusy: boolean;
}): ReactNode {
  const sev = SEVERITY_CONFIG[row.severity];
  const Icon = sev.icon;
  const isApproval = row.type.startsWith("approval:");
  const canAck =
    canAct && !isApproval && row.inline_actions.includes("acknowledge");
  const canResolve =
    canAct && !isApproval && row.inline_actions.includes("resolve");

  return (
    <li
      className="relative px-5 py-4"
      data-testid="inbox-row"
      data-row-id={row.id}
      data-row-type={row.type}
      data-row-category={row.category}
    >
      <div
        className={cn("absolute inset-y-0 left-0 w-[3px]", sev.accentBar)}
        aria-hidden
      />
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border",
            sev.tone === "danger" &&
              "border-danger/40 bg-danger-softer text-danger",
            sev.tone === "warning" &&
              "border-warning/40 bg-warning-softer text-warning",
            sev.tone === "info" && "border-info/40 bg-info-softer text-info",
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={sev.tone} variant="solid">
              {sev.label}
            </Badge>
            <span
              className="chip"
              data-testid="inbox-row-type"
            >
              {typeLabel(row.type)}
            </span>
            <span
              className="chip"
              data-testid="inbox-row-category"
            >
              {row.category}
            </span>
            <span
              className="ml-auto font-mono text-3xs uppercase tracking-sops text-fg-subtle"
              title={formatTimestamp(row.created_at)}
            >
              {ageHumanized(row.created_at, now)}
            </span>
          </div>
          <div
            className="mt-1.5 text-base font-semibold tracking-tightish text-fg-strong"
            data-testid="inbox-row-summary"
          >
            {row.summary}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isApproval ? (
              <Link
                href={row.deep_link}
                className="btn btn-sm btn-primary gap-1.5"
                data-testid="inbox-row-review"
              >
                Review
                <ArrowRight className="h-3 w-3" strokeWidth={2} />
              </Link>
            ) : null}
            {canAck ? (
              <button
                type="button"
                className="btn btn-sm gap-1.5"
                data-testid="inbox-row-acknowledge"
                disabled={ackBusy}
                onClick={() => onAcknowledge(row.id)}
              >
                <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                {ackBusy ? "Submitting…" : "Acknowledge"}
              </button>
            ) : null}
            {canResolve && !isResolvingThis ? (
              <button
                type="button"
                className="btn btn-sm btn-primary gap-1.5"
                data-testid="inbox-row-resolve"
                onClick={() => onStartResolve(row.id)}
              >
                Resolve
              </button>
            ) : null}
          </div>
          {isResolvingThis ? (
            <ResolvePanel
              busy={resolveBusy}
              onCancel={onCancelResolve}
              onConfirm={(notes) => onConfirmResolve(row.id, notes)}
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}
