"use client";

// ---------------------------------------------------------------------------
// /exceptions — live Exceptions Inbox for planner + admin.
//
// Scope (W2 Mode B, ExceptionsInbox only):
//   - Lists rows from GET /api/v1/queries/exceptions (via portal proxy at
//     /api/exceptions).
//   - Filters: status (multi-select over ['open','acknowledged','resolved',
//     'auto_resolved']); severity (info | warning | critical | clear);
//     category (optional exact-match text input).
//   - Planner/admin actions: Acknowledge (open only) and Resolve with required
//     resolution_notes (open | acknowledged).
//
// Backed contract:
//   src/app/api/exceptions/route.ts                        (GET proxy)
//   src/app/api/exceptions/[id]/acknowledge/route.ts       (POST proxy)
//   src/app/api/exceptions/[id]/resolve/route.ts           (POST proxy)
//
// No bulk actions, no multi-select UI, no search, no pagination redesign, no
// invented fields. The row projection is the API response verbatim.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldCheck,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { NotesBox } from "@/components/fields/NotesBox";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Row shape — verbatim projection from
//   GET /api/v1/queries/exceptions
// per the RUNTIME_READY signal: the handler selects directly from
// private_core.exceptions with view-shape columns. Do NOT synthesize extra
// fields (no client-computed age / bucket / urgency).
// ---------------------------------------------------------------------------
type ExceptionStatus = "open" | "acknowledged" | "resolved" | "auto_resolved";
type ExceptionSeverity = "info" | "warning" | "critical";

interface ExceptionRow {
  exception_id: string;
  category: string;
  severity: ExceptionSeverity;
  source: string;
  title: string;
  detail: string | null;
  status: ExceptionStatus;
  created_at: string;
  recommended_action: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
}

interface ListResponse {
  rows: ExceptionRow[];
  count: number;
}

const STATUS_OPTIONS: ExceptionStatus[] = [
  "open",
  "acknowledged",
  "resolved",
  "auto_resolved",
];

const DEFAULT_STATUSES: Set<ExceptionStatus> = new Set([
  "open",
  "acknowledged",
]);

