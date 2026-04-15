"use client";

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { SearchFilterBar } from "@/components/data/SearchFilterBar";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { SEED_EXCEPTIONS } from "@/lib/fixtures/exceptions";
import type { ExceptionSeverity } from "@/lib/contracts/enums";
import type { ExceptionDto } from "@/lib/contracts/dto";
import { cn } from "@/lib/cn";

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

export default function ExceptionsInboxPage() {
  const [query, setQuery] = useState("");
  const [sev, setSev] = useState<ExceptionSeverity | null>(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "all">("open");
  const [localState, setLocalState] = useState<
    Record<string, ExceptionDto["status"]>
  >({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = SEED_EXCEPTIONS.filter((e) => {
    const status = localState[e.id] ?? e.status;
    if (statusFilter === "open" && status === "resolved") return false;
    if (sev && e.severity !== sev) return false;
    if (query && !e.title.toLowerCase().includes(query.toLowerCase()))
      return false;
    return true;
  });

  const counts = SEED_EXCEPTIONS.reduce(
    (acc, e) => {
      const status = localState[e.id] ?? e.status;
      if (status !== "resolved") acc[e.severity]++;
      return acc;
    },
    { critical: 0, warning: 0, info: 0 } as Record<ExceptionSeverity, number>
  );

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner inbox"
        title="Exceptions"
        description="Triage exceptions emitted by jobs, integrations, and integrity checks. Acknowledge, resolve with a note, or drill into the source."
        meta={
          <>
            <Badge tone="danger" dotted>
              {counts.critical} critical
            </Badge>
            <Badge tone="warning" dotted>
              {counts.warning} warning
            </Badge>
            <Badge tone="neutral" dotted>
              {counts.info} info
            </Badge>
          </>
        }
      />

      <SectionCard contentClassName="p-0">
        <div className="border-b border-border/60 px-5 py-3">
          <SearchFilterBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Search exceptions"
            chips={[
              ...(["critical", "warning", "info"] as ExceptionSeverity[]).map(
                (s) => ({
                  key: s,
                  label: s,
                  active: sev === s,
                  onToggle: () => setSev((c) => (c === s ? null : s)),
                })
              ),
              {
                key: "status",
                label: statusFilter === "open" ? "Open only" : "All statuses",
                active: statusFilter === "all",
                onToggle: () =>
                  setStatusFilter((c) => (c === "open" ? "all" : "open")),
              },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<Sparkles className="h-5 w-5 text-success" strokeWidth={1.5} />}
              title="Nothing to triage"
              description="All exceptions are resolved or filtered out. Clear the filter chips above to see everything."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((e) => {
              const status = localState[e.id] ?? e.status;
              const isOpen = expanded === e.id;
              const c = SEVERITY_CONFIG[e.severity];
              const Icon = c.icon;
              return (
                <li
                  key={e.id}
                  className="relative overflow-hidden transition-colors duration-150"
                >
                  <div className={cn("absolute inset-y-0 left-0 w-[3px]", c.accentBar)} />
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : e.id)}
                    className={cn(
                      "flex w-full items-start gap-4 px-5 py-4 text-left transition-colors duration-150",
                      isOpen ? "bg-bg-subtle/50" : "hover:bg-bg-subtle/30"
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border",
                        c.tone === "danger" && "border-danger/40 bg-danger-softer text-danger",
                        c.tone === "warning" && "border-warning/40 bg-warning-softer text-warning",
                        c.tone === "info" && "border-info/40 bg-info-softer text-info"
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={c.tone} variant="solid">
                          {c.label}
                        </Badge>
                        <span className="chip">{e.source}</span>
                        <StatusPill status={status} />
                        <span className="ml-auto font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                          {new Date(e.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="mt-1.5 text-base font-semibold tracking-tightish text-fg-strong">
                        {e.title}
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "mt-1 h-4 w-4 shrink-0 text-fg-faint transition-transform duration-150",
                        isOpen && "rotate-180 text-fg-muted"
                      )}
                      strokeWidth={2}
                    />
                  </button>
                  {isOpen ? (
                    <div className="animate-fade-in border-t border-border/60 bg-bg-subtle/30 px-5 py-4">
                      <div className="max-w-3xl space-y-4 pl-12">
                        <div>
                          <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                            Detail
                          </div>
                          <div className="mt-1 text-sm leading-relaxed text-fg">
                            {e.detail}
                          </div>
                        </div>
                        {e.recommended_action ? (
                          <div className="flex gap-3 rounded border border-info/30 bg-info-softer p-3">
                            <ShieldCheck
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info"
                              strokeWidth={2}
                            />
                            <div>
                              <div className="text-3xs font-semibold uppercase tracking-sops text-info-fg">
                                Recommended action
                              </div>
                              <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                                {e.recommended_action}
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <div className="flex gap-2">
                          <button
                            className="btn btn-sm gap-1.5"
                            onClick={() =>
                              setLocalState((s) => ({
                                ...s,
                                [e.id]: "acknowledged",
                              }))
                            }
                          >
                            <CheckCircle2
                              className="h-3 w-3"
                              strokeWidth={2}
                            />
                            Acknowledge
                          </button>
                          <button
                            className="btn btn-primary btn-sm gap-1.5"
                            onClick={() => {
                              const note = window.prompt("Resolution note");
                              if (note) {
                                setLocalState((s) => ({
                                  ...s,
                                  [e.id]: "resolved",
                                }));
                              }
                            }}
                          >
                            <TriangleAlert
                              className="h-3 w-3"
                              strokeWidth={2}
                            />
                            Resolve with note
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

function StatusPill({ status }: { status: ExceptionDto["status"] }) {
  if (status === "resolved") return <Badge tone="success" dotted>Resolved</Badge>;
  if (status === "acknowledged")
    return <Badge tone="warning" dotted>Acknowledged</Badge>;
  return <Badge tone="neutral" dotted>Open</Badge>;
}
