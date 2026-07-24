"use client";

// ---------------------------------------------------------------------------
// SwitchSupplierControl — raw-material-first supplier re-route (tranche 140).
//
// The buyer calls the current supplier; if they're out of stock / not
// answering, she switches the material to the next candidate supplier from
// right here, optionally recording why (never forced). Presentational + local
// UI state only — the actual mutation is injected via `onSwitch`, so the same
// control drives both the session re-route (procurement) and the real-PO
// switch (placement queue).
//
// States:
//   • no alternative supplier → a calm "return to planner" hint, no action
//     (never a dead-end).
//   • closed → a single "החלף ספק" trigger.
//   • open → candidate chooser (next candidate preselected) + optional reason
//     + confirm / cancel.
// ---------------------------------------------------------------------------

import { useId, useState } from "react";
import { AlertTriangle, Loader2, Repeat2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  CandidateSupplierList,
  type SupplierCandidate,
} from "./CandidateSupplierList";

interface SwitchSupplierControlProps {
  /** All candidates incl. the current supplier (ranked; current flagged). */
  candidates: SupplierCandidate[];
  onSwitch: (args: { target_supplier_id: string; reason?: string }) => void;
  isPending?: boolean;
  error?: string | null;
  /** Clears the surfaced error when the panel is reopened / retried. */
  onResetError?: () => void;
  /** Material name, shown in the panel heading for context. */
  materialLabel?: string;
  className?: string;
}

const QUICK_REASONS = ["אין במלאי", "לא עונה", "מחיר גבוה"] as const;

export function SwitchSupplierControl({
  candidates,
  onSwitch,
  isPending = false,
  error,
  onResetError,
  materialLabel,
  className,
}: SwitchSupplierControlProps) {
  const groupName = useId();
  const alternatives = candidates.filter((c) => !c.is_current);
  const firstAltId = alternatives[0]?.supplier_id ?? null;

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(firstAltId);
  const [reason, setReason] = useState("");

  // No alternative supplier — surface Tom's "return to planner" state instead
  // of a dead button.
  if (alternatives.length === 0) {
    return (
      <p
        className={cn(
          "inline-flex items-center gap-1.5 text-3xs text-fg-muted",
          className,
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5 text-warning-fg" aria-hidden />
        אין ספק חלופי לחומר זה — יש לחזור למתכנן.
      </p>
    );
  }

  function openPanel() {
    onResetError?.();
    setSelectedId(firstAltId);
    setReason("");
    setOpen(true);
  }

  function confirm() {
    if (!selectedId || isPending) return;
    const trimmed = reason.trim();
    onSwitch({
      target_supplier_id: selectedId,
      reason: trimmed.length > 0 ? trimmed : undefined,
    });
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="xs"
        onClick={openPanel}
        className={cn("gap-1", className)}
      >
        <Repeat2 className="h-3.5 w-3.5" aria-hidden />
        החלף ספק
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-accent/40 bg-bg-raised p-3 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-fg">העברה לספק אחר</span>
          {materialLabel ? (
            <span className="text-3xs text-fg-muted">{materialLabel}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="סגור"
          disabled={isPending}
          className="-m-1 rounded p-2 text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <CandidateSupplierList
        candidates={candidates}
        selectedId={selectedId}
        onSelect={setSelectedId}
        groupName={groupName}
        disabled={isPending}
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${groupName}-reason`}
          className="text-3xs font-medium text-fg-muted"
        >
          סיבה (לא חובה)
        </label>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REASONS.map((q) => {
            const active = reason.trim() === q;
            return (
              <button
                key={q}
                type="button"
                disabled={isPending}
                onClick={() => setReason(active ? "" : q)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-3xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-fg-muted hover:border-accent/50",
                  isPending && "opacity-50",
                )}
              >
                {q}
              </button>
            );
          })}
        </div>
        <input
          id={`${groupName}-reason`}
          type="text"
          value={reason}
          disabled={isPending}
          onChange={(e) => setReason(e.target.value)}
          placeholder="למשל: אזל במלאי, מחיר עלה, לא זמין לאספקה…"
          className="input text-xs"
          dir="rtl"
        />
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg bg-danger-softer px-2.5 py-1.5 text-3xs text-danger-fg"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={isPending}
        >
          ביטול
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={confirm}
          disabled={!selectedId || isPending}
          className="gap-1"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Repeat2 className="h-3.5 w-3.5" aria-hidden />
          )}
          העבר לספק
        </Button>
      </div>
    </div>
  );
}
