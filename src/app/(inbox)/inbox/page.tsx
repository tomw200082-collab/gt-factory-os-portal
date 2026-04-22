"use client";

// ---------------------------------------------------------------------------
// Inbox — federated triage surface.
//
// Tranche 014 replacement of the previous one-link stub. Federates open +
// acknowledged exceptions from /api/exceptions (an existing GET endpoint
// already used by /exceptions). Each row deep-links: when the exception
// relates to an approvable submission (physical-count, waste-adjustment),
// it links to /inbox/approvals/{type}/{id}; otherwise it links to the
// exceptions page for the full resolve UX.
//
// What's NOT here (deferred to Tranche when /api/approvals lands):
//   - direct listing of pending operator approvals (waste, physical-count)
//     that the planner hasn't yet seen — currently each appears here only
//     once the upstream "PENDING_APPROVAL" exception is created against it.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Inbox as InboxIcon,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";

// Mirror subset of /exceptions/page.tsx ExceptionRow — we only read the
// fields used here. Keep aligned with upstream.
interface ExceptionRow {
  exception_id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low" | string;
  status: "open" | "acknowledged" | "resolved" | "auto_resolved" | string;
  source: string;
  title: string;
  detail?: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
}

interface ListResponse {
  rows: ExceptionRow[];
  count: number;
}

async function fetchInboxExceptions(): Promise<ListResponse> {
  // Match the planner page's filter shape: surface open + acknowledged
  // (resolved/auto_resolved are out of triage scope).
  const url =
    "/api/exceptions?status=open&status=acknowledged&limit=50";
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${url} failed (HTTP ${res.status}): ${body}`);
  }
  return (await res.json()) as ListResponse;
}

// Mirror of the T005 mapping in /exceptions/page.tsx. When an exception's
// related entity is an approvable submission, deep-link to its approval
// surface; otherwise route to the exceptions page for the full UX.
function entityHref(row: ExceptionRow): {
  href: string;
  label: string;
  isApproval: boolean;
} {
  if (row.related_entity_type && row.related_entity_id) {
    if (row.related_entity_type === "physical-count-submission") {
      return {
        href: `/inbox/approvals/physical-count/${encodeURIComponent(row.related_entity_id)}`,
        label: "Open approval",
        isApproval: true,
      };
    }
    if (row.related_entity_type === "waste-adjustment-submission") {
      return {
        href: `/inbox/approvals/waste/${encodeURIComponent(row.related_entity_id)}`,
        label: "Open approval",
        isApproval: true,
      };
    }
  }
  return { href: "/exceptions", label: "Open exception", isApproval: false };
}

function severityClasses(sev: string): string {
  switch (sev) {
    case "critical":
      return "bg-danger";
    case "high":
      return "bg-warning";
    case "medium":
      return "bg-info";
    case "low":
    default:
      return "bg-fg-faint";
  }
}

function relativeAge(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then);
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
  } catch {
    return iso;
  }
}

function StatusPill({ status }: { status: string }): JSX.Element {
  if (status === "open") return <Badge tone="warning" dotted>Open</Badge>;
  if (status === "acknowledged")
    return <Badge tone="info" dotted>Acknowledged</Badge>;
  return <Badge tone="neutral">{status}</Badge>;
}

export default function InboxLandingPage() {
  const q = useQuery<ListResponse>({
    queryKey: ["inbox", "exceptions", "triage"],
    queryFn: fetchInboxExceptions,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const rows = q.data?.rows ?? [];
  const openCount = rows.filter((r) => r.status === "open").length;
  const ackCount = rows.filter((r) => r.status === "acknowledged").length;

  return (
    <>
      <WorkflowHeader
        eyebrow="Inbox"
        title="Triage queue"
        description="Open and acknowledged exceptions that need your attention. Rows with an approvable related submission deep-link to the approval surface; everything else opens in /exceptions."
        meta={
          <>
            <Badge tone={openCount > 0 ? "warning" : "neutral"} dotted>
              {openCount} open
            </Badge>
            <Badge tone="info" dotted>
              {ackCount} ack
            </Badge>
          </>
        }
      />

      <SectionCard contentClassName="p-0">
        {q.isLoading ? (
          <div
            className="p-5 text-sm text-fg-muted"
            data-testid="inbox-loading"
          >
            Loading inbox…
          </div>
        ) : q.isError ? (
          <div
            className="m-4 rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
            role="alert"
            data-testid="inbox-error"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                strokeWidth={2}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium">Couldn&apos;t load inbox.</div>
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs opacity-80">
                  {(q.error as Error).message}
                </pre>
              </div>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2 px-4 py-10 text-center"
            data-testid="inbox-empty"
          >
            <CheckCircle2
              className="h-7 w-7 text-success-fg"
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="text-base font-semibold text-fg-strong">
              Inbox is clear.
            </div>
            <div className="max-w-sm text-sm text-fg-muted">
              No open or acknowledged exceptions in the triage window. New
              items will appear here as they&apos;re raised by the system.
            </div>
          </div>
        ) : (
          <ul
            className="divide-y divide-border/60"
            data-testid="inbox-list"
          >
            {rows.map((r) => {
              const target = entityHref(r);
              return (
                <li
                  key={r.exception_id}
                  className="flex items-start gap-3 px-4 py-3"
                  data-testid="inbox-row"
                  data-exception-id={r.exception_id}
                  data-related-type={r.related_entity_type ?? ""}
                >
                  <span
                    className={cn(
                      "mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full",
                      severityClasses(r.severity),
                    )}
                    aria-hidden
                    title={`severity: ${r.severity}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <Badge tone="neutral" dotted>
                        {r.category}
                      </Badge>
                      <StatusPill status={r.status} />
                      <span className="ml-auto text-3xs text-fg-faint">
                        {relativeAge(r.created_at)}
                      </span>
                    </div>
                    <div
                      className="mt-1 text-sm font-medium text-fg-strong"
                      data-testid="inbox-row-title"
                    >
                      {r.title}
                    </div>
                    {r.detail ? (
                      <div className="mt-0.5 line-clamp-2 text-xs text-fg-muted">
                        {r.detail}
                      </div>
                    ) : null}
                    <div className="mt-2">
                      <Link
                        href={target.href}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                        data-testid="inbox-row-link"
                      >
                        {target.isApproval ? (
                          <ExternalLink
                            className="h-3 w-3"
                            strokeWidth={2}
                            aria-hidden
                          />
                        ) : (
                          <ArrowRight
                            className="h-3 w-3"
                            strokeWidth={2}
                            aria-hidden
                          />
                        )}
                        {target.label}
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        eyebrow="See all"
        title="Full exceptions list"
        description="Filter by status / severity / category, acknowledge in batch, resolve with notes."
      >
        <Link
          href="/exceptions"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <InboxIcon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Open /exceptions
        </Link>
      </SectionCard>
    </>
  );
}
