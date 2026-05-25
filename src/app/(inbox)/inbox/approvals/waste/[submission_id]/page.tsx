"use client";

// Planner-scoped Waste approval/reject screen.
// Consumes:
//   GET /api/waste-adjustments/:submission_id  → decision-grade context
//   POST /api/waste-adjustments/:submission_id/{approve,reject}
// Contract refs:
//   docs/waste_adjustment_runtime_contract.md §1.7 (approve/reject envelopes)
//                                              §1.8 (response shapes)

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session-provider";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { SuccessState } from "@/components/feedback/states";
import { NotesBox } from "@/components/fields/NotesBox";
import type {
  WasteApprovalSuccessResponse,
  WasteRejectionSuccessResponse,
  WasteConflictResponse,
} from "@/lib/contracts/waste-adjustments";

interface WasteAdjustmentDetail {
  submission_id: string;
  status: string;
  direction: string;
  item_type: string;
  item_id: string;
  item_display_name: string | null;
  quantity: string;
  unit: string;
  reason_code: string;
  notes: string | null;
  submitted_by_user_id: string | null;
  submitted_by_display_name: string | null;
  event_at: string;
  submitted_at: string;
  exception_category: string | null;
}

type ReviewOutcome =
  | { kind: "approved"; body: WasteApprovalSuccessResponse }
  | { kind: "rejected"; body: WasteRejectionSuccessResponse }
  | { kind: "conflict"; body: WasteConflictResponse }
  | { kind: "network"; message: string };

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function callApprove(
  submissionId: string,
  _session: import("@/lib/auth/fake-auth").Session,
  approval_notes: string | null,
): Promise<ReviewOutcome> {
  try {
    const res = await fetch(
      `/api/waste-adjustments/${encodeURIComponent(submissionId)}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotency_key: newIdempotencyKey(), approval_notes }),
      },
    );
    const body = await res.json().catch(() => undefined);
    if (res.status === 200 && body && "status" in body) {
      return { kind: "approved", body: body as WasteApprovalSuccessResponse };
    }
    if (res.status === 409) return { kind: "conflict", body: body as WasteConflictResponse };
    return { kind: "network", message: "Could not complete the action. Check your connection and try again." };
  } catch (err) {
    return { kind: "network", message: err instanceof Error ? err.message : String(err) };
  }
}

async function callReject(
  submissionId: string,
  _session: import("@/lib/auth/fake-auth").Session,
  rejection_reason: string,
): Promise<ReviewOutcome> {
  try {
    const res = await fetch(
      `/api/waste-adjustments/${encodeURIComponent(submissionId)}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotency_key: newIdempotencyKey(), rejection_reason }),
      },
    );
    const body = await res.json().catch(() => undefined);
    if (res.status === 200 && body && "status" in body) {
      return { kind: "rejected", body: body as WasteRejectionSuccessResponse };
    }
    if (res.status === 409) return { kind: "conflict", body: body as WasteConflictResponse };
    return { kind: "network", message: "Could not complete the action. Check your connection and try again." };
  } catch (err) {
    return { kind: "network", message: err instanceof Error ? err.message : String(err) };
  }
}