const SEVERITY_CONFIG: Record<
  ExceptionSeverity,
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

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `exc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function sessionHeaders(_session: Session): HeadersInit {
  return {
    "Content-Type": "application/json",
  };
}

function buildQueryString(
  statuses: Set<ExceptionStatus>,
  severity: ExceptionSeverity | null,
  category: string,
): string {
  const sp = new URLSearchParams();
  if (statuses.size > 0 && statuses.size < STATUS_OPTIONS.length) {
    sp.set("status", Array.from(statuses).join(","));
  }
  if (severity) sp.set("severity", severity);
  const cat = category.trim();
  if (cat.length > 0) sp.set("category", cat);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

async function fetchExceptions(
  session: Session,
  statuses: Set<ExceptionStatus>,
  severity: ExceptionSeverity | null,
  category: string,
): Promise<ListResponse> {
  const qs = buildQueryString(statuses, severity, category);
  const res = await fetch(`/api/exceptions${qs}`, {
    method: "GET",
    headers: sessionHeaders(session),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Exceptions list failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as ListResponse;
}

interface ActionErrorShape {
  message: string;
  status: number;
  reason_code?: string;
  detail?: string;
}

async function postAcknowledge(
  id: string,
  session: Session,
): Promise<void> {
  const res = await fetch(
    `/api/exceptions/${encodeURIComponent(id)}/acknowledge`,
    {
      method: "POST",
      headers: sessionHeaders(session),
      body: JSON.stringify({ idempotency_key: newIdempotencyKey() }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const err: ActionErrorShape = {
      message: `Acknowledge failed (HTTP ${res.status})`,
      status: res.status,
      reason_code:
        typeof body.reason_code === "string" ? body.reason_code : undefined,
      detail: typeof body.detail === "string" ? body.detail : undefined,
    };
    throw err;
  }
}

async function postResolve(
  id: string,
  session: Session,
  resolution_notes: string,
): Promise<void> {
  const res = await fetch(
    `/api/exceptions/${encodeURIComponent(id)}/resolve`,
    {
      method: "POST",
      headers: sessionHeaders(session),
      body: JSON.stringify({
        idempotency_key: newIdempotencyKey(),
        resolution_notes,
      }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const err: ActionErrorShape = {
      message: `Resolve failed (HTTP ${res.status})`,
      status: res.status,
      reason_code:
        typeof body.reason_code === "string" ? body.reason_code : undefined,
      detail: typeof body.detail === "string" ? body.detail : undefined,
    };
    throw err;
  }
}

function formatTimestamp(iso: string): string {
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

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "\u2026";
}

function entityShortform(row: ExceptionRow): string {
  if (!row.related_entity_type && !row.related_entity_id) return "\u2014";
  const t = row.related_entity_type ?? "?";
  const id = row.related_entity_id ?? "?";
  return `${t}:${truncate(id, 12)}`;
}

// Map an exception's related entity to a portal deep-link when we know one.
// Returns null when no clickable target exists; callers render plain text
// in that case.
function entityHref(row: ExceptionRow): string | null {
  if (!row.related_entity_type || !row.related_entity_id) return null;
  switch (row.related_entity_type) {
    case "physical-count-submission":
      return `/inbox/approvals/physical-count/${encodeURIComponent(row.related_entity_id)}`;
    case "waste-adjustment-submission":
      return `/inbox/approvals/waste/${encodeURIComponent(row.related_entity_id)}`;
    default:
      return null;
  }
}

function StatusPill({ status }: { status: ExceptionStatus }) {
  if (status === "resolved") {
    return (
      <Badge tone="success" dotted>
        Resolved
      </Badge>
    );
  }
  if (status === "auto_resolved") {
    return (
      <Badge tone="success" dotted>
        Auto-resolved
      </Badge>
    );
  }
  if (status === "acknowledged") {
    return (
      <Badge tone="warning" dotted>
        Acknowledged
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" dotted>
      Open
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Resolve dialog — inline panel under the acting row. One required textarea
// (1..2000 chars). Confirm disabled when empty.
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
        data-testid="exceptions-resolve-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Explain what was done."
      />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          data-testid="exceptions-resolve-confirm"
          disabled={!canSubmit}
          onClick={() => onConfirm(notes)}
        >
          {busy ? "Submitting…" : "Confirm resolve"}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          data-testid="exceptions-resolve-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function ExceptionsInboxPage() {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const canAct = session.role === "planner" || session.role === "admin";

  const [statuses, setStatuses] = useState<Set<ExceptionStatus>>(
    () => new Set(DEFAULT_STATUSES),
  );
  const [severity, setSeverity] = useState<ExceptionSeverity | null>(null);
  const [category, setCategory] = useState<string>("");

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const statusesKey = useMemo(
    () => Array.from(statuses).sort().join(","),
    [statuses],
  );

  const queryKey = [
    "exceptions",
    statusesKey,
    severity ?? "",
    category.trim(),
    session.role,
  ] as const;

  const listQuery = useQuery<ListResponse>({
    queryKey,
    queryFn: () => fetchExceptions(session, statuses, severity, category),
  });

  const refetchList = () =>
    queryClient.invalidateQueries({ queryKey: ["exceptions"] });

  const ackMutation = useMutation({
    mutationFn: (id: string) => postAcknowledge(id, session),
    onSuccess: () => {
      setActionMessage("Acknowledged.");
      refetchList();
    },
    onError: (err: unknown) => {
      const e = err as ActionErrorShape;
      const detail = e.reason_code
        ? `${e.reason_code}${e.detail ? `: ${e.detail}` : ""}`
        : e.detail ?? e.message;
      setActionMessage(`Acknowledge failed \u2014 ${detail}`);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (args: { id: string; notes: string }) =>
      postResolve(args.id, session, args.notes),
    onSuccess: () => {
      setActionMessage("Resolved.");
      setResolvingId(null);
      refetchList();
    },
    onError: (err: unknown) => {
      const e = err as ActionErrorShape;
      const detail = e.reason_code
        ? `${e.reason_code}${e.detail ? `: ${e.detail}` : ""}`
        : e.detail ?? e.message;
      setActionMessage(`Resolve failed \u2014 ${detail}`);
    },
  });

  const toggleStatus = (s: ExceptionStatus) => {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const clearFilters = () => {
    setStatuses(new Set(DEFAULT_STATUSES));
    setSeverity(null);
    setCategory("");
  };

  const rows = listQuery.data?.rows ?? [];
  const count = listQuery.data?.count ?? 0;

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner inbox"
        title="Exceptions"
        description="Triage exceptions emitted by jobs, integrations, and integrity checks. Acknowledge or resolve with a note."
        meta={
          <Badge tone="neutral" dotted>
            {count} row{count === 1 ? "" : "s"}
          </Badge>
        }
      />

      <SectionCard contentClassName="p-0">
        <div
          className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3"
          data-testid="exceptions-filter-bar"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Status
            </span>
            {STATUS_OPTIONS.map((s) => {
              const active = statuses.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  data-testid={`exceptions-filter-status-${s}`}
                  aria-pressed={active}
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                    active
                      ? "border-accent/50 bg-accent-soft text-accent"
                      : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                  )}
                >
                  {s.replace("_", " ")}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Severity
            </span>
            {(["info", "warning", "critical"] as ExceptionSeverity[]).map(
              (sv) => {
                const active = severity === sv;
                return (
                  <button
                    key={sv}
                    type="button"
                    data-testid={`exceptions-filter-severity-${sv}`}
                    aria-pressed={active}
                    onClick={() => setSeverity((c) => (c === sv ? null : sv))}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-colors duration-150",
                      active
                        ? "border-accent/50 bg-accent-soft text-accent"
                        : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg",
                    )}
                  >
                    {sv}
                  </button>
                );
              },
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <label
              htmlFor="exceptions-category-input"
              className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
            >
              Category
            </label>
            <input
              id="exceptions-category-input"
              data-testid="exceptions-filter-category"
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="exact match"
              className="input h-7 w-40 text-xs"
            />
          </div>

          <button
            type="button"
            className="btn btn-sm ml-auto"
            data-testid="exceptions-filter-clear"
            onClick={clearFilters}
          >
            Reset filters
          </button>
        </div>

        {actionMessage ? (
          <div
            className="border-b border-border/60 bg-bg-subtle/40 px-5 py-2 text-xs text-fg-muted"
            data-testid="exceptions-action-message"
          >
            {actionMessage}
          </div>
        ) : null}

        {listQuery.isLoading ? (
          <div className="p-5 text-xs text-fg-muted">Loading…</div>
        ) : listQuery.isError ? (
          <div className="p-5 text-xs text-danger-fg">
            {(listQuery.error as Error).message}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No exceptions in this view."
              description="Adjust the filter chips above to see other rows."
            />
          </div>
        ) : (
          <ul
            className="divide-y divide-border/60"
            data-testid="exceptions-list"
          >
            {rows.map((row) => {
              const c = SEVERITY_CONFIG[row.severity];
              const Icon = c.icon;
              const canAck = canAct && row.status === "open";
              const canResolve =
                canAct &&
                (row.status === "open" || row.status === "acknowledged");
              const isResolving = resolvingId === row.exception_id;
              const ackPending =
                ackMutation.isPending &&
                ackMutation.variables === row.exception_id;
              const resolvePending =
                resolveMutation.isPending &&
                resolveMutation.variables?.id === row.exception_id;
              return (
                <li
                  key={row.exception_id}
                  className="relative px-5 py-4"
                  data-testid="exceptions-row"
                  data-exception-id={row.exception_id}
                  data-status={row.status}
                >
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 w-[3px]",
                      c.accentBar,
                    )}
                    aria-hidden
                  />
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border",
                        c.tone === "danger" &&
                          "border-danger/40 bg-danger-softer text-danger",
                        c.tone === "warning" &&
                          "border-warning/40 bg-warning-softer text-warning",
                        c.tone === "info" &&
                          "border-info/40 bg-info-softer text-info",
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={c.tone} variant="solid">
                          {c.label}
                        </Badge>
                        <span
                          className="chip"
                          data-testid="exceptions-row-category"
                        >
                          {row.category}
                        </span>
                        <StatusPill status={row.status} />
                        <span className="font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                          {row.source}
                        </span>
                        <span className="ml-auto font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                          {formatTimestamp(row.created_at)}
                        </span>
                      </div>
                      <div
                        className="mt-1.5 text-base font-semibold tracking-tightish text-fg-strong"
                        data-testid="exceptions-row-title"
                      >
                        {row.title}
                      </div>
                      {row.detail ? (
                        <div className="mt-1 text-sm leading-relaxed text-fg-muted">
                          {row.detail}
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-3 text-3xs text-fg-subtle">
                        <span>
                          entity:{" "}
                          {entityHref(row) ? (
                            <Link
                              href={entityHref(row)!}
                              className="font-mono text-fg-muted underline underline-offset-2 hover:no-underline"
                              data-testid="exceptions-row-entity-link"
                            >
                              {entityShortform(row)}
                            </Link>
                          ) : (
                            <span className="font-mono text-fg-muted">
                              {entityShortform(row)}
                            </span>
                          )}
                        </span>
                      </div>
                      {row.recommended_action ? (
                        <div className="mt-2 flex gap-3 rounded border border-info/30 bg-info-softer p-3">
                          <ShieldCheck
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info"
                            strokeWidth={2}
                          />
                          <div>
                            <div className="text-3xs font-semibold uppercase tracking-sops text-info-fg">
                              Recommended action
                            </div>
                            <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                              {row.recommended_action}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {canAct ? (
                        <div className="mt-3 flex gap-2">
                          {canAck ? (
                            <button
                              type="button"
                              className="btn btn-sm gap-1.5"
                              data-testid="exceptions-row-acknowledge"
                              disabled={ackPending}
                              onClick={() => {
                                setActionMessage(null);
                                ackMutation.mutate(row.exception_id);
                              }}
                            >
                              <CheckCircle2
                                className="h-3 w-3"
                                strokeWidth={2}
                              />
                              {ackPending ? "Submitting\u2026" : "Acknowledge"}
                            </button>
                          ) : null}
                          {canResolve && !isResolving ? (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm gap-1.5"
                              data-testid="exceptions-row-resolve"
                              onClick={() => {
                                setActionMessage(null);
                                setResolvingId(row.exception_id);
                              }}
                            >
                              Resolve
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {isResolving ? (
                        <ResolvePanel
                          busy={resolvePending}
                          onCancel={() => setResolvingId(null)}
                          onConfirm={(notes) =>
                            resolveMutation.mutate({
                              id: row.exception_id,
                              notes,
                            })
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
