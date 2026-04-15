"use client";

import { useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ShieldCheck,
  X,
} from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { SEED_APPROVALS } from "@/lib/fixtures/approvals";
import type { ApprovalDto } from "@/lib/contracts/dto";

const KIND_LABEL: Record<string, string> = {
  waste_adjustment: "Waste / Adjustment",
  physical_count_variance: "Count variance",
  forecast_publish: "Forecast publish",
  purchase_recommendation_bulk: "Bulk purchase approvals",
  goods_receipt_exception: "Receipt exception",
};

export default function ApprovalsInboxPage() {
  const [localState, setLocalState] = useState<
    Record<string, ApprovalDto["status"]>
  >({});

  const pending = SEED_APPROVALS.filter((a) => {
    const state = localState[a.id] ?? a.status;
    return state === "pending";
  });

  const approvedCount = Object.values(localState).filter(
    (s) => s === "approved"
  ).length;
  const rejectedCount = Object.values(localState).filter(
    (s) => s === "rejected"
  ).length;

  const grouped = new Map<string, ApprovalDto[]>();
  for (const a of pending) {
    const arr = grouped.get(a.kind) ?? [];
    arr.push(a);
    grouped.set(a.kind, arr);
  }
  const groups = Array.from(grouped.entries());

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner inbox"
        title="Approvals"
        description="Items awaiting planner review. Each row expands to show the full submission payload and the policy that triggered it."
        meta={
          <>
            <Badge tone="warning" dotted>
              {pending.length} pending
            </Badge>
            {approvedCount > 0 ? (
              <Badge tone="success" dotted>
                {approvedCount} approved this session
              </Badge>
            ) : null}
            {rejectedCount > 0 ? (
              <Badge tone="danger" dotted>
                {rejectedCount} rejected this session
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="space-y-5">
        {groups.length === 0 ? (
          <EmptyState
            icon={
              <CheckCircle2
                className="h-5 w-5 text-success"
                strokeWidth={1.75}
              />
            }
            title="Approvals queue is clear"
            description="Nothing is waiting on your review right now. New items will appear here as operators submit."
          />
        ) : (
          groups.map(([kind, rows]) => (
            <SectionCard
              key={kind}
              eyebrow={`${rows.length} pending`}
              title={KIND_LABEL[kind] ?? kind.replace(/_/g, " ")}
              contentClassName="p-0"
            >
              <ul className="divide-y divide-border/60">
                {rows.map((a) => (
                  <li key={a.id}>
                    <ApprovalRow
                      approval={a}
                      onApprove={() =>
                        setLocalState((s) => ({ ...s, [a.id]: "approved" }))
                      }
                      onReject={() => {
                        const reason = window.prompt("Rejection reason");
                        if (reason) {
                          setLocalState((s) => ({ ...s, [a.id]: "rejected" }));
                        }
                      }}
                    />
                  </li>
                ))}
              </ul>
            </SectionCard>
          ))
        )}
      </div>
    </>
  );
}

function ApprovalRow({
  approval,
  onApprove,
  onReject,
}: {
  approval: ApprovalDto;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group">
      <div className="flex items-start gap-4 px-5 py-4">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-warning/40 bg-warning-softer text-warning">
          <ClipboardList className="h-4 w-4" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-3xs">
            <Badge tone="neutral" dotted>
              {approval.submitter_role}
            </Badge>
            <span className="font-medium text-fg-strong">
              {approval.submitter}
            </span>
            <span className="text-fg-faint">·</span>
            <span className="font-mono uppercase tracking-sops text-fg-subtle">
              {new Date(approval.created_at).toLocaleString(undefined, {
                month: "short",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div className="mt-1 text-base font-semibold tracking-tightish text-fg-strong">
            {approval.summary}
          </div>
          <div className="mt-1.5 flex items-start gap-1.5 text-xs text-fg-muted">
            <ShieldCheck
              className="mt-[3px] h-3 w-3 shrink-0 text-fg-subtle"
              strokeWidth={2}
            />
            <span>
              <span className="font-mono uppercase tracking-sops text-fg-subtle">
                Trigger ·{" "}
              </span>
              {approval.trigger_reason}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-3 inline-flex items-center gap-1 text-3xs font-semibold uppercase tracking-sops text-fg-muted hover:text-fg"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
              strokeWidth={2.5}
            />
            Payload preview
          </button>
          {open ? (
            <pre className="mt-2 overflow-x-auto rounded border border-border/60 bg-bg-subtle p-3 font-mono text-3xs leading-relaxed text-fg-muted">
              {JSON.stringify(approval.payload_preview, null, 2)}
            </pre>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            className="btn btn-primary btn-sm gap-1.5"
            onClick={onApprove}
          >
            <Check className="h-3 w-3" strokeWidth={2.5} />
            Approve
          </button>
          <button
            className="btn btn-sm gap-1.5 text-danger"
            onClick={onReject}
          >
            <X className="h-3 w-3" strokeWidth={2} />
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
