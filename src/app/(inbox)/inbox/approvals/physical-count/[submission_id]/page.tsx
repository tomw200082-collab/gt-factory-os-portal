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
  PhysicalCountApprovalSuccessResponse,
  PhysicalCountRejectionSuccessResponse,
  PhysicalCountConflictResponse,
} from "@/lib/contracts/physical-count";
import type { Session } from "@/lib/auth/fake-auth";
import { fmtNumStr } from "@/lib/utils/format-quantity";

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
  submitted_by_user_id: string | null;
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
    return { kind: "network", message: "Could not complete the action. Check your connection and try again." };
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
    return { kind: "network", message: "Could not complete the action. Check your connection and try again." };
  } catch (err) {
    return { kind: "network", message: err instanceof Error ? err.message : String(err) };
  }
}

function friendlyPhysicalCountConflict(reasonCode: string, fallbackDetail: string): string {
  switch (reasonCode) {
    case "SELF_APPROVAL_FORBIDDEN":
      return "You cannot approve your own count. Admin and planner roles may self-approve their own count; operator and viewer cannot. Ask another reviewer if you do not have the right role.";
    case "NOT_PENDING":
      return "This count is no longer pending — another reviewer may have already actioned it. Refresh the inbox.";
    case "IDEMPOTENCY_KEY_REUSED":
      return "This action was already submitted. Refresh the inbox to see the result.";
    case "SUBMISSION_NOT_FOUND":
      return "Submission not found. It may have been removed.";
    case "SNAPSHOT_EXPIRED":
      return "The count snapshot has expired. The operator must open a new snapshot and recount.";
    case "SNAPSHOT_ALREADY_CONSUMED":
      return "This snapshot has already been used for a submission.";
    case "SNAPSHOT_OWNER_MISMATCH":
      return "The snapshot was opened by a different operator. Only the operator who opened the snapshot can submit against it.";
    case "THRESHOLD_NOT_CONFIGURED":
      return "Auto-post threshold is not configured for this item type. Ask an admin to set the policy.";
    default:
      return fallbackDetail || "This submission cannot be actioned in its current state. Refresh the page and try again.";
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
      if (!res.ok) throw new Error("Could not load submission details.");
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
    const itemLabel = d?.item_display_name ?? d?.item_id ?? "item";
    const counted = d ? `${fmtNumStr(d.counted_quantity)} ${d.unit}` : "the counted quantity";
    const deltaText = d?.computed_delta != null ? formatDelta(d.computed_delta, d.unit) : null;
    return (
      <SuccessState
        title="Approved — new anchor applied"
        description={
          deltaText
            ? `${itemLabel}: counted ${counted} (delta ${deltaText}). Snapshot replaced and is now the authoritative balance for this item.`
            : `${itemLabel}: counted ${counted}. Snapshot replaced and is now the authoritative balance for this item.`
        }
        action={
          <Link href="/inbox" className="btn btn-sm btn-primary">
            Back to inbox
          </Link>
        }
      />
    );
  }
  if (outcome?.kind === "rejected") {
    const itemLabel = d?.item_display_name ?? d?.item_id ?? "count";
    return (
      <SuccessState
        title="Rejected — anchor unchanged"
        description={`${itemLabel}: no anchor replacement. Reason: ${outcome.body.rejection_reason}`}
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
    const friendly = friendlyPhysicalCountConflict(outcome.body.reason_code, outcome.body.detail);
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
        title="Physical Count"
        description={
          d
            ? `${d.item_display_name ?? d.item_id} · counted: ${fmtNumStr(d.counted_quantity)} ${d.unit} · delta: ${formatDelta(d.computed_delta, d.unit)}`
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
          <DetailRow label="Counted" value={`${fmtNumStr(d.counted_quantity)} ${d.unit}`} />
          <DetailRow
            label="System expected"
            value={d.snapshot_quantity != null ? `${fmtNumStr(d.snapshot_quantity)} ${d.unit}` : "—"}
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

      {/* Preemptive self-approval guard for physical count.
          Per design 2026-04-30 §A.3 admin and planner roles may self-approve
          their own count; operator and viewer cannot. The handler enforces
          this via 409 SELF_APPROVAL_FORBIDDEN; this UI block matches the
          policy so the disallowed roles don't have to learn it by trying. */}
      {d?.submitted_by_user_id &&
      d.submitted_by_user_id === session.user_id &&
      session.role !== "admin" &&
      session.role !== "planner" ? (
        <div
          className="mb-5 rounded-md border border-warning/40 bg-warning-softer/60 p-4 text-sm text-warning-fg"
          data-testid="pc-review-self-approval-block"
        >
          <div className="font-semibold">You cannot approve your own count</div>
          <div className="mt-1 text-xs">
            Only admin or planner roles may self-approve a count. Ask a planner
            or admin to review your submission from the inbox.
          </div>
        </div>
      ) : null}

      <SectionCard
        eyebrow="Approve"
        title="Accept this count"
        description="Approving calls replace_anchor() with COUNT_APPROVAL provenance and resolves the open exception. Admin and planner roles may self-approve their own count; operator and viewer cannot."
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
            disabled={
              busy ||
              (d?.submitted_by_user_id != null &&
                d.submitted_by_user_id === session.user_id &&
                session.role !== "admin" &&
                session.role !== "planner")
            }
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
            className="btn btn-sm btn-danger"
            disabled={
              busy ||
              !rejectionReason.trim() ||
              (d?.submitted_by_user_id != null &&
                d.submitted_by_user_id === session.user_id &&
                session.role !== "admin" &&
                session.role !== "planner")
            }
            onClick={handleReject}
          >
            {busy ? "Submitting…" : "Reject"}
          </button>
        </div>
      </SectionCard>
    </>
  );
}
