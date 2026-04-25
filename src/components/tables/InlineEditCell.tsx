"use client";

// ---------------------------------------------------------------------------
// <InlineEditCell> — AMMC v1 Slice 3.
//
// Click-to-edit single-scalar cell for list tables. Used on /admin/supplier-items,
// /admin/planning-policy, etc. for price / lead_time / moq / pack_conversion /
// value edits without pushing the user into a detail page.
//
// Contract:
//   - Display mode: rendered value + subtle edit cursor hint on hover
//   - Click → becomes <input>, focused, selected all text
//   - Enter → calls onSave(newValue); spinner during save
//   - Esc → cancels edit (no save)
//   - blur → calls onSave (same path as Enter)
//   - onSave throws or rejects → revert to original value + show error tooltip
//   - caller is responsible for the actual PATCH + invalidation + if-match
//     header construction; this component does not know about server mechanics
//
// Shared props:
//   - ifMatchUpdatedAt — passed through untouched; useful for the caller's
//     onSave closure to include in the PATCH body
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export interface InlineEditCellProps {
  /** Current display value. */
  value: string | number;
  /**
   * Save handler. Receives the new value. Should persist to server and throw
   * on any non-2xx response. Errors are caught and displayed as tooltip text.
   */
  onSave: (newValue: string | number) => Promise<void>;
  /** HTML input type — text or number. Default 'text'. */
  type?: "text" | "number";
  /** HTML inputMode attribute (e.g. 'decimal' for prices). */
  inputMode?:
    | "none"
    | "text"
    | "tel"
    | "url"
    | "email"
    | "numeric"
    | "decimal"
    | "search";
  /** Formatter for display mode (e.g. `v => Number(v).toFixed(2)`). */
  format?: (v: string | number) => string;
  /**
   * Opaque concurrency token. Not consumed by this component directly; the
   * prop exists so callers can include it in their onSave closure and the
   * component re-renders cleanly when the server returns a fresh value.
   */
  ifMatchUpdatedAt?: string;
  /** Disable the control (still displays, no click-to-edit). */
  disabled?: boolean;
  /** Optional ARIA label for screen readers when the value alone is cryptic. */
  ariaLabel?: string;
}

export function InlineEditCell({
  value,
  onSave,
  type = "text",
  inputMode,
  format,
  ifMatchUpdatedAt: _ifMatchUpdatedAt,
  disabled,
  ariaLabel,
}: InlineEditCellProps): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>(String(value));
  const inputRef = useRef<HTMLInputElement | null>(null);

  // If the parent-provided value changes while we're not editing, track it.
  useEffect(() => {
    if (!editing) {
      setDraft(String(value));
    }
  }, [value, editing]);

  const enterEdit = useCallback(() => {
    if (disabled || saving) return;
    setError(null);
    setDraft(String(value));
    setEditing(true);
  }, [disabled, saving, value]);

  // Focus + select-all on edit entry.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(async () => {
    if (!editing) return;
    const newValueString = draft.trim();
    const newValue: string | number =
      type === "number" ? Number(newValueString) : newValueString;

    // No-change → exit edit without calling onSave.
    if (String(newValue) === String(value)) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(newValue);
      setEditing(false);
    } catch (err) {
      // Revert the draft to the original value so the UI reflects truth.
      setDraft(String(value));
      setError(err instanceof Error ? err.message : String(err));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [draft, editing, onSave, type, value]);

  const cancel = useCallback(() => {
    setDraft(String(value));
    setError(null);
    setEditing(false);
  }, [value]);

  // --- Display mode ---
  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel ?? `Edit value ${value}`}
        data-testid="inline-edit-cell-display"
        onClick={enterEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            enterEdit();
          }
        }}
        className={cn(
          "group inline-flex items-center gap-1 rounded-sm px-1 py-0.5",
          disabled
            ? "cursor-not-allowed text-fg-faint"
            : "cursor-pointer border-b border-dashed border-accent/40 hover:border-accent hover:bg-accent/5",
          error && "text-danger-fg",
        )}
        title={error ? error : disabled ? undefined : "Click to edit"}
      >
        <span className="truncate">
          {format ? format(value) : String(value)}
        </span>
        {saving ? (
          <Loader2
            className="h-3 w-3 animate-spin text-fg-faint"
            strokeWidth={2}
            data-testid="inline-edit-cell-saving"
          />
        ) : disabled ? null : (
          <Pencil
            className="h-3 w-3 text-accent/60 opacity-60 transition-opacity duration-150 group-hover:opacity-100"
            strokeWidth={2}
          />
        )}
      </span>
    );
  }

  // --- Edit mode ---
  return (
    <input
      ref={inputRef}
      data-testid="inline-edit-cell-input"
      type={type}
      inputMode={inputMode}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        void commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      disabled={saving}
      className={cn(
        "input h-7 w-full max-w-[180px] px-2 py-0.5 text-sm",
        error && "input-error",
      )}
      aria-label={ariaLabel ?? "Edit value"}
    />
  );
}
