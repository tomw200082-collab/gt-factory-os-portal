"use client";

// Planner-scoped Waste approval/reject screen.
// Consumes POST /api/waste-adjustments/:submission_id/{approve,reject}
// which proxy to the backend-verified endpoints (pass-3b 13/13 green).
//
// Authored under W2 Mode B, scoped to WasteAdjustment only.
// Contract refs:
//   docs/waste_adjustment_runtime_contract.md §1.7 (approve/reject envelopes)
//                                              §1.8 (response shapes)
// Source-of-truth mirror: src/lib/contracts/waste-adjustments.ts

import { useState } from "react";
import { useParams } from "next/navigation";
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
    return { kind: "network", message: `HTTP ${res.status}` };
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
    return { kind: "network", message: `HTTP ${res.status}` };
  } catch (err) {
    return { kind: "network", message: err instanceof Error ? err.message : String(err) };
  }
}

export default function WasteReviewPage() {
  const { session } = useSession();
  const params = useParams<{ submission_id: string }>();
  const submissionId = params.submission_id;
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [busy, setBusy] = useState(false);

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
        description={`${outcome.body.reason_code}: ${outcome.body.detail}`}
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
        description={`Submission ${submissionId}`}
      />
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