function friendlyWasteConflict(reasonCode: string, fallbackDetail: string): string {
  switch (reasonCode) {
    case "SELF_APPROVAL_FORBIDDEN":
      return "You cannot approve your own submission. Ask another planner or admin to review it.";
    case "NOT_PENDING":
      return "This submission is no longer pending — another reviewer may have already actioned it. Refresh the inbox.";
    case "IDEMPOTENCY_KEY_REUSED":
      return "This action was already submitted. Refresh the inbox to see the result.";
    case "SUBMISSION_NOT_FOUND":
      return "Submission not found. It may have been removed.";
    case "COUNT_FREEZE_ACTIVE":
      return "A physical count is in progress for this item. Wait for the count to be approved or rejected before posting this adjustment.";
    case "THRESHOLD_NOT_CONFIGURED":
      return "Auto-post threshold is not configured for this item type. Ask an admin to set the policy.";
    default:
      return fallbackDetail || "This submission cannot be actioned in its current state. Refresh the page and try again.";
  }
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-32 shrink-0 text-fg-subtle">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}

export default function WasteReviewPage() {
  const { session } = useSession();
  const params = useParams<{ submission_id: string }>();
  const submissionId = params.submission_id;
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const detailQuery = useQuery<WasteAdjustmentDetail>({
    queryKey: ["waste-adjustment-detail", submissionId],
    queryFn: async () => {
      const res = await fetch(`/api/waste-adjustments/${encodeURIComponent(submissionId)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Could not load submission details.");
      return (await res.json()) as WasteAdjustmentDetail;
    },
    enabled: !!submissionId,
    staleTime: 30_000,
  });

  const d = detailQuery.data;

  const handleApprove = async () => {
    setBusy(true);
    const r = await callApprove(submissionId, session, approvalNotes || null);
    setOutcome(r);
    setBusy(false);
  };
  const handleReject = async () => {
    if (!rejectionReason.trim()) return;
    setBusy(true);
    const r = await callReject(submissionId, session, rejectionReason);
    setOutcome(r);
    setBusy(false);
  };

  if (outcome?.kind === "approved") {
    const itemLabel = d?.item_display_name ?? d?.item_id ?? "item";
    const directionVerb = d?.direction === "loss" ? "decreased by" : "increased by";
    const amount = d ? `${d.quantity} ${d.unit}` : "the submitted amount";
    const shortLedger = outcome.body.stock_ledger_movement_id.slice(0, 8);
    return (
      <SuccessState
        title="Approved — stock updated"
        description={`${itemLabel} ${directionVerb} ${amount}. Ledger ref ${shortLedger}…`}
        action={
          <Link href="/inbox" className="btn btn-sm btn-primary">
            Back to inbox
          </Link>
        }
      />
    );
  }
  if (outcome?.kind === "rejected") {
    const itemLabel = d?.item_display_name ?? d?.item_id ?? "submission";
    return (
      <SuccessState
        title="Rejected — stock unchanged"
        description={`${itemLabel}: no ledger row created. Reason: ${outcome.body.rejection_reason}`}
        tone="warning"
        action={
          <Link href="/inbox" className="btn btn-sm btn-primary">
            Back to inbox
          </Link>
        }
      />
    );
  }
  if (outcome?.kind === "conflict") {
    // The 409 conflict response carries a typed `reason_code` per
    // src/lib/contracts/waste-adjustments.ts WasteConflictReason.
    const friendly = friendlyWasteConflict(outcome.body.reason_code, outcome.body.detail);
    return (
      <SuccessState
        title="Action refused"
        description={friendly}
        tone="warning"
        action={
          <>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setOutcome(null)}>
              Try again
            </button>
            <Link href="/inbox" className="btn btn-sm">
              Back to inbox
            </Link>
          </>
        }
      />
    );
  }
  if (outcome?.kind === "network") {
    return (
      <SuccessState
        title="Network error"
        description={outcome.message}
        tone="warning"
        action={
          <>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setOutcome(null)}>
              Try again
            </button>
            <Link href="/inbox" className="btn btn-sm">
              Back to inbox
            </Link>
          </>
        }
      />
    );
  }

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner review"
        title="Waste / Adjustment"
        description={
          d
            ? `${d.item_display_name ?? d.item_id} · ${d.direction === "loss" ? "Loss" : "Positive correction"} · ${d.quantity} ${d.unit}`
            : `Submission ${submissionId}`
        }
        meta={
          <Link href="/inbox" className="btn btn-sm">
            <ArrowLeft className="h-3 w-3" />
            Back to inbox
          </Link>
        }
      />

      {detailQuery.isLoading ? (
        <div className="mb-4 rounded-md border border-border/60 bg-bg-subtle/40 p-4 text-xs text-fg-muted">
          Loading submission details…
        </div>
      ) : detailQuery.isError ? (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger-softer p-4 text-xs text-danger-fg">
          Could not load submission details. You may still approve or reject below, but context is unavailable.
        </div>
      ) : d ? (
        <div className="mb-5 rounded-md border border-border/60 bg-bg-subtle/40 p-4 space-y-1.5">
          <div className="mb-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Submission details
          </div>
          <DetailRow
            label="Item"
            value={
              d.item_display_name
                ? `${d.item_display_name} · ${d.item_id}`
                : d.item_id
            }
          />
          <DetailRow
            label="Action"
            value={
              d.direction === "loss" ? (
                <span className="text-danger-fg font-medium">Loss / write-down</span>
              ) : (
                <span className="text-warning-fg font-medium">Positive correction</span>
              )
            }
          />
          <DetailRow label="Amount" value={`${d.quantity} ${d.unit}`} />
          <DetailRow label="Reason" value={d.reason_code.replace(/_/g, " ")} />
          {d.notes ? <DetailRow label="Notes" value={d.notes} /> : null}
          <DetailRow
            label="Event time"
            value={new Date(d.event_at).toLocaleString()}
          />
          <DetailRow
            label="Submitted"
            value={`${new Date(d.submitted_at).toLocaleString()}${d.submitted_by_display_name ? ` by ${d.submitted_by_display_name}` : ""}`}
          />
          {d.exception_category ? (
            <DetailRow
              label="Why approval needed"
              value={d.exception_category.replace(/_/g, " ")}
            />
          ) : null}
          <DetailRow
            label="Current status"
            value={
              <span
                className={
                  d.status === "pending"
                    ? "text-warning-fg font-medium"
                    : d.status === "posted"
                      ? "text-success-fg font-medium"
                      : "text-fg-muted"
                }
              >
                {d.status}
              </span>
            }
          />
        </div>
      ) : null}

      {/* Preemptive self-approval guard. Waste forbids self-approval for
          every role (handler enforces 409 SELF_APPROVAL_FORBIDDEN). Disable
          the action sections in the UI when the reviewer is the submitter
          so they don't have to learn the rule by hitting a 409. */}
      {d?.submitted_by_user_id && d.submitted_by_user_id === session.user_id ? (
        <div
          className="mb-5 rounded-md border border-warning/40 bg-warning-softer/60 p-4 text-sm text-warning-fg"
          data-testid="waste-review-self-approval-block"
        >
          <div className="font-semibold">You cannot approve your own submission</div>
          <div className="mt-1 text-xs">
            Waste adjustments must be reviewed by a different planner or admin.
            Ask another reviewer to open this submission from the inbox.
          </div>
        </div>
      ) : null}

      <SectionCard
        eyebrow="Approve"
        title="Accept this adjustment"
        description="Approving posts the submission to the ledger (positive adjustments as +qty, loss as −qty) and resolves the open exception."
      >
        <label className="text-xs font-semibold text-fg-muted">
          Approval notes (optional)
        </label>
        <NotesBox
          value={approvalNotes}
          onChange={(e) => setApprovalNotes(e.target.value)}
          placeholder="Internal audit trail."
        />
        <div className="mt-4">
          <button
            type="button"
            data-testid="waste-review-approve"
            className="btn btn-primary"
            disabled={busy || (d?.submitted_by_user_id != null && d.submitted_by_user_id === session.user_id)}
            onClick={handleApprove}
          >
            {busy ? "Submitting…" : "Approve"}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Reject"
        title="Refuse this adjustment"
        description="Rejecting keeps the previous anchor/ledger state. Reason is required and surfaces on the exception row."
      >
        <label className="text-xs font-semibold text-fg-muted">
          Rejection reason (required)
        </label>
        <NotesBox
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="Shown on the audit trail and the submitter's notification."
        />
        <div className="mt-4">
          <button
            type="button"
            data-testid="waste-review-reject"
            className="btn btn-sm btn-danger"
            disabled={busy || !rejectionReason.trim() || (d?.submitted_by_user_id != null && d.submitted_by_user_id === session.user_id)}
            onClick={handleReject}
          >
            {busy ? "Submitting…" : "Reject"}
          </button>
        </div>
      </SectionCard>
    </>
  );
}
