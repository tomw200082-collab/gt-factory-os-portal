"use client";

// Planner-scoped Waste approval/reject screen.
// Consumes:
//   GET /api/waste-adjustments/:submission_id  → decision-grade context
//   POST /api/waste-adjustments/:submission_id/{approve,reject}
// Contract refs:
//   docs/waste_adjustment_runtime_contract.md §1.7 (approve/reject envelopes)
//                                              §1.8 (response shapes)

import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
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
    return (
      <SuccessState
        title="Approved"
        description={`Submission ${outcome.body.submission_id} posted. Ledger ${outcome.body.stock_ledger_movement_id}. Exception ${outcome.body.exception_id} resolved.`}
      />
    );
  }
  if (outcome?.kind === "rejected") {
    return (
      <SuccessState
        title="Rejected"
        description={`Submission ${outcome.body.submission_id} rejected. Reason: ${outcome.body.rejection_reason}. Exception ${outcome.body.exception_id} resolved. No ledger row created.`}
        tone="warning"
      />
    );
  }
  if (outcome?.kind === "conflict") {
    return (
      <SuccessState
        title="Action refused"
        description={outcome.body.detail || "This submission cannot be actioned in its current state. Refresh the page and try again."}
        tone="warning"
      />
    );
  }
  if (outcome?.kind === "network") {
    return (
      <SuccessState title="Network error" description={outcome.message} tone="warning" />
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
            disabled={busy}
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
            className="btn btn-primary"
            disabled={busy || !rejectionReason.trim()}
            onClick={handleReject}
          >
            {busy ? "Submitting…" : "Reject"}
          </button>
        </div>
      </SectionCard>
    </>
  );
}
