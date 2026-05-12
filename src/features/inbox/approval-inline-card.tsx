"use client";

// ---------------------------------------------------------------------------
// ApprovalInlineCard — inline approve/reject panel for waste and physical-count
// approval rows on the /inbox list.
//
// Pattern: mirrors CreditNeededFactCard (four-fact card) but adds action
// buttons so the planner never needs to navigate to the detail page for
// straightforward approvals.
//
// Supported types:
//   approval:waste          → GET/POST /api/waste-adjustments/:id
//   approval:physical_count → GET/POST /api/physical-count/:id
//
// Other approval types (purchase_recommendation, production_recommendation)
// are not handled here — the caller falls back to the "Review" link.
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { InboxRow } from "@/features/inbox/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `inl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Extracts the last path segment (submission_id) from the deep_link URL. */
function extractSubmissionId(deepLink: string): string | null {
  const parts = deepLink.split("/").filter(Boolean);
  return parts.at(-1) ?? null;
}

function ageHumanized(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 1) return "כעת";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שעות`;
  if (hrs < 48) return "אתמול";
  return `לפני ${Math.round(hrs / 24)} ימים`;
}

function formatDelta(delta: string | null | undefined, unit: string): string {
  if (delta == null) return "—";
  const n = Number(delta);
  if (Number.isNaN(n)) return delta;
  return n >= 0 ? `+${n} ${unit}` : `${n} ${unit}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FactRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </div>
      <div className="text-sm leading-snug text-fg">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail shapes (mirrors the detail page interfaces)
// ---------------------------------------------------------------------------

interface WasteDetail {
  submission_id: string;
  status: string;
  direction: string;
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

interface PhysicalCountDetail {
  submission_id: string;
  status: string;
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

type ApprovalDetail = WasteDetail | PhysicalCountDetail;

type ApprovalKind = "waste" | "physical_count";

type Outcome =
  | { kind: "approved" }
  | { kind: "rejected" }
  | { kind: "conflict"; detail: string }
  | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchWasteDetail(submissionId: string): Promise<WasteDetail> {
  const res = await fetch(`/api/waste-adjustments/${encodeURIComponent(submissionId)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Could not load waste adjustment details.");
  return res.json() as Promise<WasteDetail>;
}

async function fetchPhysicalCountDetail(
  submissionId: string,
): Promise<PhysicalCountDetail> {
  const res = await fetch(`/api/physical-count/${encodeURIComponent(submissionId)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Could not load count details.");
  return res.json() as Promise<PhysicalCountDetail>;
}

async function postApprove(
  kind: ApprovalKind,
  submissionId: string,
  approvalNotes: string | null,
): Promise<Outcome> {
  const url =
    kind === "waste"
      ? `/api/waste-adjustments/${encodeURIComponent(submissionId)}/approve`
      : `/api/physical-count/${encodeURIComponent(submissionId)}/approve`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: newIdempotencyKey(),
        approval_notes: approvalNotes ?? null,
      }),
    });
    const body = await res.json().catch(() => undefined);
    if (res.status === 200) return { kind: "approved" };
    if (res.status === 409) {
      return {
        kind: "conflict",
        detail:
          (body as { detail?: string })?.detail ??
          "This submission cannot be actioned in its current state.",
      };
    }
    return { kind: "error", message: "Action failed. Check your connection and try again." };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

async function postReject(
  kind: ApprovalKind,
  submissionId: string,
  rejectionReason: string,
): Promise<Outcome> {
  const url =
    kind === "waste"
      ? `/api/waste-adjustments/${encodeURIComponent(submissionId)}/reject`
      : `/api/physical-count/${encodeURIComponent(submissionId)}/reject`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotency_key: newIdempotencyKey(),
        rejection_reason: rejectionReason,
      }),
    });
    const body = await res.json().catch(() => undefined);
    if (res.status === 200) return { kind: "rejected" };
    if (res.status === 409) {
      return {
        kind: "conflict",
        detail:
          (body as { detail?: string })?.detail ??
          "This submission cannot be actioned in its current state.",
      };
    }
    return { kind: "error", message: "Action failed. Check your connection and try again." };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Fact cards per type
// ---------------------------------------------------------------------------

function WasteFactGrid({ d, now }: { d: WasteDetail; now: Date }) {
  const isLoss = d.direction === "loss";
  const submittedBy = d.submitted_by_display_name
    ? `${d.submitted_by_display_name} · ${ageHumanized(d.submitted_at, now)}`
    : ageHumanized(d.submitted_at, now);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FactRow label="פריט">
        <span className="font-medium text-fg-strong">
          {d.item_display_name ?? d.item_id}
        </span>
      </FactRow>
      <FactRow label="פעולה">
        <span
          className={cn(
            "font-medium",
            isLoss ? "text-danger-fg" : "text-warning-fg",
          )}
        >
          {isLoss ? "ירידה / מחיקה" : "תיקון חיובי"}
        </span>
      </FactRow>
      <FactRow label="כמות">
        {d.quantity} {d.unit}
      </FactRow>
      <FactRow label="סיבה">
        {d.reason_code.replace(/_/g, " ")}
      </FactRow>
      {d.notes ? (
        <FactRow label="הערות">
          <span className="text-fg-muted">{d.notes}</span>
        </FactRow>
      ) : null}
      <FactRow label="הוגש">
        <span className="text-fg-muted">{submittedBy}</span>
      </FactRow>
    </div>
  );
}

