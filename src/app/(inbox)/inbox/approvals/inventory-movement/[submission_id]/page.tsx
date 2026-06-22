"use client";

// Planner/bookkeeper-scoped Inventory-Movement approval surface.
//
// Route-print-pack proposals (returns / exchanges / pickups) arrive as a
// free-text proposal — no structured item/qty. The reviewer enters the
// confirmed line(s) here; approving posts one stock_ledger row per line via the
// sanctioned backend mutation. Mirrors the physical-count approval page.
//
// Consumes:
//   GET  /api/inventory-movements/:submission_id
//   POST /api/inventory-movements/:submission_id/{approve,reject}

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session-provider";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { SuccessState } from "@/components/feedback/states";
import { NotesBox } from "@/components/fields/NotesBox";

interface InventoryMovementDetail {
  submission_id: string;
  status: string;
  kind: string;
  source_ref: string | null;
  recipient: string | null;
  note: string | null;
  summary: string | null;
  submitted_by_user_id: string | null;
  submitted_by_display_name: string | null;
  event_at: string;
  submitted_at: string;
  lines: Array<{
    direction: string;
    item_type: string;
    item_id: string;
    quantity: string;
    unit: string;
    reason_code: string;
  }>;
}

interface LineDraft {
  direction: "in" | "out";
  item_type: "FG" | "RM" | "PKG";
  item_id: string;
  quantity: string;
  unit: string;
  reason_code: string;
}

const REASON_CODES = [
  "goods_pickup",
  "return_in",
  "goods_out",
  "exchange_in",
  "exchange_out",
  "tasting",
  "correction",
  "other",
] as const;

