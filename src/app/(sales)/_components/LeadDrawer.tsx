"use client";

// The lead, opened over the list rather than on a page of its own.
//
// Scan, open, act, close, next — a route change would break that rhythm and
// lose the reader's place in a 188-row table.

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { fmtDate, fmtDateTime, fmtPhone, toDateInputValue } from "../_lib/format";
import { LOST_REASONS, STATUS_LABELS, UI } from "../_lib/labels";
import { mailtoHref, telHref, waHref, fillTemplate, templateFor } from "../_lib/wa";
import type { LeadEventRow, SalesLeadRow, WhatsappTemplates } from "../_lib/types";
import { CustomerContext } from "./CustomerBadge";
import { EventTimeline } from "./EventTimeline";
import { SlaBadge } from "./SlaBadge";
import { StatusPill } from "./StatusPill";

export interface LeadDrawerProps {
  lead: SalesLeadRow;
  events: LeadEventRow[];
  eventsLoading: boolean;
  templates: WhatsappTemplates | null;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onStatus: (status: "working" | "lost", reason?: string) => void;
  onNote: (note: string) => void;
  onNextTouch: (at: string) => void;
  onAssign: (assignee: string) => void;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
        {label}
      </dt>
      <dd className="s-nums text-[13px]" style={{ color: "hsl(var(--s-fg))" }}>
        {value}
      </dd>
    </div>
  );
}

