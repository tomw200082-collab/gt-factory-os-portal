// ---------------------------------------------------------------------------
// Focus-queue engine — Tranche 029 (procurement-focus-mode).
//
// Pure helpers that turn the open session's POs into the ordered walk-through
// the focus overlay drives, and compute the smart "advance to the next order
// that still needs me" step after each approve/place/skip.
//
// Order matches the action list: must_today (most-overdue first) then can_wait.
// Handled orders (placed/skipped) are excluded from the queue — focus is for
// the work that remains.
// ---------------------------------------------------------------------------

import {
  groupByDecision,
  type DecisionInput,
  type PoStatusLike,
} from "./decision";

/** Minimal identifiable PO shape the queue reasons about. */
export type QueuePo = DecisionInput & { session_po_id: string };

/** Placed or skipped — no further action needed this session. */
export function isResolved(status: PoStatusLike): boolean {
  return status === "placed" || status === "skipped";
}

/**
 * Ordered list of actionable (proposed/approved) session_po_ids, in decision
 * order: must_today (most-overdue first) then can_wait. Handled orders dropped.
 */
export function buildFocusQueue<T extends QueuePo>(
  pos: readonly T[],
  today?: string,
): string[] {
  const groups = groupByDecision(pos, today);
  return [...groups.must_today, ...groups.can_wait]
    .filter((c) => !isResolved(c.po.status))
    .map((c) => c.po.session_po_id);
}

/**
 * The next id in `queueIds` after `fromId` whose live status is still
 * unresolved. Wraps forward only (no wrap-around): once we pass the end with
 * nothing left, returns null so the caller shows the completion summary.
 *
 * If `fromId` is not in the queue (e.g. it was just resolved and rebuilt out),
 * we scan from the start for the first unresolved id.
 */
export function nextUnresolvedId(
  queueIds: readonly string[],
  fromId: string | null,
  statusById: Readonly<Record<string, PoStatusLike>>,
): string | null {
  const startAfter = fromId == null ? -1 : queueIds.indexOf(fromId);
  for (let i = startAfter + 1; i < queueIds.length; i++) {
    const id = queueIds[i];
    const status = statusById[id];
    if (status != null && !isResolved(status)) return id;
  }
  // Nothing unresolved after `fromId` — look before it so a skipped-then-back
  // walk still lands on remaining work, but only if something is genuinely left.
  for (let i = 0; i <= startAfter && i < queueIds.length; i++) {
    const id = queueIds[i];
    const status = statusById[id];
    if (id !== fromId && status != null && !isResolved(status)) return id;
  }
  return null;
}

/** True when every id in the queue is resolved (drives the done state). */
export function allResolved(
  queueIds: readonly string[],
  statusById: Readonly<Record<string, PoStatusLike>>,
): boolean {
  return queueIds.every((id) => {
    const status = statusById[id];
    return status == null || isResolved(status);
  });
}

/** 1-based position of `id` within the queue, or 0 if absent. */
export function positionOf(queueIds: readonly string[], id: string | null): number {
  if (id == null) return 0;
  const idx = queueIds.indexOf(id);
  return idx < 0 ? 0 : idx + 1;
}
