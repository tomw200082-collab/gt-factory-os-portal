"use client";

// Planner-scoped Physical Count approval / reject surface.
// Consumes:
//   GET /api/physical-count/:submission_id  → decision-grade context
//   POST /api/physical-count/:submission_id/{approve,reject}
// Contract references:
//   docs/physical_count_runtime_contract.md §1.7 approve/reject envelopes
//                                           §1.8 success shapes
//                                           §2.4 approve transaction
//                                           §2.5 reject transaction

import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session-provider";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { SuccessState } from "@/components/feedback/states";
import { NotesBox } from "@/components/fields/NotesBox";
import type {
  PhysicalCountApprovalSuccessResponse,
  PhysicalCountRejectionSuccessResponse,
  PhysicalCountConflictResponse,
} from "@/lib/contracts/physical-count";
import type { Session } from "@/lib/auth/fake-auth";

interface PhysicalCountDetail {
  submission_id: string;
  status: string;
  item_type: string;
  item_id: string;
  item_display_name: string | null;
  counted_quantity: string;
  unit: string;
  snapshot_quantity: string | null;
  computed_delta: string | null;
  notes: string | null;
  submitted_by_display_name: string | null;
  event_at: string;
  submitted_at: string;
}

type ReviewOutcome =
  | { kind: "approved"; body: PhysicalCountApprovalSuccessResponse }
  | { kind: "rejected"; body: PhysicalCountRejectionSuccessResponse }
  | { kind: "conflict"; body: PhysicalCountConflictResponse }
  | { kind: "network"; message: string };

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pcrev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function callApprove(
  submissionId: string,
  _session: Session,
  approval_notes: string | null,
): Promise<ReviewOutcome> {
  try {
    const res = await fetch(
      `/api/physical-count/${encodeURIComponent(submissionId)}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotency_key: newIdempotencyKey(), approval_notes }),
      },
    );
    const body = await res.json().catch(() => undefined);
    if (res.status === 200 && body && typeof body === "object" && "status" in body) {
      return { kind: "approved", body: body as PhysicalCountApprovalSuccessResponse };
    }
    if (res.status === 409 && body && typeof body === "object" && "reason_code" in body) {
      return { kind: "conflict", body: body as PhysicalCountConflictResponse };
    }
    return { kind: "network", message: `HTTP ${res.status}` };
  } catch (err) {
    return { kind: "network", message: err instanceof Error ? err.message : String(err) };
  }
}

async function callReject(
  submissionId: string,
  _session: Session,
  rejection_reason: string,
): Promise<ReviewOutcome> {
  try {
    const res = await fetch(
      `/api/physical-count/${encodeURIComponent(submissionId)}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotency_key: newIdempotencyKey(), rejection_reason }),
      },
    );
    const body = await res.json().catch(() => undefined);
    if (res.status === 200 && body && typeof body === "object" && "status" in body) {
      return { kind: "rejected", body: body as PhysicalCountRejectionSuccessResponse };
    }
    if (res.status === 409 && body && typeof body === "object" && "reason_code" in body) {
      return { kind: "conflict", body: body as PhysicalCountConflictResponse };
    }
    return { kind: "network", message: `HTTP ${res.status}` };
  } catch (err) {
    return { kind: "network", message: err instanceof Error ? err.message : String(err) };
  }
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-36 shrink-0 text-fg-subtle">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}

function formatDelta(delta: string | null | undefined, unit: string): string {
  if (delta == null) return "—";
  const n = Number(delta);
  if (Number.isNaN(n)) return delta;
  return n >= 0 ? `+${n} ${unit}` : `${n} ${unit}`;
}

export default function PhysicalCountReviewPage() {
  const { session } = useSession();
  const params = useParams<{ submission_id: string }>();
  const submissionId = params.submission_id;
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const detailQuery = useQuery<PhysicalCountDetail>({
    queryKey: ["physical-count-detail", submissionId],
    queryFn: async () => {
      const res = await fetch(`/api/physical-count/${encodeURIComponent(submissionId)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as PhysicalCountDetail;
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
        title="Approved. New anchor applied."
        description={`Submission ${outcome.body.submission_id} posted. Anchor source ${outcome.body.anchor_source}. Exception ${outcome.body.exception_id} resolved.`}
      />
    );
  }
  if (outcome?.kind === "rejected") {
    return (
      <SuccessState
        title="Rejected. Anchor unchanged."
        description={`Submission ${outcome.body.submission_id} rejected. Reason: ${outcome.body.rejection_reason}. Exception ${outcome.body.exception_id} resolved. No anchor replacement.`}
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
        title="Physical Count"
        description={
          d
            ? `${d.item_display_name ?? d.item_id} · counted: ${d.counted_quantity} ${d.unit} · delta: ${formatDelta(d.computed_delta, d.unit)}`
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
            Count details
          </div>
          <DetailRow
            label="Item"
            value={
              d.item_display_name
                ? `${d.item_display_name} · ${d.item_id}`
                : d.item_id
            }
          />
          <DetailRow label="Counted" value={`${d.counted_quantity} ${d.unit}`} />
          <DetailRow
            label="System expected"
            value={d.snapshot_quantity != null ? `${d.snapshot_quantity} ${d.unit}` : "—"}
          />
          <DetailRow
            label="Delta"
            value={
              <span
                className={
                  d.computed_delta != null && Number(d.computed_delta) < 0
                    ? "text-danger-fg font-medium"
                    : d.computed_delta != null && Number(d.computed_delta) > 0
                      ? "text-warning-fg font-medium"
                      : "text-fg"
                }
              >
                {formatDelta(d.computed_delta, d.unit)}
              </span>
            }
          />
          {d.notes ? <DetailRow label="Notes" value={d.notes} /> : null}
          <DetailRow
            label="Event time"
            value={new Date(d.event_at).toLocaleString()}
          />
          <DetailRow
            label="Submitted"
            value={`${new Date(d.submitted_at).toLocaleString()}${d.submitted_by_display_name ? ` by ${d.submitted_by_display_name}` : ""}`}
          />
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
        title="Accept this count"
        description="Approving calls replace_anchor() with COUNT_APPROVAL provenance and resolves the open exception. Self-approval is forbidden for all roles including admin."
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
            data-testid="pc-review-approve"
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
        title="Refuse this count"
        description="Rejecting leaves the previous anchor authoritative. Reason is required and surfaces on the exception row. No replace_anchor() call."
      >
        <label className="text-xs font-semibold text-fg-muted">
          Rejection reason (required)
        </label>
        <NotesBox
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="Shown on the audit trail."
        />
        <div className="mt-4">
          <button
            type="button"
            data-testid="pc-review-reject"
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
