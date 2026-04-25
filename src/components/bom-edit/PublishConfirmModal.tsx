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

const BLOCKER_COPY: Record<string, string> = {
  EMPTY_VERSION: "Version has no components",
  PLANNING_RUN_IN_FLIGHT: "A planning run is currently active — wait for it to finish",
  VERSION_NOT_DRAFT: "Version is no longer a DRAFT",
  STALE_ROW: "Version was updated by another user — refresh and retry",
};

const Shell = ({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: React.ReactNode;
}) => (
  <div
    role="dialog"
    aria-label={ariaLabel}
    className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4"
  >
    <div className="w-full max-w-md rounded-md border border-border bg-bg-raised p-5 shadow-lg">
      {children}
    </div>
  </div>
);

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
      <Shell ariaLabel="Publish blocked">
        <h3 className="text-base font-semibold text-danger-fg">
          Cannot publish
        </h3>
        <p className="mt-1 text-xs text-fg-muted">
          The backend rejected this version. Resolve the issues below and try
          again.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {preview.blocking_issues.map((b) => (
            <li
              key={b}
              className="flex items-start gap-1.5 rounded-sm border border-danger-border bg-danger-soft px-2.5 py-1.5 text-danger-fg"
            >
              <span
                aria-hidden
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger"
              />
              <span>{BLOCKER_COPY[b] ?? b}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
          >
            Close
          </button>
        </div>
      </Shell>
    );
  }

  // Variant A: clean (backend AND no UI warnings).
  if (
    preview.can_publish_clean &&
    preview.warnings.length === 0 &&
    uiWarnings.length === 0
  ) {
    return (
      <Shell ariaLabel="Confirm publish">
        <h3 className="text-base font-semibold text-fg-strong">
          Publish version {nextVersionLabel}?
        </h3>
        <p className="mt-2 text-sm text-fg">
          The previous version will be moved to <strong>SUPERSEDED</strong>.
          Historical production records remain pinned to the old version.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="rounded-sm border border-accent-border bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
          >
            Publish
          </button>
        </div>
      </Shell>
    );
  }

  // Variant B: warnings present, override-able.
  return (
    <Shell ariaLabel="Confirm publish with warnings">
      <h3 className="text-base font-semibold text-warning-fg">
        Publish with warnings
      </h3>
      <p className="mt-2 text-sm text-fg">
        The version can be published, but supplier and price readiness has
        unresolved warnings. The product card will stay <strong>yellow</strong>{" "}
        until they are fixed.
      </p>
      <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">
        {preview.warnings.map((w) => (
          <li
            key={w}
            className="flex items-start gap-1.5 rounded-sm border border-warning-border bg-warning-soft px-2.5 py-1.5 text-warning-fg"
          >
            <span
              aria-hidden
              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
            />
            <span>{w}</span>
          </li>
        ))}
        {uiWarnings.map((w) => (
          <li
            key={`ui-${w}`}
            className="flex items-start gap-1.5 rounded-sm border border-warning-border bg-warning-soft px-2.5 py-1.5 text-warning-fg"
          >
            <span
              aria-hidden
              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
            />
            <span>{w}</span>
          </li>
        ))}
      </ul>
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 border-border text-accent focus:ring-accent-ring"
        />
        <span className="text-fg">I acknowledge these warnings.</span>
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!agreed}
          onClick={() => onConfirm(true)}
          className="rounded-sm border border-accent-border bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Publish anyway
        </button>
      </div>
    </Shell>
  );
}
