"use client";

// Movement Log — undo a single FG_OUT_PICK delivery decrement (Tom 2026-07-03).
//
// Companion to FgOutPauseControl: the pause freezes FUTURE decrements; this
// reverses one that already posted (e.g. a delivery LionWheel confirmed just
// before the pause was switched on). Scope locked via /ck:grill 2026-07-03:
// FG_OUT_PICK only, per-row, admin/planner only, no time limit, reason
// optional. Reuses the already-ratified FG_OUT_PICK_REVERSAL movement type
// (LOCKED_DECISIONS.md §LionWheel) — a UI for a correction Tom was already
// doing by hand via psql, not a new ledger mechanism. English/LTR.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";

export interface FgOutPickReversalStatus {
  reversed: boolean;
  reversed_at: string | null;
  reversed_by: string | null;
}

interface UndoResponse extends FgOutPickReversalStatus {
  dual_role_cover_warning?: boolean;
}

async function fetchReversalStatus(
  movementId: string,
): Promise<FgOutPickReversalStatus> {
  const res = await fetch(
    `/api/stock/fg-out-pick/${encodeURIComponent(movementId)}/reversal-status`,
  );
  if (!res.ok) {
    throw new Error(`Reversal-status request failed (HTTP ${res.status})`);
  }
  return (await res.json()) as FgOutPickReversalStatus;
}

async function postUndo(
  movementId: string,
  reason: string,
): Promise<UndoResponse> {
  const res = await fetch(
    `/api/stock/fg-out-pick/${encodeURIComponent(movementId)}/undo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() || undefined }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { detail?: string; error?: string }
      | null;
    throw new Error(
      body?.detail ?? body?.error ?? `Undo failed (HTTP ${res.status})`,
    );
  }
  return (await res.json()) as UndoResponse;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FgOutPickUndoControl({
  movementId,
  movementType,
  onUndone,
}: {
  movementId: string;
  movementType: string;
  /** Called after a successful undo so the parent can refresh the list. */
  onUndone: () => void;
}) {
  const { session } = useSession();
  const qc = useQueryClient();
  const canUndo = session.role === "admin" || session.role === "planner";
  const isPickRow = movementType === "FG_OUT_PICK";

  // Unlike the pause banner (visible to every role), nobody but admin/planner
  // ever sees UI from this component — so skip the fetch entirely for
  // everyone else rather than reading state nobody will act on.
  const { data, isLoading } = useQuery<FgOutPickReversalStatus>({
    queryKey: ["fg-out-pick-reversal-status", movementId],
    queryFn: () => fetchReversalStatus(movementId),
    enabled: isPickRow && canUndo,
    staleTime: 15_000,
  });

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [dualRoleWarning, setDualRoleWarning] = useState(false);

  const mutation = useMutation({
    mutationFn: () => postUndo(movementId, reason),
    onSuccess: (result) => {
      setOpen(false);
      setReason("");
      setDualRoleWarning(result.dual_role_cover_warning === true);
      qc.invalidateQueries({ queryKey: ["fg-out-pick-reversal-status", movementId] });
      onUndone();
    },
  });

  if (!isPickRow || !canUndo) return null;
  if (isLoading) return null;

  if (data?.reversed) {
    return (
      <p
        className="text-2xs text-fg-muted"
        data-testid="fg-out-pick-undo-already-reversed"
      >
        <span className="font-medium text-fg">This delivery was undone.</span>{" "}
        {data.reversed_by ? `By ${data.reversed_by}` : null}
        {data.reversed_at ? ` · ${formatWhen(data.reversed_at)}` : null}
      </p>
    );
  }

  if (dualRoleWarning) {
    return (
      <p
        className="text-2xs text-warning-fg"
        role="status"
        data-testid="fg-out-pick-undo-dual-role-warning"
      >
        Undone — but this item shares stock with a bulk raw-material component
        that was NOT automatically adjusted. Check it manually.
      </p>
    );
  }

  return (
    <div data-testid="fg-out-pick-undo-control">
      {!open ? (
        <button
          type="button"
          className="btn btn-sm border-warning/50 text-warning-fg hover:bg-warning-softer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          onClick={() => setOpen(true)}
          data-testid="fg-out-pick-undo-open"
        >
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden>↶</span>
            Undo this delivery
          </span>
        </button>
      ) : (
        <div className="space-y-2 rounded-md border border-warning/40 bg-warning-softer/40 p-3">
          <p className="text-2xs text-fg-muted">
            This removes the stock decrement from this delivery. Use this if
            the delivery was already counted before the movement was posted.
          </p>
          <label className="block text-2xs font-semibold text-fg">
            Reason (optional)
            <input
              type="text"
              autoFocus
              className="mt-1 w-full rounded border border-border bg-bg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Counted before this delivery posted"
              disabled={mutation.isPending}
              data-testid="fg-out-pick-undo-reason"
            />
          </label>
          {mutation.isError ? (
            <p
              className="text-2xs text-danger-fg"
              role="alert"
              data-testid="fg-out-pick-undo-error"
            >
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Something went wrong."}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "btn btn-sm btn-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              )}
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              data-testid="fg-out-pick-undo-confirm"
            >
              {mutation.isPending ? "Undoing…" : "Confirm undo"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOpen(false);
                setReason("");
                mutation.reset();
              }}
              disabled={mutation.isPending}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
