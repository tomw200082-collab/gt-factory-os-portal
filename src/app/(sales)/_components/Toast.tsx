"use client";

// Transient confirmation, to the portal's standard: bottom-anchored above the
// tab bar, auto-dismissing after 4.5s, and closable by hand
// (docs/portal_ux_standard.md §9). Three screens raise one of these, so the
// close button and the timer live here once rather than in each of them.

import { X } from "lucide-react";
import { UI } from "../_lib/labels";

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export function Toast({
  message,
  action,
  onClose,
}: {
  message: string;
  /** An optional way back. A destructive action that can only be undone by
   *  hunting the record down is a destructive action people stop trusting. */
  action?: ToastAction;
  onClose: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sales-toast"
      className="fixed inset-x-0 mx-auto flex w-fit items-center gap-2 rounded-full py-2 ps-4 pe-2 text-[13px]"
      style={{
        background: "hsl(var(--s-fg))",
        color: "hsl(var(--s-bg))",
        bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {message}
      {action ? (
        <button
          type="button"
          data-testid="sales-toast-action"
          onClick={action.onAction}
          className="rounded-full px-3 py-1 font-medium underline"
          style={{ color: "hsl(var(--s-bg))", minHeight: 44 }}
        >
          {action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        aria-label={UI.close}
        data-testid="sales-toast-close"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
        style={{ color: "hsl(var(--s-bg))" }}
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
