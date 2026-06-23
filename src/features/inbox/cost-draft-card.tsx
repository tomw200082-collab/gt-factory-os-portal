"use client";

// ---------------------------------------------------------------------------
// CostDraftInlineCard — inline one-tap approve/reject for a supplier
// price-change (cost-draft) decision row on the /inbox list.
//
// Backed by the Price-Truth substrate (supplier_cost_drafts). Approve rewrites
// supplier_items.std_cost_per_inv_uom + price_history + change_log atomically
// via the admin-only decision endpoint; reject closes the draft. The portal
// only forwards the decision — no key minting beyond the idempotency envelope.
//
//   POST /api/cost-drafts/:id/approve  { idempotency_key }
//   POST /api/cost-drafts/:id/reject   { idempotency_key }
//
// Hebrew operator copy per the /inbox UI-language authorization (CLAUDE.md).
// Self-contained success/conflict/error state, mirroring ApprovalInlineCard —
// the row stays showing its outcome until the next inbox refresh.
// ---------------------------------------------------------------------------

import { useState, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CostDraftRow } from "@/features/inbox/client";
import type { InboxRow } from "@/features/inbox/types";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function isCostDraftRaw(raw: unknown): raw is CostDraftRow {
  return (
    typeof raw === "object" &&
    raw !== null &&
    typeof (raw as { supplier_cost_draft_id?: unknown }).supplier_cost_draft_id ===
      "string"
  );
}

/** ₪ with up to 2 decimals; passes through non-numeric verbatim. */
function fmtIls(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return `₪${n.toLocaleString("he-IL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function deltaPct(currentRaw: string | null, suggestedRaw: string): string | null {
  const cur = Number(currentRaw);
  const next = Number(suggestedRaw);
  if (!Number.isFinite(cur) || cur === 0 || !Number.isFinite(next)) return null;
  const pct = ((next - cur) / cur) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

type Outcome =
  | { kind: "approved" }
  | { kind: "rejected" }
  | { kind: "conflict"; detail: string }
  | { kind: "error"; message: string };

function friendlyConflict(reasonCode: string | null | undefined): string {
  if (reasonCode === "DRAFT_NOT_PENDING" || reasonCode === "NOT_PENDING") {
    return "טופל כבר — רענן את התיבה.";
  }
  if (reasonCode === "IDEMPOTENCY_KEY_REUSED") {
    return "כבר נשלח. רענן את התיבה כדי לראות את התוצאה.";
  }
  if (reasonCode === "NOT_FOUND") {
    return "הטיוטה לא נמצאה. ייתכן שטופלה במקום אחר.";
  }
  return "לא ניתן לפעול על הטיוטה כעת. רענן את התיבה.";
}

async function postDecision(
  draftId: string,
  kind: "approve" | "reject",
): Promise<Outcome> {
  const url = `/api/cost-drafts/${encodeURIComponent(draftId)}/${kind}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotency_key: newIdempotencyKey() }),
    });
    const body = (await res.json().catch(() => undefined)) as
      | { reason_code?: string }
      | undefined;
    if (res.status === 200) {
      return kind === "approve" ? { kind: "approved" } : { kind: "rejected" };
    }
    if (res.status === 409 || res.status === 404) {
      return { kind: "conflict", detail: friendlyConflict(body?.reason_code) };
    }
    return {
      kind: "error",
      message: "הפעולה נכשלה. בדוק את החיבור ונסה שוב.",
    };
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-xs font-semibold text-fg-muted">{label}</div>
      <div className="text-base leading-snug text-fg">{children}</div>
    </div>
  );
}

export function CostDraftInlineCard({ row }: { row: InboxRow }): ReactNode {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isCostDraftRaw(row.raw)) return null;
  const d = row.raw;

  if (outcome?.kind === "approved") {
    return (
      <div
        className="mt-3 flex items-center gap-2 rounded-lg border border-success/40 bg-success-subtle px-3 py-2 text-sm text-success"
        aria-live="polite"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        המחיר עודכן ✓ — רענן את התיבה.
      </div>
    );
  }
  if (outcome?.kind === "rejected") {
    return (
      <div
        className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted"
        aria-live="polite"
      >
        <XCircle className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        השינוי נדחה ✓ — רענן את התיבה.
      </div>
    );
  }
  if (outcome?.kind === "conflict" || outcome?.kind === "error") {
    const msg = outcome.kind === "conflict" ? outcome.detail : outcome.message;
    return (
      <div
        className="mt-3 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning"
        aria-live="assertive"
      >
        <XCircle className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        {msg}
      </div>
    );
  }

  const current = d.current_supplier_cost ?? d.current_effective_cost;
  const pct = deltaPct(current, d.suggested_cost_ils);

  async function act(kind: "approve" | "reject") {
    setBusy(true);
    const result = await postDecision(d.supplier_cost_draft_id, kind);
    setBusy(false);
    setOutcome(result);
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-bg-subtle/40 p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {d.supplier_name ? (
          <FactRow label="ספק">{d.supplier_name}</FactRow>
        ) : null}
        <FactRow label="פריט">{d.target_name ?? "—"}</FactRow>
        <FactRow label="מחיר נוכחי">{fmtIls(current)}</FactRow>
        <FactRow label="מחיר מוצע">
          <span className="font-semibold text-fg-strong">
            {fmtIls(d.suggested_cost_ils)}
          </span>
          {pct ? (
            <span
              className={cn(
                "ms-2 text-xs font-semibold",
                pct.startsWith("-") ? "text-success" : "text-danger",
              )}
            >
              {pct}
            </span>
          ) : null}
        </FactRow>
        {d.source_invoice_date ? (
          <FactRow label="מתוך חשבונית">{d.source_invoice_date}</FactRow>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-sm btn-primary gap-1.5 max-md:min-h-[36px]"
          disabled={busy}
          aria-label={`אשר מחיר חדש ${fmtIls(d.suggested_cost_ils)}`}
          onClick={() => void act("approve")}
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />
          אשר מחיר חדש
        </button>
        <button
          type="button"
          className="btn btn-sm gap-1.5 text-danger max-md:min-h-[36px]"
          disabled={busy}
          aria-label="דחה את שינוי המחיר ושמור על המחיר הנוכחי"
          onClick={() => void act("reject")}
        >
          <XCircle className="h-4 w-4" strokeWidth={2.25} />
          דחה
        </button>
        {busy ? (
          <span className="text-xs text-fg-subtle" aria-live="polite">
            שולח…
          </span>
        ) : null}
      </div>
    </div>
  );
}
