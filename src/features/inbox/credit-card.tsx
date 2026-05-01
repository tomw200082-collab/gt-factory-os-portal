// ---------------------------------------------------------------------------
// CreditNeededCard — four-fact card pattern for `lionwheel_credit_needed`.
//
// Tom-locked per W4 Doc B §7 (`docs/integrations/lionwheel_credit_inbox_contract.md`):
//   1. Cause       — מה קרה: "הוזמנו {ordered}, לוקטו {picked} → חסר {delta}"
//   2. Impact      — איך זה משפיע: "ייתכן זיכוי ללקוח"
//   3. Next action — מה לעשות: "אשר זיכוי / דחה / ראיתי"
//   4. Source      — מקור / עדכניות: "LionWheel · {wp_order_id} · {humanized completed_at}"
//
// Names-not-IDs (memory feedback_names_not_ids_in_ui.md):
//   - wp_order_id (e.g. #GT12705) is the primary user-facing reference.
//   - lw_task_id / lw_order_item_id are technical and shown only inside a
//     collapsible debug section.
//
// Mode B-LionWheelCreditInbox-NightRun (Tom auth 2026-04-30 + plan-of-record
// §Chunk 5b). No backend authorship; consumes the W4 Doc B DTO verbatim.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Detail payload shape — verbatim from W4 Doc B §2 `detail_payload`.
// Backend stores this on `private_core.exceptions.detail` (JSON-encoded).
// W2 best-effort parses it; missing fields render as "—" honestly rather
// than fabricating values.
// ---------------------------------------------------------------------------
export interface CreditNeededDetailPayload {
  lw_task_id?: string;
  lw_order_item_id?: string;
  wp_order_id?: string;
  wp_order_key?: string | null;
  item_id?: string;
  item_name?: string;
  lw_qty_ordered?: string;
  lw_qty_picked?: string;
  shortage_delta?: string;
  delivery_completed_at?: string;
  picker_note?: string | null;
}

/**
 * Parses the upstream `private_core.exceptions.detail` field (string|null|object)
 * into a typed credit-needed payload. Returns an empty object if the input is
 * missing or unparseable — never throws. Caller must treat all fields as
 * optional and render fallbacks honestly.
 */
export function parseCreditNeededDetail(
  detail: unknown,
): CreditNeededDetailPayload {
  if (detail === null || detail === undefined) return {};
  // Handler may return detail as a JSON-encoded string.
  if (typeof detail === "string") {
    if (detail.trim().length === 0) return {};
    try {
      const parsed = JSON.parse(detail);
      if (parsed && typeof parsed === "object") {
        return parsed as CreditNeededDetailPayload;
      }
    } catch {
      // Not JSON — fall through and return empty payload.
    }
    return {};
  }
  if (typeof detail === "object") {
    return detail as CreditNeededDetailPayload;
  }
  return {};
}

/**
 * Reads the credit-needed detail payload from an InboxRow's raw upstream row.
 * The /api/exceptions handler nests detail on the row itself (typed as
 * `detail: string | null` in client.ts, but may be JSON-shaped per the
 * backend's storage). Best-effort extraction.
 */
export function extractCreditNeededPayload(
  raw: unknown,
): CreditNeededDetailPayload {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  // Try the structured `detail_payload` field first (W4 DTO §2 explicit).
  if (r.detail_payload) {
    return parseCreditNeededDetail(r.detail_payload);
  }
  // Fall back to the `detail` field (existing handler shape).
  if (r.detail !== undefined) {
    return parseCreditNeededDetail(r.detail);
  }
  return {};
}

