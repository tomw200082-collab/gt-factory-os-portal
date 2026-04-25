// PublishConfirmModal — three-variant publish confirmation driven by the
// /api/boms/versions/:id/publish-preview response and the in-memory UI
// warnings (supplier/price gaps from the readiness layer).
//
// Variants:
//   A. Clean: backend says clean AND no UI warnings → simple confirm.
//   B. Warnings (override-able): backend warnings or UI warnings present
//      and can_publish_with_override true → checkbox + Publish anyway.
//   C. Hard-block: can_publish_with_override === false → blockers shown,
//      no Publish button.

"use client";

import { useState } from "react";

export interface PublishPreview {
  blocking_issues: string[];
  warnings: string[];
  can_publish_clean: boolean;
  can_publish_with_override: boolean;
}

interface PublishConfirmModalProps {
  preview: PublishPreview;
  uiWarnings: string[];
  nextVersionLabel: string;
  onCancel: () => void;
  /** Variant A → false; Variant B → true. Variant C never invokes. */
  onConfirm: (confirmOverride: boolean) => void;
}

const HEBREW_BLOCKER: Record<string, string> = {
  EMPTY_VERSION: "מתכון ריק",
  PLANNING_RUN_IN_FLIGHT: "ריצת תכנון פעילה — להמתין לסיום",
  VERSION_NOT_DRAFT: "הגרסה אינה טיוטה",
  STALE_ROW: "השורה התעדכנה — רענן",
};

export function PublishConfirmModal({
  preview,
  uiWarnings,
  nextVersionLabel,
  onCancel,
  onConfirm,
}: PublishConfirmModalProps): JSX.Element {
  const [agreed, setAgreed] = useState(false);

  // Variant C: hard-block.
  if (!preview.can_publish_with_override) {
    return (
      <div
        role="dialog"
        aria-label="Publish blocked"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      >
        <div className="rounded-md bg-white p-4 shadow-lg max-w-md">
          <h3 className="font-semibold">לא ניתן לפרסם</h3>
          <ul className="mt-2 text-sm">
            {preview.blocking_issues.map((b) => (
              <li key={b}>🔴 {HEBREW_BLOCKER[b] ?? b}</li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border px-3 py-1"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Variant A: clean (backend AND no UI warnings).
  if (
    preview.can_publish_clean &&
    preview.warnings.length === 0 &&
    uiWarnings.length === 0
  ) {
    return (
      <div
        role="dialog"
        aria-label="Confirm publish"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      >
        <div className="rounded-md bg-white p-4 shadow-lg max-w-md">
          <p>
            פרסם {nextVersionLabel}? הגרסה הקודמת תועבר ל-SUPERSEDED. ייצורים
            היסטוריים נשמרים על הגרסה הישנה.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border px-3 py-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(false)}
              className="rounded bg-blue-600 px-3 py-1 text-white"
            >
              Publish
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Variant B: warnings present, override-able.
  return (
    <div
      role="dialog"
      aria-label="Confirm publish with warnings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="rounded-md bg-white p-4 shadow-lg max-w-md">
        <h3 className="font-semibold">פרסום עם אזהרות</h3>
        <ul className="mt-2 text-sm">
          {preview.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
          {uiWarnings.map((w) => (
            <li key={`ui-${w}`}>⚠ {w}</li>
          ))}
        </ul>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          אני מאשר את האזהרות הללו
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border px-3 py-1"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!agreed}
            onClick={() => onConfirm(true)}
            className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50"
          >
            Publish anyway
          </button>
        </div>
      </div>
    </div>
  );
}
