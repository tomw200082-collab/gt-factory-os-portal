"use client";

import { type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ClassWEditDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  warning: string;
  preview?: string;
  onSave: () => Promise<void>;
  isSaving?: boolean;
  error?: string | null;
  children: ReactNode;
}

export function ClassWEditDrawer({
  open,
  onClose,
  title,
  warning,
  preview,
  onSave,
  isSaving,
  error,
  children,
}: ClassWEditDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-fg-strong">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-softer p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning-fg mt-0.5" />
            <p className="text-sm text-warning-fg">{warning}</p>
          </div>

          {preview ? (
            <div className="rounded-md border border-border/60 bg-bg-subtle p-3 text-xs text-fg-muted font-mono whitespace-pre-wrap">
              {preview}
            </div>
          ) : null}

          <div className="space-y-3">{children}</div>

          {error ? <p className="text-sm text-danger-fg">{error}</p> : null}
        </div>

        <div className="border-t border-border px-4 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Save change"}
          </button>
        </div>
      </div>
    </div>
  );
}