// ---------------------------------------------------------------------------
// Humanized relative-time renderer for the source-freshness fact.
// Mirrors the convention of the existing Inbox `ageHumanized` helper but
// produces Hebrew copy because this card is Hebrew end-to-end.
// ---------------------------------------------------------------------------
export function freshnessHumanizedHebrew(iso: string, now: Date): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const deltaMs = now.getTime() - ts;
  const mins = Math.max(0, Math.round(deltaMs / 60_000));
  if (mins < 1) return "כעת";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שעות`;
  if (hrs < 48) return "אתמול";
  const days = Math.round(hrs / 24);
  return `לפני ${days} ימים`;
}

// ---------------------------------------------------------------------------
// FactRow — one fact line of the four-fact card. Label is a small uppercase
// caption above the value text. No emoji per CLAUDE.md global rule.
// ---------------------------------------------------------------------------
function FactRow({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-0.5" data-testid={testId}>
      <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </div>
      <div className="text-sm leading-snug text-fg">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreditNeededFactCard — the four-fact card body.
//
// Used in two places:
//   1. Inline on the global /inbox list as the credit-needed row body.
//   2. On the /inbox/credit/[exception_id] detail page as the headline card.
//
// Mobile-first: stacks vertically by default; desktop layout (sm:) uses a
// 2x2 grid per the "Mobile layout MAY collapse the four facts vertically;
// desktop layout MAY render them as two columns of two" allowance in W4
// Doc B §7.
// ---------------------------------------------------------------------------
export function CreditNeededFactCard({
  payload,
  now,
  showDebug = false,
}: {
  payload: CreditNeededDetailPayload;
  now: Date;
  showDebug?: boolean;
}) {
  const ordered = payload.lw_qty_ordered ?? "—";
  const picked = payload.lw_qty_picked ?? "—";
  const delta = payload.shortage_delta ?? "—";
  const wpOrderId = payload.wp_order_id ?? "—";
  const completedAt = payload.delivery_completed_at;
  const itemName = payload.item_name ?? payload.item_id ?? "—";
  const pickerNote = payload.picker_note;

  // §7.1 Cause — pure values, no IDs.
  const causeText = `הוזמנו ${ordered}, לוקטו ${picked} → חסר ${delta}`;

  // §7.4 Source / freshness — "LionWheel · {wp_order_id} · {humanized}"
  const freshness = completedAt
    ? freshnessHumanizedHebrew(completedAt, now)
    : "—";
  const sourceText = `LionWheel · ${wpOrderId} · ${freshness}`;

  return (
    <div
      className="space-y-3 rounded-md border border-warning/30 bg-warning-softer/40 p-4"
      data-testid="credit-needed-fact-card"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FactRow label="מה קרה" testId="credit-fact-cause">
          <span className="font-medium text-fg-strong">{causeText}</span>
          <div
            className="mt-1 text-xs text-fg-muted"
            data-testid="credit-fact-item-name"
          >
            {itemName}
          </div>
        </FactRow>
        <FactRow label="איך זה משפיע" testId="credit-fact-impact">
          ייתכן זיכוי ללקוח
        </FactRow>
        <FactRow label="מה לעשות" testId="credit-fact-next-action">
          אשר זיכוי / דחה / ראיתי
        </FactRow>
        <FactRow label="מקור / עדכניות" testId="credit-fact-source">
          <span className="font-mono text-xs">{sourceText}</span>
        </FactRow>
      </div>

      {pickerNote && pickerNote.trim().length > 0 ? (
        <div
          className="rounded border border-border/60 bg-bg-raised p-3 text-xs text-fg-muted"
          data-testid="credit-fact-picker-note"
        >
          <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            הערת מלקט
          </div>
          <div className="mt-1 text-sm text-fg">{pickerNote}</div>
        </div>
      ) : null}

      {showDebug ? <DebugBlock payload={payload} /> : null}
    </div>
  );
}

function DebugBlock({ payload }: { payload: CreditNeededDetailPayload }) {
  return (
    <details
      className="rounded border border-border/60 bg-bg-subtle/40 p-2 text-xs"
      data-testid="credit-fact-debug"
    >
      <summary className="cursor-pointer text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        Debug
        <ChevronRight className="ml-1 inline h-3 w-3" />
      </summary>
      <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 font-mono text-3xs text-fg-muted">
        <dt>lw_task_id</dt>
        <dd>{payload.lw_task_id ?? "—"}</dd>
        <dt>lw_order_item_id</dt>
        <dd>{payload.lw_order_item_id ?? "—"}</dd>
        <dt>wp_order_key</dt>
        <dd>{payload.wp_order_key ?? "—"}</dd>
        <dt>item_id</dt>
        <dd>{payload.item_id ?? "—"}</dd>
      </dl>
    </details>
  );
}