export function LeadDrawer({
  lead,
  events,
  eventsLoading,
  templates,
  busy = false,
  error = null,
  onClose,
  onStatus,
  onNote,
  onNextTouch,
  onAssign,
}: LeadDrawerProps) {
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState(lead.assignee ?? "");
  const [date, setDate] = useState(
    lead.next_touch_at ? toDateInputValue(new Date(lead.next_touch_at)) : toDateInputValue(new Date()),
  );
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, and Tab stays inside: the drawer covers the list behind a
  // backdrop, so focus escaping into unreachable rows would strand a keyboard
  // or screen-reader user. Same trap MobileNav uses for its drawer.
  useEffect(() => {
    const panel = panelRef.current;
    panel?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const name = lead.contact_name ?? lead.org_name;
  const wa = waHref(
    lead.phone_e164,
    templates
      ? fillTemplate(
          templateFor(templates, {
            isExistingCustomer: lead.is_existing_customer,
            alreadyTouched: Boolean(lead.first_touch_at),
          }),
          name,
        )
      : "",
  );
  const tel = telHref(lead.phone_e164);
  const mail = mailtoHref(lead.email);
  const won = lead.status === "won";

  return (
    <div
      className="fixed inset-0 z-40 flex justify-start"
      style={{ background: "hsl(220 15% 10% / 0.35)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={lead.org_name}
        dir="rtl"
        data-testid="lead-drawer"
        // Opens from the inline-end edge; in RTL that is the left of the screen.
        className="ms-auto flex h-full w-full max-w-md flex-col overflow-y-auto p-4"
        style={{ background: "hsl(var(--s-surface))" }}
      >
        <header className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
              {lead.org_name}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusPill status={lead.status} />
              <SlaBadge state={lead.sla_state} />
            </p>
          </div>
          <button
            type="button"
            aria-label={UI.close}
            data-testid="drawer-close"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full"
            style={{ color: "hsl(var(--s-fg-muted))" }}
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        {error ? (
          <p
            role="alert"
            data-testid="drawer-error"
            className="mt-3 rounded-[var(--s-radius-sm)] px-3 py-2 text-[13px]"
            style={{
              background: "hsl(var(--s-sla-overdue-soft))",
              color: "hsl(var(--s-sla-overdue))",
            }}
          >
            {error}
          </p>
        ) : null}

        {won ? (
          <div
            data-testid="won-banner"
            className="mt-3 rounded-[var(--s-radius-sm)] px-3 py-2"
            style={{ background: "hsl(var(--s-status-won-soft))" }}
          >
            <p className="text-[13px] font-medium" style={{ color: "hsl(var(--s-status-won))" }}>
              {UI.wonBanner(lead.converted_order_ref ?? "—")}
            </p>
            <p className="mt-0.5 text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
              {UI.wonBannerHint}
            </p>
          </div>
        ) : null}

        {/* contact */}
        <div className="mt-3 flex flex-wrap gap-2">
          {tel ? (
            <a href={tel} className="s-btn s-btn-primary flex-1">
              {UI.call}
            </a>
          ) : null}
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="s-btn s-btn-ghost flex-1">
              {UI.whatsapp}
            </a>
          ) : null}
          {mail ? (
            <a href={mail} className="s-btn s-btn-ghost">
              {UI.email}
            </a>
          ) : null}
        </div>

        {lead.is_existing_customer ? (
          <div className="mt-3">
            <CustomerContext
              snapshot={lead.shopify_snapshot}
              snapshotAt={lead.shopify_snapshot_at}
            />
          </div>
        ) : null}

        {/* details */}
        <section className="mt-4">
          <h3 className="s-eyebrow">{UI.detailsTitle}</h3>
          <dl className="mt-1">
            <Field label={UI.contactName} value={lead.contact_name ?? "—"} />
            <Field label={UI.colPhone} value={fmtPhone(lead.phone_e164)} />
            <Field label={UI.email} value={lead.email ?? "—"} />
            <Field label={UI.colCampaign} value={lead.campaign_name ?? lead.platform ?? "—"} />
            <Field label={UI.colAge} value={UI.ageDays(lead.age_days)} />
            <Field
              label={UI.colNextTouch}
              value={lead.next_touch_at ? fmtDate(lead.next_touch_at) : UI.noNextTouch}
            />
            {lead.first_touch_at ? (
              <Field label={UI.timelineTitle} value={fmtDateTime(lead.first_touch_at)} />
            ) : null}
            {lead.lost_reason ? (
              <Field label={UI.lostReasonLabel} value={lead.lost_reason} />
            ) : null}
          </dl>
        </section>

        {/* actions — absent entirely on a won lead: that status is evidence */}
        {won ? null : (
          <section className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {lead.status !== "working" ? (
                <button
                  type="button"
                  data-testid="drawer-set-working"
                  disabled={busy}
                  className="s-btn s-btn-ghost"
                  onClick={() => onStatus("working")}
                >
                  {STATUS_LABELS.working}
                </button>
              ) : null}
              <button
                type="button"
                data-testid="drawer-set-lost"
                disabled={busy}
                className="s-btn s-btn-danger-quiet"
                onClick={() => setLosing((v) => !v)}
                aria-expanded={losing}
              >
                {STATUS_LABELS.lost}
              </button>
            </div>

            {losing ? (
              <div className="flex flex-col gap-2">
                <label className="s-eyebrow" htmlFor="lost-reason-select">
                  {UI.lostReasonTitle}
                </label>
                <select
                  id="lost-reason-select"
                  className="s-input"
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                >
                  <option value="">—</option>
                  {LOST_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="drawer-lost-confirm"
                  disabled={busy || !lostReason}
                  className="s-btn s-btn-danger-quiet"
                  onClick={() => onStatus("lost", lostReason)}
                >
                  {UI.save}
                </button>
              </div>
            ) : null}

            <div className="flex flex-col gap-1">
              <label className="s-eyebrow" htmlFor="drawer-note">
                {UI.addNote}
              </label>
              <textarea
                id="drawer-note"
                className="s-input"
                rows={2}
                placeholder={UI.notePlaceholder}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                type="button"
                data-testid="drawer-note-save"
                disabled={busy || !note.trim()}
                className="s-btn s-btn-ghost"
                onClick={() => {
                  onNote(note.trim());
                  setNote("");
                }}
              >
                {UI.save}
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="s-eyebrow" htmlFor="drawer-next-touch">
                {UI.colNextTouch}
              </label>
              <input
                id="drawer-next-touch"
                type="date"
                className="s-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <button
                type="button"
                data-testid="drawer-next-touch-save"
                disabled={busy || !date}
                className="s-btn s-btn-ghost"
                onClick={() => onNextTouch(new Date(`${date}T09:00:00`).toISOString())}
              >
                {UI.save}
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="s-eyebrow" htmlFor="drawer-assignee">
                {UI.assigneeLabel}
              </label>
              <input
                id="drawer-assignee"
                className="s-input"
                inputMode="email"
                placeholder={UI.assigneePlaceholder}
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              />
              <button
                type="button"
                data-testid="drawer-assign-save"
                disabled={busy}
                className="s-btn s-btn-ghost"
                onClick={() => onAssign(assignee.trim())}
              >
                {UI.save}
              </button>
            </div>
          </section>
        )}

        <section className="mt-5">
          <h3 className="s-eyebrow">{UI.timelineTitle}</h3>
          <div className="mt-2">
            {eventsLoading ? (
              <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
                {UI.loading}
              </p>
            ) : (
              <EventTimeline events={events} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