function PhysicalCountFactGrid({ d, now }: { d: PhysicalCountDetail; now: Date }) {
  const delta = d.computed_delta != null ? Number(d.computed_delta) : null;
  const deltaColor =
    delta == null ? "text-fg" : delta < 0 ? "text-danger-fg" : "text-warning-fg";
  const submittedBy = d.submitted_by_display_name
    ? `${d.submitted_by_display_name} · ${ageHumanized(d.submitted_at, now)}`
    : ageHumanized(d.submitted_at, now);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FactRow label="פריט">
        <span className="font-medium text-fg-strong">
          {d.item_display_name ?? d.item_id}
        </span>
      </FactRow>
      <FactRow label="נספר">
        {d.counted_quantity} {d.unit}
      </FactRow>
      <FactRow label="צפוי במערכת">
        {d.snapshot_quantity != null ? `${d.snapshot_quantity} ${d.unit}` : "—"}
      </FactRow>
      <FactRow label="הפרש">
        <span className={cn("font-medium", deltaColor)}>
          {formatDelta(d.computed_delta, d.unit)}
        </span>
      </FactRow>
      {d.notes ? (
        <FactRow label="הערות">
          <span className="text-fg-muted">{d.notes}</span>
        </FactRow>
      ) : null}
      <FactRow label="הוגש">
        <span className="text-fg-muted">{submittedBy}</span>
      </FactRow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline reject panel — mirrors ResolvePanel pattern
// ---------------------------------------------------------------------------

function RejectPanel({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, onCancel]);

  return (
    <div className="mt-3 rounded-md border border-danger/40 bg-danger-softer/60 p-3">
      <div className="text-3xs font-semibold uppercase tracking-sops text-danger">
        סיבת דחייה (חובה)
      </div>
      <textarea
        ref={taRef}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="מה הסיבה לדחות את הבקשה? יוצג בנתיב הביקורת."
        rows={2}
        className="mt-1.5 w-full rounded border border-border/60 bg-bg px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-danger/50"
        disabled={busy}
        maxLength={2000}
      />
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={busy || !reason.trim()}
          onClick={() => onConfirm(reason)}
        >
          {busy ? "שולח…" : "אשר דחייה"}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={onCancel}
        >
          ביטול
        </button>
        <span className="ml-auto text-3xs text-fg-subtle">ESC לביטול</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function ApprovalInlineCard({
  row,
  now,
}: {
  row: InboxRow;
  now: Date;
}) {
  const kind: ApprovalKind | null =
    row.type === "approval:waste"
      ? "waste"
      : row.type === "approval:physical_count"
        ? "physical_count"
        : null;

  const submissionId = extractSubmissionId(row.deep_link);

  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (!kind || !submissionId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data =
          kind === "waste"
            ? await fetchWasteDetail(submissionId)
            : await fetchPhysicalCountDetail(submissionId);
        if (!cancelled) setDetail(data);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [kind, submissionId]);

  if (!kind || !submissionId) return null;

  // Post-action states
  if (outcome?.kind === "approved") {
    return (
      <div
        className="mt-3 flex items-center gap-2 rounded-md border border-success/40 bg-success-subtle/30 px-3 py-2.5 text-sm text-success-fg"
        data-testid="approval-inline-success"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} />
        אושר — הפעולה הועברה למחסן
      </div>
    );
  }
  if (outcome?.kind === "rejected") {
    return (
      <div
        className="mt-3 flex items-center gap-2 rounded-md border border-danger/30 bg-danger-softer/40 px-3 py-2.5 text-sm text-danger-fg"
        data-testid="approval-inline-rejected"
      >
        <XCircle className="h-4 w-4 shrink-0" strokeWidth={2} />
        נדחה — הפעולה לא בוצעה
      </div>
    );
  }
  if (outcome?.kind === "conflict" || outcome?.kind === "error") {
    return (
      <div className="mt-3 rounded-md border border-warning/40 bg-warning-softer px-3 py-2.5 text-sm text-warning-fg">
        {outcome.kind === "conflict"
          ? outcome.detail
          : outcome.message}
      </div>
    );
  }

  const borderClass =
    kind === "waste" ? "border-warning/30 bg-warning-softer/40" : "border-info/30 bg-info-softer/30";

  return (
    <div
      className={cn("mt-3 space-y-3 rounded-md border p-4", borderClass)}
      data-testid="approval-inline-card"
    >
      {/* Facts */}
      {detail == null && !loadError ? (
        <div className="text-xs text-fg-muted animate-pulse">טוען פרטים…</div>
      ) : loadError ? (
        <div className="text-xs text-fg-muted">לא ניתן לטעון פרטים. ניתן לאשר או לדחות בכל זאת.</div>
      ) : detail && kind === "waste" ? (
        <WasteFactGrid d={detail as WasteDetail} now={now} />
      ) : detail && kind === "physical_count" ? (
        <PhysicalCountFactGrid d={detail as PhysicalCountDetail} now={now} />
      ) : null}

      {/* Actions */}
      {!showReject ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-primary gap-1.5"
            data-testid="approval-inline-approve"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await postApprove(kind, submissionId, null);
              setOutcome(result);
              setBusy(false);
            }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            {busy ? "שולח…" : "אשר"}
          </button>
          <button
            type="button"
            className="btn btn-sm border-danger/40 text-danger hover:bg-danger-softer"
            data-testid="approval-inline-reject-open"
            disabled={busy}
            onClick={() => setShowReject(true)}
          >
            דחה
          </button>
        </div>
      ) : null}

      {showReject ? (
        <RejectPanel
          busy={busy}
          onCancel={() => setShowReject(false)}
          onConfirm={async (reason) => {
            setBusy(true);
            const result = await postReject(kind, submissionId, reason);
            setOutcome(result);
            setBusy(false);
          }}
        />
      ) : null}
    </div>
  );
}