type Outcome =
  | { kind: "approved"; postedCount: number }
  | { kind: "rejected" }
  | { kind: "conflict"; detail: string }
  | { kind: "network"; message: string };

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `imrev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function emptyLine(): LineDraft {
  return { direction: "in", item_type: "FG", item_id: "", quantity: "", unit: "unit", reason_code: "goods_pickup" };
}

function lineIsValid(l: LineDraft): boolean {
  return l.item_id.trim().length > 0 && Number(l.quantity) > 0 && l.unit.trim().length > 0;
}

function friendlyConflict(reasonCode: string, fallback: string): string {
  switch (reasonCode) {
    case "SELF_APPROVAL_FORBIDDEN":
      return "You cannot approve your own submission. Admin and planner roles may self-approve; operator and viewer cannot.";
    case "NOT_PENDING":
      return "This movement is no longer pending — another reviewer may have already actioned it. Refresh the inbox.";
    case "ITEM_TYPE_MISMATCH":
      return "An item id does not match its item type, or was not found. Check the item id and type for each line.";
    case "ITEM_INACTIVE":
      return "An item on one of the lines is inactive. Use an active item.";
    case "UNIT_NOT_FOUND":
      return "A unit code is not recognized. Use a valid unit.";
    case "COUNT_FREEZE_ACTIVE":
      return "A physical count is in progress for one of these items. Posting is blocked until the count clears.";
    case "SUBMISSION_NOT_FOUND":
      return "Submission not found. It may have been removed.";
    default:
      return fallback || "This submission cannot be actioned in its current state. Refresh and try again.";
  }
}

export default function InventoryMovementReviewPage() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const params = useParams<{ submission_id: string }>();
  const submissionId = params.submission_id;

  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);

  const detailQuery = useQuery<InventoryMovementDetail>({
    queryKey: ["inventory-movement-detail", submissionId],
    queryFn: async () => {
      const res = await fetch(`/api/inventory-movements/${encodeURIComponent(submissionId)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Could not load submission details.");
      return (await res.json()) as InventoryMovementDetail;
    },
    enabled: !!submissionId,
    staleTime: 30_000,
  });

  const d = detailQuery.data;

  const invalidateInboxSources = () => {
    void queryClient.invalidateQueries({
      queryKey: ["inbox", "source", "approvals", "inventory_movement"],
    });
  };

  const updateLine = (i: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const validLines = lines.filter(lineIsValid);
  const canApprove = validLines.length > 0 && !approveBusy && !rejectBusy;

  const handleApprove = async () => {
    if (validLines.length === 0) return;
    setApproveBusy(true);
    try {
      const res = await fetch(`/api/inventory-movements/${encodeURIComponent(submissionId)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: newIdempotencyKey(),
          approval_notes: approvalNotes || null,
          lines: validLines.map((l) => ({
            direction: l.direction,
            item_type: l.item_type,
            item_id: l.item_id.trim(),
            quantity: Number(l.quantity),
            unit: l.unit.trim(),
            reason_code: l.reason_code,
          })),
        }),
      });
      const body = await res.json().catch(() => undefined);
      if (res.status === 200) {
        invalidateInboxSources();
        setOutcome({ kind: "approved", postedCount: validLines.length });
      } else if (res.status === 409 && body && "reason_code" in body) {
        setOutcome({ kind: "conflict", detail: friendlyConflict(body.reason_code, body.detail) });
      } else {
        setOutcome({ kind: "network", message: "Could not complete the action. Check your connection and try again." });
      }
    } catch (err) {
      setOutcome({ kind: "network", message: err instanceof Error ? err.message : String(err) });
    }
    setApproveBusy(false);
  };

  const handleReject = async () => {
    setRejectBusy(true);
    try {
      const res = await fetch(`/api/inventory-movements/${encodeURIComponent(submissionId)}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: newIdempotencyKey(),
          rejection_reason: rejectionReason.trim() || null,
        }),
      });
      const body = await res.json().catch(() => undefined);
      if (res.status === 200) {
        invalidateInboxSources();
        setOutcome({ kind: "rejected" });
      } else if (res.status === 409 && body && "reason_code" in body) {
        setOutcome({ kind: "conflict", detail: friendlyConflict(body.reason_code, body.detail) });
      } else {
        setOutcome({ kind: "network", message: "Could not complete the action. Check your connection and try again." });
      }
    } catch (err) {
      setOutcome({ kind: "network", message: err instanceof Error ? err.message : String(err) });
    }
    setRejectBusy(false);
  };

  if (outcome?.kind === "approved") {
    return (
      <SuccessState
        title="Approved — stock posted"
        description={`Posted ${outcome.postedCount} movement line${outcome.postedCount === 1 ? "" : "s"} to the stock ledger.`}
        action={
          <Link href="/inbox" className="btn btn-sm btn-primary">
            Back to inbox
          </Link>
        }
      />
    );
  }
  if (outcome?.kind === "rejected") {
    return (
      <SuccessState
        title="Rejected — no stock change"
        description="The proposed movement was rejected. Nothing was posted to the stock ledger."
        tone="warning"
        action={
          <Link href="/inbox" className="btn btn-sm btn-primary">
            Back to inbox
          </Link>
        }
      />
    );
  }
  if (outcome?.kind === "conflict" || outcome?.kind === "network") {
    return (
      <SuccessState
        title={outcome.kind === "conflict" ? "Action refused" : "Network error"}
        description={outcome.kind === "conflict" ? outcome.detail : outcome.message}
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

  const inputCls =
    "rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <>
      <WorkflowHeader
        eyebrow="Inventory movement review"
        title="Inventory movement"
        description={d ? (d.summary ?? d.recipient ?? `Submission ${submissionId}`) : `Submission ${submissionId}`}
        meta={
          <Link href="/inbox" className="btn btn-sm">
            <ArrowLeft className="h-3 w-3" />
            Back to inbox
          </Link>
        }
      />

      {detailQuery.isLoading ? (
        <div className="mb-6 space-y-3 rounded-xl border border-border/60 bg-bg-subtle/40 p-5" aria-busy="true">
          <div className="h-5 w-32 animate-pulse rounded bg-bg-subtle" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-4 w-48 animate-pulse rounded bg-bg-subtle" />
          ))}
        </div>
      ) : d ? (
        <div className="mb-6 rounded-xl border border-border/60 bg-bg-subtle/40 p-5 space-y-2 text-sm">
          <div className="mb-2 text-base font-bold text-fg">Proposal</div>
          {d.recipient ? (
            <div className="flex gap-3">
              <span className="w-32 shrink-0 font-medium text-fg-muted">Stop / party</span>
              <span className="text-fg">{d.recipient}</span>
            </div>
          ) : null}
          <div className="flex gap-3">
            <span className="w-32 shrink-0 font-medium text-fg-muted">Kind</span>
            <span className="text-fg">{d.kind}</span>
          </div>
          {d.note ? (
            <div className="flex gap-3">
              <span className="w-32 shrink-0 font-medium text-fg-muted">Note</span>
              <span className="text-fg whitespace-pre-wrap">{d.note}</span>
            </div>
          ) : null}
          {d.source_ref ? (
            <div className="flex gap-3">
              <span className="w-32 shrink-0 font-medium text-fg-muted">Source ref</span>
              <span className="text-fg">{d.source_ref}</span>
            </div>
          ) : null}
          <div className="flex gap-3">
            <span className="w-32 shrink-0 font-medium text-fg-muted">Submitted</span>
            <span className="text-fg">
              {new Date(d.submitted_at).toLocaleString()}
              {d.submitted_by_display_name ? ` by ${d.submitted_by_display_name}` : ""}
            </span>
          </div>
        </div>
      ) : null}

      <SectionCard
        eyebrow="Approve"
        title="Confirm the stock move"
        description="Enter the item(s), quantity, and direction that actually moved. Approving posts one stock-ledger row per line. Use two lines (out + in) for an exchange."
      >
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 p-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-fg-muted">Direction</span>
                <select
                  className={inputCls}
                  value={l.direction}
                  onChange={(e) => updateLine(i, { direction: e.target.value as LineDraft["direction"] })}
                >
                  <option value="in">In (+)</option>
                  <option value="out">Out (−)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-fg-muted">Type</span>
                <select
                  className={inputCls}
                  value={l.item_type}
                  onChange={(e) => updateLine(i, { item_type: e.target.value as LineDraft["item_type"] })}
                >
                  <option value="FG">FG</option>
                  <option value="RM">RM</option>
                  <option value="PKG">PKG</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 grow">
                <span className="text-xs font-medium text-fg-muted">Item id</span>
                <input
                  className={inputCls}
                  value={l.item_id}
                  onChange={(e) => updateLine(i, { item_id: e.target.value })}
                  placeholder="item / component id"
                />
              </label>
              <label className="flex flex-col gap-1 w-24">
                <span className="text-xs font-medium text-fg-muted">Qty</span>
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="any"
                  value={l.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 w-20">
                <span className="text-xs font-medium text-fg-muted">Unit</span>
                <input
                  className={inputCls}
                  value={l.unit}
                  onChange={(e) => updateLine(i, { unit: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-fg-muted">Reason</span>
                <select
                  className={inputCls}
                  value={l.reason_code}
                  onChange={(e) => updateLine(i, { reason_code: e.target.value })}
                >
                  {REASON_CODES.map((rc) => (
                    <option key={rc} value={rc}>
                      {rc}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeLine(i)}
                disabled={lines.length <= 1}
                aria-label="Remove line"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={addLine}>
            <Plus className="h-3 w-3" />
            Add line
          </button>
        </div>

        <label className="mt-5 block mb-2 text-sm font-semibold text-fg">
          Approval notes <span className="font-normal text-fg-muted">(optional)</span>
        </label>
        <NotesBox value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} placeholder="Internal audit trail." />

        <div className="mt-5">
          <button type="button" className="btn btn-lg btn-primary" disabled={!canApprove} onClick={handleApprove}>
            {approveBusy ? "Posting…" : `Approve & post ${validLines.length || ""}`.trim()}
          </button>
          {validLines.length === 0 ? (
            <p className="mt-2 text-xs text-fg-muted">Enter at least one line (item id, quantity, unit) to approve.</p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard eyebrow="Reject" title="Refuse this movement" description="Nothing is posted to the stock ledger. Reason is optional and surfaces on the audit trail.">
        <label className="block mb-2 text-sm font-semibold text-fg">
          Rejection reason <span className="font-normal text-fg-muted">(optional)</span>
        </label>
        <NotesBox value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Shown on the audit trail." />
        <div className="mt-5">
          <button type="button" className="btn btn-lg btn-danger" disabled={rejectBusy || approveBusy} onClick={handleReject}>
            {rejectBusy ? "Submitting…" : "Reject movement"}
          </button>
        </div>
      </SectionCard>
    </>
  );
}
