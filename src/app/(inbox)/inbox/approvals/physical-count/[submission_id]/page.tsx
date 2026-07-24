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
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

/** Varied widths so the loading skeleton approximates real value lengths. */
function cnLoadingBar(i: number): string {
  const widths = ["w-48", "w-24", "w-32", "w-20", "w-40", "w-56", "w-28"];
  return `h-4 rounded bg-bg-subtle ${widths[i % widths.length]}`;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-36 shrink-0 font-medium text-fg-muted">{label}</span>
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
  const queryClient = useQueryClient();
  const params = useParams<{ submission_id: string }>();
  const submissionId = params.submission_id;
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  // Separate busy flags so approving never disables/relabels the reject button
  // (and vice versa). confirmingApprove gates the irreversible anchor
  // replacement behind an explicit confirm step.
  const [approveBusy, setApproveBusy] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [confirmingApprove, setConfirmingApprove] = useState(false);

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

  // Tranche 042 — the inbox list reads this source query (see
  // (inbox)/inbox/page.tsx QK_PC); invalidate it on a successful decision
  // so "Back to inbox" never shows the stale row.
  const invalidateInboxSources = () => {
    void queryClient.invalidateQueries({
      queryKey: ["inbox", "source", "approvals", "physical_count"],
    });
  };

  const handleApprove = async () => {
    setApproveBusy(true);
    const r = await callApprove(submissionId, session, approvalNotes || null);
    if (r.kind === "approved") {
      invalidateInboxSources();
      // Tranche 144 — approval replaces the balance anchor for this item;
      // refresh the Inventory dashboard and ledger view so they don't keep
      // showing the pre-approval balance.
      void queryClient.invalidateQueries({ queryKey: ["stock"] });
      void queryClient.invalidateQueries({ queryKey: ["stock-ledger"] });
    }
    setOutcome(r);
    setApproveBusy(false);
    setConfirmingApprove(false);
  };
  const handleReject = async () => {
    if (!rejectionReason.trim()) return;
    setRejectBusy(true);
    const r = await callReject(submissionId, session, rejectionReason);
    if (r.kind === "rejected") invalidateInboxSources();
    setOutcome(r);
    setRejectBusy(false);
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
          <>
            <Link href="/inbox" className="btn btn-sm btn-primary">
              Back to inbox
            </Link>
            {d?.item_id ? (
              <Link
                href={`/inventory?item_id=${encodeURIComponent(d.item_id)}`}
                className="btn btn-sm"
                data-testid="pc-review-approved-view-inventory"
              >
                View in inventory
              </Link>
            ) : null}
            {d?.item_id ? (
              <Link
                href={`/stock/movement-log?item_id=${encodeURIComponent(d.item_id)}`}
                className="btn btn-sm"
                data-testid="pc-review-approved-view-log"
              >
                View in movement log
              </Link>
            ) : null}
          </>
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
        <div
          className="mb-6 space-y-3 rounded-xl border border-border/60 bg-bg-subtle/40 p-5"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="h-5 w-32 animate-pulse rounded bg-bg-subtle" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex animate-pulse gap-3">
              <div className="h-4 w-36 shrink-0 rounded bg-bg-subtle" />
              <div className={cnLoadingBar(i)} />
            </div>
          ))}
        </div>
      ) : detailQuery.isError ? (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger-softer p-4 text-xs text-danger-fg">
          Could not load submission details. You may still approve or reject below, but context is unavailable.
        </div>
      ) : d ? (
        <div className="mb-6 rounded-xl border border-border/60 bg-bg-subtle/40 p-5 space-y-2">
          <div className="mb-3 text-base font-bold text-fg">
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
              // FLOW-206 — plain-English status chip, never the raw enum.
              d.status === "pending" ? (
                <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning-softer px-2 py-0.5 text-xs font-medium text-warning-fg">
                  Awaiting approval
                </span>
              ) : d.status === "posted" ? (
                <span className="inline-flex items-center rounded-full border border-success/30 bg-success-softer px-2 py-0.5 text-xs font-medium text-success-fg">
                  Approved — anchor applied
                </span>
              ) : d.status === "rejected" ? (
                <span className="inline-flex items-center rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">
                  Rejected — anchor unchanged
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">
                  {d.status.replace(/_/g, " ")}
                </span>
              )
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
        description="Approving replaces the stock anchor with the counted quantity. Admin and planner may self-approve; operator and viewer cannot."
      >
        <label className="block mb-2 text-sm font-semibold text-fg">
          Approval notes <span className="font-normal text-fg-muted">(optional)</span>
        </label>
        <NotesBox
          value={approvalNotes}
          onChange={(e) => setApprovalNotes(e.target.value)}
          placeholder="Internal audit trail."
        />
        <div className="mt-5">
          {confirmingApprove ? (
            <div
              className="flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning-softer px-4 py-3"
              role="alertdialog"
              aria-label="Confirm approval"
              data-testid="pc-review-approve-confirm-zone"
            >
              <span className="text-sm text-warning-fg">
                Approving replaces the stock anchor for{" "}
                <span className="font-semibold">
                  {d?.item_display_name ?? d?.item_id ?? "this item"}
                </span>
                {d ? (
                  <>
                    {" "}
                    with{" "}
                    <span className="font-semibold tabular-nums">
                      {fmtNumStr(d.counted_quantity)} {d.unit}
                    </span>
                  </>
                ) : null}
                . This becomes the authoritative balance.
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="pc-review-approve-confirm"
                  className="btn btn-sm btn-primary"
                  disabled={approveBusy}
                  onClick={handleApprove}
                >
                  {approveBusy ? "Submitting…" : "Yes, approve"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={approveBusy}
                  onClick={() => setConfirmingApprove(false)}
                >
                  Keep reviewing
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="pc-review-approve"
              className="btn btn-lg btn-primary"
              disabled={
                !d ||
                approveBusy ||
                rejectBusy ||
                (d?.submitted_by_user_id != null &&
                  d.submitted_by_user_id === session.user_id &&
                  session.role !== "admin" &&
                  session.role !== "planner")
              }
              onClick={() => setConfirmingApprove(true)}
            >
              Approve count
            </button>
          )}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Reject"
        title="Refuse this count"
        description="Keeps the previous anchor authoritative. Reason is required and surfaces on the audit trail."
      >
        <label className="block mb-2 text-sm font-semibold text-fg">
          Rejection reason <span className="font-normal text-danger-fg">*</span>
        </label>
        <NotesBox
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="Shown on the audit trail."
        />
        <div className="mt-5">
          <button
            type="button"
            data-testid="pc-review-reject"
            className="btn btn-lg btn-danger"
            disabled={
              !d ||
              rejectBusy ||
              approveBusy ||
              !rejectionReason.trim() ||
              (d?.submitted_by_user_id != null &&
                d.submitted_by_user_id === session.user_id &&
                session.role !== "admin" &&
                session.role !== "planner")
            }
            onClick={handleReject}
          >
            {rejectBusy ? "Submitting…" : "Reject count"}
          </button>
        </div>
      </SectionCard>
    </>
  );
}
