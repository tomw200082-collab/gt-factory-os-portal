"use client";

// ---------------------------------------------------------------------------
// <ClassWEditDrawer> — confirm-with-context drawer for Class-W edits
// (archive / reversal flows that capture a reason).
//
// Tranche 068 (admin UX/UI audit A11Y-007). Rebuilt on Radix Dialog so the
// overlay is a real modal dialog: Radix provides the focus trap, focus return
// to the trigger on close, Escape handling, aria-modal, and aria-labelledby
// (wired to <Dialog.Title>). The previous custom `fixed inset-0` overlay had
// none of these — keyboard users could tab behind it unaware. The public API
// (open / onClose / title / warning / preview / onSave / isSaving / error /
// children) and the visual layout are unchanged. While saving, Escape and
// backdrop-close are suppressed so an in-flight write is not abandoned.
// ---------------------------------------------------------------------------

import { type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/cn";

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
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Close on Escape / backdrop / X — but never mid-save.
        if (!next && !isSaving) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px]",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out data-[state=open]:fade-in",
          )}
        />
        <Dialog.Content
          onEscapeKeyDown={(e) => {
            if (isSaving) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (isSaving) e.preventDefault();
          }}
          className={cn(
            "fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col",
            "border-l border-border/70 bg-bg-raised shadow-xl",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Dialog.Title className="text-sm font-semibold text-fg-strong">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label="Close"
                disabled={isSaving}
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            <Dialog.Description asChild>
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-softer p-3">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning-fg mt-0.5" />
                <p className="text-sm text-warning-fg">{warning}</p>
              </div>
            </Dialog.Description>

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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
