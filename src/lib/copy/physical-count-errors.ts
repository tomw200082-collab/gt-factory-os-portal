// ---------------------------------------------------------------------------
// Physical Count — operator-facing error copy.
//
// Maps every documented conflict reason_code from the physical-count runtime
// contract (docs/physical_count_runtime_contract.md, mirrored in
// src/lib/contracts/physical-count.ts PhysicalCountConflictReason) to a plain
// English sentence an operator can act on. Raw JSON / reason codes are never
// shown as the primary message (portal_ux_standard.md §1); unknown codes fall
// back to a generic retry sentence that includes the code for support calls.
// ---------------------------------------------------------------------------

const REASON_COPY: Record<string, string> = {
  ITEM_INACTIVE:
    "This item is inactive and cannot be counted. Ask an admin to reactivate it first.",
  UNIT_NOT_FOUND:
    "The unit on this item is not recognized. Ask an admin to check the item master.",
  UNIT_INCOMPATIBLE:
    "Unit mismatch — this item must be counted in its default unit. Ask an admin to check the item master.",
  ITEM_TYPE_MISMATCH:
    "Item type mismatch. Refresh the page and try again.",
  COUNT_ALREADY_OPEN:
    "A count for this item is already open. Try saving again — the open count will be reused.",
  COUNT_FREEZE_ACTIVE:
    "A previous count for this item is still awaiting planner approval — it must be approved or rejected in the approvals inbox before a new count can start. If you are not a planner, ask one to review it.",
  SNAPSHOT_NOT_FOUND:
    "The count snapshot was not found. Save again to open a fresh one.",
  SNAPSHOT_EXPIRED:
    "The count snapshot expired. Save again to open a fresh one and recount.",
  SNAPSHOT_OWNER_MISMATCH:
    "This count was started by a different user. Only the user who opened it can submit it — save again to open your own.",
  SNAPSHOT_ALREADY_CONSUMED:
    "This count was already submitted — no duplicate was created.",
  THRESHOLD_NOT_CONFIGURED:
    "The count approval threshold is not configured for this item type. Ask an admin to set the counting policy.",
  IDEMPOTENCY_KEY_REUSED:
    "This count was already submitted. Refresh to see the result.",
};

/**
 * Operator-facing message for a failed physical-count call.
 * `body` is the parsed error response (may be null on network/parse failure).
 */
export function friendlyCountError(
  body: unknown,
  httpStatus: number,
): string {
  const reason =
    body && typeof body === "object" && "reason_code" in body
      ? String((body as { reason_code: unknown }).reason_code)
      : undefined;
  if (reason && REASON_COPY[reason]) return REASON_COPY[reason];
  if (httpStatus === 422) {
    return "The count could not be validated. Check the quantity and try again.";
  }
  if (httpStatus === 403) {
    return "You do not have permission for this action.";
  }
  return `The count could not be submitted${reason ? ` (code: ${reason})` : ""}. Try again, or contact an admin if it keeps failing.`;
}
