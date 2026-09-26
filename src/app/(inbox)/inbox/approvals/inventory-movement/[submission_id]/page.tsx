"use client";

// Planner/bookkeeper-scoped Inventory-Movement approval surface.
//
// The daily stock-exceptions sweep proposes every non-pick stock move
// (supplements, free goods, exchanges, returns, tastings, subcontract) with
// proposed lines, a rationale, evidence and open questions (tranche 176). The
// reviewer checks or edits the pre-filled lines here; approving posts one
// stock_ledger row per line via the sanctioned backend mutation. Mirrors the
// physical-count approval page.
//
// Consumes:
//   GET  /api/inventory-movements/:submission_id
//   POST /api/inventory-movements/:submission_id/{approve,reject}

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Info, Plus, Trash2 } from "lucide-react";
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
  // The proposal (tranche 176 / backend 0350). Optional: older submissions and
  // an API not yet on 0350 leave them out.
  proposed_lines?: ProposedLine[];
  rationale?: string | null;
  open_questions?: string[];
  evidence?: Array<{ type: string; ref: string; url?: string }>;
  credit_task_ids?: string[];
}

// Mirrors the backend InventoryMovementPostedLine shape — inlined here
// because no portal-side contract module exists yet for inventory-movement
// and this lane does not author contracts.
interface PostedLine {
  item_type: "FG" | "RM" | "PKG";
  item_id: string;
  direction: "in" | "out";
  quantity: string;
  unit: string;
  stock_ledger_movement_id: string;
}

interface ProposedLine {
  direction: "in" | "out";
  item_type: "FG" | "RM" | "PKG";
  item_id: string;
  quantity: number;
  unit: string;
  reason_code: string;
  source: string;
  evidence_ref?: string | null;
  confidence: string;
}

interface LineDraft {
  direction: "in" | "out";
  item_type: "FG" | "RM" | "PKG";
  item_id: string;
  quantity: string;
  unit: string;
  reason_code: string;
  // Where a pre-filled row came from; absent on rows the reviewer added.
  origin?: Pick<ProposedLine, "source" | "confidence" | "evidence_ref">;
}

// Where a proposed line or a piece of evidence came from (`source` / `type`).
const ORIGIN_LABELS: Record<string, string> = {
  gi_document: "Green Invoice document",
  credit_task: "Picking shortage",
  purchase_order: "Purchase order",
  note_parse: "LionWheel note",
  lionwheel_task: "LionWheel task",
  manual: "Manual",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence — check",
};


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

// FLOW-IM-012 — plain-English labels for the reason_code <select>. Value
// posted to the backend is unchanged (the snake_case code); only the
// human-readable label changes.
const REASON_CODE_LABELS: Record<(typeof REASON_CODES)[number], string> = {
  goods_pickup: "Goods pickup",
  return_in: "Return (in)",
  goods_out: "Goods out",
  exchange_in: "Exchange – received",
  exchange_out: "Exchange – sent",
  tasting: "Tasting / sample",
  correction: "Stock correction",
  other: "Other",
};

// FLOW-IM-013 — plain-English label for the proposal's `kind` field.
const KIND_LABELS: Record<string, string> = {
  pickup: "Pickup",
  exchange: "Exchange",
  return: "Return",
  tasting: "Tasting",
  goods_receipt: "Goods receipt",
  supplement: "Supplement",
  free_goods: "Free goods",
  subcontract: "Subcontract",
  other: "Other",
};

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

// A linked picking shortage that approving did not mark supplied, and why
// (credit_tasks.not_supplied in the gt-factory-os approve response). The
// reasons are shown in plain words; ids and codes never reach the screen.
interface NotSuppliedShortage {
  credit_task_id: string;
  reason: string;
}

function notSuppliedReason(reason: string): string {
  switch (reason) {
    case "ITEM_NOT_SUPPLIED":
      return "Still open — no Out line for its item.";
    case "QTY_NOT_COVERED":
      return "Still open — the Out quantity is less than what was missing.";
    case "NOT_FOUND":
      return "Not found — it may have been removed.";
    case "STATUS_CREDITED":
      return "Already credited.";
    case "STATUS_SUPPLIED":
      return "Already marked supplied.";
    default:
      return reason.startsWith("STATUS_") ? "Already resolved." : "Left as it was.";
  }
}

