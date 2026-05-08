"use client";

// ---------------------------------------------------------------------------
// DevTicketModal — FLOW-003 closure (Phase 8 Run C, 2026-05-08).
//
// Replaces the dead-text "פנה למפתח" CTA with an actionable in-app dialog
// that captures blocker context (id, subtype, affected entity, message,
// urgency, severity, timestamp, source screen, planning run id) and lets
// the planner copy or mail it to the dev team.
//
// Audience: planner + admin (per project_inbox_audience_planner_admin_only).
// Backend: none. No external integration. Browser-local only.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Copy, Mail, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DEV_TEAM_EMAIL,
  buildDevTicketPayload,
  buildMailtoHref,
} from "../_lib/devTicketContent";
import type { BlockerRow as BlockerRowData } from "../_lib/types";

interface DevTicketModalProps {
  row: BlockerRowData;
  open: boolean;
  onClose: () => void;
}

export function DevTicketModal({ row, open, onClose }: DevTicketModalProps) {
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  const payload = buildDevTicketPayload(row);
  const mailtoHref = buildMailtoHref(payload);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(payload.body);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-strong/40 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`dev-ticket-title-${row.exception_id}`}
        aria-describedby={`dev-ticket-lead-${row.exception_id}`}
        dir="rtl"
        className="w-full max-w-lg rounded-md border border-border bg-bg shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div className="min-w-0">
            <h2
              id={`dev-ticket-title-${row.exception_id}`}
              className="text-base font-semibold text-fg-strong"
            >
              כרטיס טיפול
            </h2>
            <p
              id={`dev-ticket-lead-${row.exception_id}`}
              className="mt-0.5 text-xs text-fg-muted"
            >
              שלח לצוות הפיתוח את ID החסם
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded p-1 text-fg-muted hover:bg-bg-subtle hover:text-fg transition-colors"
            aria-label="סגור"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-auto px-4 py-3">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-fg-faint">מזהה חסם</dt>
            <dd className="font-mono text-fg break-all">{row.exception_id}</dd>

            <dt className="text-fg-faint">תת-סוג</dt>
            <dd className="text-fg">{row.category}</dd>

            <dt className="text-fg-faint">ישות מושפעת</dt>
            <dd className="text-fg">
              {row.display_name ?? "—"}{" "}
              <span className="text-fg-faint">({row.display_kind})</span>
            </dd>

            <dt className="text-fg-faint">הודעה</dt>
            <dd className="text-fg">{row.blocker_label}</dd>

            {row.demand_qty != null ? (
              <>
                <dt className="text-fg-faint">ביקוש חסום</dt>
                <dd className="font-mono tabular-nums text-fg">{row.demand_qty}</dd>
              </>
            ) : null}

            {row.earliest_shortage_at ? (
              <>
                <dt className="text-fg-faint">חוסר ראשון</dt>
                <dd className="font-mono tabular-nums text-fg">
                  {row.earliest_shortage_at}
                </dd>
              </>
            ) : null}

            <dt className="text-fg-faint">חומרה</dt>
            <dd className="text-fg">{row.severity}</dd>

            <dt className="text-fg-faint">נוצר בזמן</dt>
            <dd className="font-mono tabular-nums text-fg-muted">{row.emitted_at}</dd>

            <dt className="text-fg-faint">ריצת תכנון</dt>
            <dd className="font-mono text-fg-muted break-all">{row.run_id}</dd>

            <dt className="text-fg-faint">מסך מקור</dt>
            <dd className="text-fg">/planning/blockers</dd>
          </dl>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
          <div className="text-3xs text-fg-faint">
            {DEV_TEAM_EMAIL
              ? null
              : "ערוץ שליחה לצוות פיתוח לא הוגדר עדיין — השתמש בהעתקה."}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={cn(
                "btn btn-sm inline-flex items-center gap-1.5",
                copied
                  ? "bg-success-soft text-success-fg"
                  : "btn-primary",
              )}
              data-testid={`dev-ticket-copy-${row.exception_id}`}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {copied ? "הועתק" : "העתק לטיפול"}
            </button>
            {DEV_TEAM_EMAIL ? (
              <a
                href={mailtoHref}
                className="btn btn-sm btn-secondary inline-flex items-center gap-1.5"
                data-testid={`dev-ticket-mail-${row.exception_id}`}
              >
                <Mail className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                שלח דואר לצוות פיתוח
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
