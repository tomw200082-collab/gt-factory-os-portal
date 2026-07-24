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
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
      return "You cannot approve your own submission. Admin and planner roles may self-approve; operator and viewer cannot. Ask another reviewer if you do not have the right role.";
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
    <div className="flex gap-3 text-sm">
      <span className="w-32 shrink-0 font-medium text-fg-muted">{label}</span>
      <span className="text-fg">{value}</span>
    </div>
  );
}

// UX-flow audit (FLOW-004): show plain-English labels, not raw snake_case enum
// values. REASON_LABELS mirrors the waste form's own map; unknown reason codes
// and the exception_category fall back to a title-cased humanization (which is
// still readable, not a technical token), so we never have to guess a label.
const WASTE_REASON_LABELS: Record<string, string> = {
  breakage: "Breakage",
  spoilage: "Spoilage",
  production_waste: "Production waste",
  sampling: "Sampling",
  theft_loss: "Theft / loss",
  found_stock: "Found stock",
  correction: "Correction",
  other: "Other",
};

function humanizeCode(code: string): string {
  const t = code.replace(/_/g, " ").trim();
  return t.length ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

export default function WasteReviewPage() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const params = useParams<{ submission_id: string }>();
  const submissionId = params.submission_id;
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  // Separate busy flags so approving never disables/relabels the reject button
  // (and vice versa). confirmingApprove gates the irreversible ledger post
  // behind an explicit confirm step.
  const [approveBusy, setApproveBusy] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [confirmingApprove, setConfirmingApprove] = useState(false);

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

  // Tranche 042 — the inbox list reads these source queries (see
  // (inbox)/inbox/page.tsx QK_WASTE / QK_EXC); invalidate them on a
  // successful decision so "Back to inbox" never shows the stale row.
  const invalidateInboxSources = () => {
    void queryClient.invalidateQueries({
      queryKey: ["inbox", "source", "approvals", "waste"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["inbox", "source", "exceptions"],
    });
  };

  const handleApprove = async () => {
    setApproveBusy(true);
    const r = await callApprove(submissionId, session, approvalNotes || null);
    if (r.kind === "approved") {
      invalidateInboxSources();
      // Tranche 144 — approval posts the waste movement to the ledger;
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
        <div
          className="mb-6 space-y-3 rounded-xl border border-border/60 bg-bg-subtle/40 p-5"
          aria-busy="true"
          aria-live="polite"
        >
          <div className="h-5 w-32 animate-pulse rounded bg-bg-subtle" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex animate-pulse gap-3">
              <div className="h-4 w-32 shrink-0 rounded bg-bg-subtle" />
              <div className="h-4 w-40 rounded bg-bg-subtle" />
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
          <DetailRow
            label="Reason"
            value={WASTE_REASON_LABELS[d.reason_code] ?? humanizeCode(d.reason_code)}
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
          {d.exception_category ? (
            <DetailRow
              label="Why approval needed"
              value={humanizeCode(d.exception_category)}
            />
          ) : null}
          <DetailRow
            label="Current status"
            value={
              d.status === "pending" ? (
                <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning-softer px-2 py-0.5 text-xs font-medium text-warning-fg">
                  Awaiting approval
                </span>
              ) : d.status === "posted" ? (
                <span className="inline-flex items-center rounded-full border border-success/30 bg-success-softer px-2 py-0.5 text-xs font-medium text-success-fg">
                  Approved — stock updated
                </span>
              ) : d.status === "rejected" ? (
                <span className="inline-flex items-center rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">
                  Rejected — stock unchanged
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

      {/* Preemptive self-approval guard. Per design 2026-04-30 §A.3 #1
          (Tom-locked) admin and planner roles MAY self-approve their own
          waste/adjustment; operator and viewer cannot (handler enforces 409
          SELF_APPROVAL_FORBIDDEN). This UI block matches that policy so only
          the disallowed roles see it — mirrors the physical-count screen. */}
      {d?.submitted_by_user_id &&
      d.submitted_by_user_id === session.user_id &&
      session.role !== "admin" &&
      session.role !== "planner" ? (
        <div
          className="mb-5 rounded-md border border-warning/40 bg-warning-softer/60 p-4 text-sm text-warning-fg"
          data-testid="waste-review-self-approval-block"
        >
          <div className="font-semibold">You cannot approve your own submission</div>
          <div className="mt-1 text-xs">
            Only admin or planner roles may self-approve a waste adjustment. Ask
            a planner or admin to review your submission from the inbox.
          </div>
        </div>
      ) : null}

      <SectionCard
        eyebrow="Approve"
        title="Accept this adjustment"
        description="Posts the submission to the ledger and resolves the open exception."
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
              data-testid="waste-review-approve-confirm-zone"
            >
              <span className="text-sm text-warning-fg">
                Approving posts a{" "}
                <span className="font-semibold">
                  {d?.direction === "loss" ? "loss" : "positive correction"}
                </span>
                {d ? (
                  <>
                    {" "}
                    of{" "}
                    <span className="font-semibold tabular-nums">
                      {d.quantity} {d.unit}
                    </span>{" "}
                    for{" "}
                    <span className="font-semibold">
                      {d.item_display_name ?? d.item_id}
                    </span>
                  </>
                ) : null}{" "}
                to the stock ledger. This cannot be undone here.
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="waste-review-approve-confirm"
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
              data-testid="waste-review-approve"
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
              Approve adjustment
            </button>
          )}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Reject"
        title="Refuse this adjustment"
        description="Keeps stock unchanged. Reason is required and surfaces on the audit trail."
      >
        <label className="block mb-2 text-sm font-semibold text-fg">
          Rejection reason <span className="font-normal text-danger-fg">*</span>
        </label>
        <NotesBox
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="Shown on the audit trail and to the submitter."
        />
        <div className="mt-5">
          <button
            type="button"
            data-testid="waste-review-reject"
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
            {rejectBusy ? "Submitting…" : "Reject adjustment"}
          </button>
        </div>
      </SectionCard>
    </>
  );
}
