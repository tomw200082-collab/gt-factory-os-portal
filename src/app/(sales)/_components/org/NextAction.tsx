"use client";

// What should happen next with this business, when, and why. Real task or
// promise state only; the action opens the lead in the Unit A flow, where the
// call, the message and the outcome are recorded.

import Link from "next/link";
import { AlarmClock, ArrowLeft, CalendarCheck2 } from "lucide-react";
import { fmtDateTime, fmtRelative } from "../../_lib/format";
import { UI } from "../../_lib/labels";
import type { NextAction as NextActionValue } from "../../_lib/nextAction";
import { PanelError } from "../EmptyStates";

export function NextAction({ action, loading, error = false, onRetry }: { action: NextActionValue | null; loading: boolean; error?: boolean; onRetry?: () => void }) {
  return (
    <section data-testid="next-action" aria-labelledby="org-next-title" className="s-panel s-org-block" data-overdue={action?.overdue || undefined}>
      <h2 id="org-next-title" className="s-section-heading flex items-center gap-2">
        <CalendarCheck2 size={16} aria-hidden />
        {UI.nextActionTitle}
      </h2>

      {loading ? (
        <div className="mt-3 h-16 animate-pulse rounded-[var(--s-radius)]" aria-busy="true" style={{ background: "hsl(var(--s-surface-sunken))" }}>
          <span className="sr-only">{UI.loading}</span>
        </div>
      ) : error ? (
        <PanelError what={UI.panelWhatNext} onRetry={() => onRetry?.()} />
      ) : action ? (
        <div className="mt-2 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-[17px] font-semibold leading-snug [overflow-wrap:anywhere]" style={{ color: "hsl(var(--s-fg))" }}>
              {action.source === "touch" ? UI.nextActionTouch(action.title) : action.title}
            </p>
            <p className="s-nums flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
              <time dateTime={action.dueAt}>
                {fmtDateTime(action.dueAt)} · {fmtRelative(action.dueAt)}
              </time>
              {action.overdue ? (
                <span className="s-badge s-badge-sla-overdue">
                  <AlarmClock size={13} aria-hidden />
                  {UI.nextActionOverdue}
                </span>
              ) : null}
            </p>
            <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
              {action.source === "touch" ? UI.nextActionTouchWhy : action.why}
              {action.source === "task" && action.leadName ? ` · ${UI.forLead(action.leadName)}` : null}
            </p>
          </div>
          <Link
            href={action.leadId ? `/sales/leads?lead=${encodeURIComponent(action.leadId)}` : "/sales/today"}
            className="s-btn s-btn-primary self-start"
          >
            {action.leadId ? UI.nextActionOpenLead : UI.nextActionOpenToday}
            <ArrowLeft size={18} aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-[15px] font-medium" style={{ color: "hsl(var(--s-fg))" }}>{UI.nextActionNone}</p>
          <p className="mt-1 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.nextActionNoneHint}</p>
        </div>
      )}
    </section>
  );
}