type Outcome =
  | {
      kind: "approved";
      postedLines: PostedLine[];
      suppliedShortages: number;
      notSupplied: NotSuppliedShortage[];
    }
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
    case "LINES_ALREADY_RECORDED":
      return "Stock lines were already recorded for this movement outside approval. Reject it so it can be proposed again.";
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
  const prefilled = useRef(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [rejectBusy, setRejectBusy] = useState(false);
  // FLOW-IM-001 — gate the irreversible post behind an explicit confirm step,
  // mirroring the physical-count page's confirmingApprove pattern.
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  // Approving closes the proposal, so open questions must be looked at first.
  const [questionsChecked, setQuestionsChecked] = useState(false);

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
  const openQuestions = d?.open_questions ?? [];
  const evidence = d?.evidence ?? [];
  const creditTaskIds = d?.credit_task_ids ?? [];

  // Pre-fill the editor from the proposal's proposed_lines, once, on first
  // load; edits after that are preserved. Never from `lines` — those are the
  // posted audit lines, and pre-filling from them is how GI-20269 posted twice.
  useEffect(() => {
    if (prefilled.current) return;
    if (!d?.proposed_lines || d.proposed_lines.length === 0) return;
    prefilled.current = true;
    setLines(
      d.proposed_lines.map((l) => ({
        direction: l.direction,
        item_type: l.item_type,
        item_id: l.item_id,
        quantity: String(l.quantity),
        unit: l.unit,
        reason_code: l.reason_code,
        origin: { source: l.source, confidence: l.confidence, evidence_ref: l.evidence_ref ?? null },
      })),
    );
  }, [d]);

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

  // Every entered line must be complete before approving — we never silently
  // drop a partial line (that would post a half-exchange to the ledger and
  // resolve the proposal with a missing leg). Approve posts ALL lines.
  const allLinesValid = lines.length > 0 && lines.every(lineIsValid);
  // Self-approval guard (parity with the physical-count page): admin/planner may
  // approve their own submission; operator/viewer may not. Backend also enforces.
  const isOwnUnprivileged =
    !!d?.submitted_by_user_id &&
    d.submitted_by_user_id === session.user_id &&
    session.role !== "admin" &&
    session.role !== "planner";
  // FLOW-IM-009 — disable approve / reject when the proposal is no longer
  // pending (e.g. another reviewer already actioned it).
  const isPending = !d || d.status === "pending";
  // The questions are headed "answer before approving"; approving posts the
  // known lines and closes the proposal, so the reviewer ticks that they
  // checked them.
  const questionsCleared = openQuestions.length === 0 || questionsChecked;
  const canApprove =
    allLinesValid && questionsCleared && !approveBusy && !rejectBusy && !isOwnUnprivileged && isPending;
  // FLOW-IM-010 — Reject requires a non-empty reason (mirror waste / PC).
  const canReject = !rejectBusy && !approveBusy && !isOwnUnprivileged && isPending && rejectionReason.trim().length > 0;

  // FLOW-IM-014 — exchange-leg warning: posting one leg only leaves the other
  // unrecorded. Non-blocking; informational + a near-button reminder.
  const isExchange = d?.kind === "exchange";
  const exchangeSingleLineWarning = isExchange && lines.length === 1;

  const handleApprove = async () => {
    if (!allLinesValid || !questionsCleared) return;
    setApproveBusy(true);
    try {
      const res = await fetch(`/api/inventory-movements/${encodeURIComponent(submissionId)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: newIdempotencyKey(),
          approval_notes: approvalNotes || null,
          lines: lines.map((l) => ({
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
        // FLOW-IM-002 / FLOW-IM-003 — keep the backend's posted_lines[] so the
        // success state can list each posted ledger row and link out.
        const postedLines: PostedLine[] =
          body && Array.isArray(body.posted_lines) ? (body.posted_lines as PostedLine[]) : [];
        const suppliedShortages: number = body?.credit_tasks?.supplied?.length ?? 0;
        // Say which linked shortages approving did not close, or the
        // reviewer takes them for done.
        const notSupplied: NotSuppliedShortage[] = Array.isArray(body?.credit_tasks?.not_supplied)
          ? (body.credit_tasks.not_supplied as NotSuppliedShortage[])
          : [];
        setOutcome({ kind: "approved", postedLines, suppliedShortages, notSupplied });
      } else if (res.status === 409 && body && "reason_code" in body) {
        setOutcome({ kind: "conflict", detail: friendlyConflict(body.reason_code, body.detail) });
      } else {
        setOutcome({ kind: "network", message: "Could not complete the action. Check your connection and try again." });
      }
    } catch (err) {
      setOutcome({ kind: "network", message: err instanceof Error ? err.message : String(err) });
    }
    setApproveBusy(false);
    setConfirmingApprove(false);
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) return;
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
    const posted = outcome.postedLines;
    const firstItemId = posted[0]?.item_id ?? null;
    return (
      <SuccessState
        title="Approved — stock posted"
        description={
          `Posted ${posted.length} movement line${posted.length === 1 ? "" : "s"} to the stock ledger.` +
          (outcome.suppliedShortages > 0 ? ` ${plural(outcome.suppliedShortages, "picking shortage")} marked supplied.` : "")
        }
        action={
          <>
            <Link href="/inbox" className="btn btn-sm btn-primary">
              Back to inbox
            </Link>
            {firstItemId ? (
              <Link
                href={`/stock/movement-log?item_id=${encodeURIComponent(firstItemId)}`}
                className="btn btn-sm"
                data-testid="im-review-approved-view-log"
              >
                View in movement log
              </Link>
            ) : null}
            {posted.length === 1 && firstItemId ? (
              <Link
                href={`/inventory?item_id=${encodeURIComponent(firstItemId)}`}
                className="btn btn-sm"
                data-testid="im-review-approved-view-inventory"
              >
                View in inventory
              </Link>
            ) : null}
          </>
        }
      >
        {posted.length > 0 ? (
          <div className="mt-2" data-testid="im-review-approved-posted-lines">
            <div className="mb-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Posted lines
            </div>
            <ul className="space-y-1 text-sm">
              {posted.map((p) => (
                <li key={p.stock_ledger_movement_id} className="flex gap-2 tabular-nums">
                  <span
                    className={
                      p.direction === "in"
                        ? "font-semibold text-success-fg"
                        : "font-semibold text-danger-fg"
                    }
                  >
                    {p.direction === "in" ? "In" : "Out"}
                  </span>
                  <span>
                    {p.quantity} {p.unit}
                  </span>
                  <span className="text-fg-muted">·</span>
                  <span className="font-mono text-fg">{p.item_id}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {outcome.notSupplied.length > 0 ? (
          <div
            className="mt-3 rounded-md border border-warning/40 bg-warning-softer/60 p-3 text-sm text-warning-fg"
            data-testid="im-review-approved-not-supplied"
          >
            <div className="font-semibold">
              {plural(outcome.notSupplied.length, "linked picking shortage")} not marked supplied
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg">
              {outcome.notSupplied.map((s, i) => (
                <li key={`${s.credit_task_id}-${i}`}>{notSuppliedReason(s.reason)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </SuccessState>
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
        <div
          className="mb-6 space-y-3 rounded-xl border border-border/60 bg-bg-subtle/40 p-5"
          aria-busy="true"
          aria-live="polite"
        >
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
            <span className="text-fg">{kindLabel(d.kind)}</span>
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
          {/* FLOW-IM-009 — plain-English current-status chip, never the raw enum. */}
          <div className="flex gap-3">
            <span className="w-32 shrink-0 font-medium text-fg-muted">Current status</span>
            <span>
              {d.status === "pending" ? (
                <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning-softer px-2 py-0.5 text-xs font-medium text-warning-fg">
                  Awaiting approval
                </span>
              ) : d.status === "posted" ? (
                <span className="inline-flex items-center rounded-full border border-success/30 bg-success-softer px-2 py-0.5 text-xs font-medium text-success-fg">
                  Approved — posted to stock
                </span>
              ) : d.status === "rejected" ? (
                <span className="inline-flex items-center rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">
                  Rejected — no stock change
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-xs font-medium text-fg-muted">
                  {d.status.replace(/_/g, " ")}
                </span>
              )}
            </span>
          </div>
        </div>
      ) : null}

      {detailQuery.isError ? (
        <div className="mb-5 rounded-md border border-danger/40 bg-danger-softer p-4 text-xs text-danger-fg">
          Could not load the proposal details. Context is unavailable — review the
          item in the inbox before approving or rejecting.
        </div>
      ) : null}

      {/* Tranche 176 — why this was proposed, what is still unknown, and the
          evidence behind the pre-filled lines. Rationale / questions / refs
          are Hebrew data values, rendered right-to-left. */}
      {d?.rationale ? (
        <div className="mb-5 rounded-md border border-border/60 bg-bg-subtle/40 p-4 text-sm" data-testid="im-review-rationale">
          <div className="mb-1 text-xs font-semibold text-fg-muted">Why this was proposed</div>
          <p dir="rtl" className="whitespace-pre-wrap text-fg">
            {d.rationale}
          </p>
        </div>
      ) : null}

      {openQuestions.length > 0 ? (
        <div
          className="mb-5 rounded-md border border-warning/40 bg-warning-softer/60 p-4 text-sm text-warning-fg"
          data-testid="im-review-open-questions"
        >
          <div className="font-semibold">Open questions — answer before approving</div>
          <ul dir="rtl" className="mt-2 list-disc space-y-1 pr-5 text-fg">
            {openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
          <label className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center gap-2 font-medium text-fg">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={questionsChecked}
              onChange={(e) => setQuestionsChecked(e.target.checked)}
              data-testid="im-review-open-questions-check"
            />
            I&apos;ve checked the open questions
          </label>
        </div>
      ) : null}

      {evidence.length > 0 ? (
        <div className="mb-5 rounded-md border border-border/60 p-4 text-sm" data-testid="im-review-evidence">
          <div className="mb-1 text-xs font-semibold text-fg-muted">Evidence</div>
          <ul className="space-y-1">
            {evidence.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-fg-muted">{ORIGIN_LABELS[e.type] ?? e.type}</span>
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer" className="text-primary underline" dir="auto">
                    {e.ref}
                  </a>
                ) : (
                  <span className="text-fg" dir="auto">
                    {e.ref}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {creditTaskIds.length > 0 ? (
        <div className="mb-5 flex items-start gap-2 text-xs text-fg-muted" data-testid="im-review-credit-tasks">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          <span>
            {plural(creditTaskIds.length, "linked picking shortage")}: approving marks each one supplied when the
            approved Out quantity of its item covers it.
          </span>
        </div>
      ) : null}

      {/* FLOW-IM-009 — when the proposal is no longer pending, warn loudly
          above the editor and disable both actions (handled via canApprove /
          canReject below). */}
      {d && d.status !== "pending" ? (
        <div
          className="mb-5 rounded-md border border-warning/40 bg-warning-softer/60 p-4 text-sm text-warning-fg"
          data-testid="im-review-not-pending-banner"
        >
          <div className="font-semibold">This movement is no longer pending</div>
          <div className="mt-1 text-xs">
            {d.status === "posted"
              ? "It has already been approved and posted to the stock ledger. Approve and Reject are disabled."
              : d.status === "rejected"
                ? "It has already been rejected. Approve and Reject are disabled."
                : "Another reviewer may have actioned it. Approve and Reject are disabled — refresh the inbox."}
          </div>
        </div>
      ) : null}

      {isOwnUnprivileged ? (
        <div className="mb-5 rounded-md border border-warning/40 bg-warning-softer/60 p-4 text-sm text-warning-fg">
          <div className="font-semibold">You cannot approve your own submission</div>
          <div className="mt-1 text-xs">
            Only an admin or planner may approve a movement. Ask another reviewer
            to action it from the inbox.
          </div>
        </div>
      ) : null}

      {/* FLOW-IM-014 — exchange info banner. Two lines (out + in) are required
          to record the full swap; posting only one leaves the other unrecorded. */}
      {isExchange ? (
        <div
          className="mb-5 flex items-start gap-2 rounded-md border border-info/40 bg-info-softer/60 p-4 text-sm text-info-fg"
          data-testid="im-review-exchange-banner"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          <div>
            <div className="font-semibold">This is an exchange</div>
            <div className="mt-1 text-xs">
              Enter one Out line and one In line; posting one leg only leaves
              the other unrecorded.
            </div>
          </div>
        </div>
      ) : null}

      <SectionCard
        eyebrow="Approve"
        title="Confirm the stock move"
        description="Review the pre-filled lines and adjust if needed, or add lines manually. Approving posts one stock-ledger row per line. Use two lines (out + in) for an exchange."
      >
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 p-3" data-testid="im-review-line">
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
              {/* FLOW-IM-004 Path B — rename "Item id" to "Item code" and add
                  a helper note. Typeahead (Path A) is out of scope. */}
              <label className="flex flex-col gap-1 grow">
                <span className="text-xs font-medium text-fg-muted">Item code</span>
                <input
                  className={inputCls}
                  aria-label="Item code"
                  value={l.item_id}
                  onChange={(e) => updateLine(i, { item_id: e.target.value })}
                  placeholder="item / component code"
                />
                <span className="text-3xs text-fg-subtle">
                  Enter the exact code from Admin → Items.
                </span>
              </label>
              <label className="flex flex-col gap-1 w-24">
                <span className="text-xs font-medium text-fg-muted">Qty</span>
                <input
                  className={inputCls}
                  aria-label="Qty"
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
                  aria-label="Unit"
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
                      {REASON_CODE_LABELS[rc]}
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
              {l.origin ? (
                <div className="w-full text-3xs text-fg-subtle" data-testid="im-review-line-origin">
                  Proposed from {ORIGIN_LABELS[l.origin.source] ?? l.origin.source} ·{" "}
                  <span className={l.origin.confidence === "high" ? "text-success-fg" : "text-warning-fg"}>
                    {CONFIDENCE_LABELS[l.origin.confidence] ?? l.origin.confidence}
                  </span>
                  {l.origin.evidence_ref ? (
                    <span className="ml-1 font-mono" dir="auto">
                      ({l.origin.evidence_ref})
                    </span>
                  ) : null}
                </div>
              ) : null}
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
          {/* FLOW-IM-001 — two-step confirm zone before Approve fires.
              Mirrors the physical-count alertdialog pattern. */}
          {confirmingApprove ? (
            <div
              className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-softer px-4 py-3"
              role="alertdialog"
              aria-label="Confirm approval"
              data-testid="im-review-approve-confirm-zone"
            >
              <div className="text-sm text-warning-fg">
                Approving posts the following{" "}
                <span className="font-semibold">
                  {lines.length} stock-ledger row{lines.length === 1 ? "" : "s"}
                </span>{" "}
                and cannot be undone:
              </div>
              <ul className="space-y-1 text-sm">
                {lines.map((l, i) => (
                  <li key={i} className="flex gap-2 tabular-nums">
                    <span
                      className={
                        l.direction === "in"
                          ? "font-semibold text-success-fg"
                          : "font-semibold text-danger-fg"
                      }
                    >
                      {l.direction === "in" ? "In" : "Out"}
                    </span>
                    <span>
                      {l.quantity} {l.unit}
                    </span>
                    <span className="text-fg-muted">·</span>
                    <span className="font-mono text-fg">{l.item_id}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="im-review-approve-confirm"
                  className="btn btn-sm btn-primary"
                  disabled={approveBusy || !questionsCleared}
                  onClick={handleApprove}
                >
                  {approveBusy ? "Posting…" : "Yes, approve"}
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
              data-testid="im-review-approve"
              className="btn btn-lg btn-primary"
              disabled={!canApprove}
              onClick={() => setConfirmingApprove(true)}
            >
              {`Approve & post ${lines.length}`}
            </button>
          )}
          {!allLinesValid ? (
            <p className="mt-2 text-xs text-fg-muted">
              Complete every line (item code, quantity, unit) before approving, or remove the incomplete ones — all lines are posted.
            </p>
          ) : null}
          {!questionsCleared ? (
            <p className="mt-2 text-xs text-fg-muted" data-testid="im-review-open-questions-hint">
              Check the open questions above and tick the box before approving.
            </p>
          ) : null}
          {/* FLOW-IM-014 — non-blocking single-line-exchange warning. */}
          {exchangeSingleLineWarning && !confirmingApprove ? (
            <div
              className="mt-2 flex items-start gap-1.5 text-xs text-warning-fg"
              data-testid="im-review-exchange-single-line-warn"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              <span>
                This exchange has only one line. Add the matching{" "}
                {lines[0]?.direction === "in" ? "Out" : "In"} line so both legs
                are recorded.
              </span>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard eyebrow="Reject" title="Refuse this movement" description="Nothing is posted to the stock ledger. The reason surfaces on the audit trail.">
        {/* FLOW-IM-010 — rejection reason is required (mirror waste / PC). */}
        <label className="block mb-2 text-sm font-semibold text-fg">
          Rejection reason <span className="font-normal text-danger-fg">*</span>
        </label>
        <NotesBox value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Shown on the audit trail." />
        <div className="mt-5">
          <button
            type="button"
            data-testid="im-review-reject"
            className="btn btn-lg btn-danger"
            disabled={!canReject}
            onClick={handleReject}
          >
            {rejectBusy ? "Submitting…" : "Reject movement"}
          </button>
        </div>
      </SectionCard>
    </>
  );
}
