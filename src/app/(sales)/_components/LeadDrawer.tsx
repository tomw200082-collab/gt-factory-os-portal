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
import { useReturnFocus } from "../_lib/useReturnFocus";

export interface LeadDrawerProps {
  lead: SalesLeadRow;
  events: LeadEventRow[];
  eventsLoading: boolean;
  templates: WhatsappTemplates | null;
  /** Per-action, not one shared flag: saving a note must not freeze the date. */
  savingNote?: boolean;
  savingNextTouch?: boolean;
  savingAssignee?: boolean;
  savingStatus?: boolean;
  error?: string | null;
  onClose: () => void;
  /** The third argument exists because 0324 will not move a lead to working
   *  without a next touch — status and date travel together or not at all. */
  onStatus: (
    status: "working" | "lost",
    reason?: string | null,
    nextTouchAt?: string | null,
  ) => void;
  /** The admin-editable list (0326); falls back to the shipped constant. */
  lostReasons?: string[];
  /** `done` runs only once the write lands, so a failed save keeps the text. */
  onNote: (note: string, done: () => void) => void;
  onNextTouch: (at: string) => void;
  onAssign: (assignee: string) => void;
  /**
   * Recording an outreach intent, the same way a Today card does. Without it a
   * call placed from here leaves no trace in the timeline and never raises the
   * outcome sheet — the loop the product is built on would close on one surface
   * and silently not on the other.
   */
  onArm?: (leadId: string, channel: "call" | "whatsapp") => void;
}

/**
 * A label/value row. `isolate` bidi-isolates the value for the Latin-and-digit
 * ones (phone, email, order ref): inside an RTL paragraph their punctuation
 * otherwise resolves to the paragraph direction and renders on the wrong side.
 */
function Field({ label, value, isolate }: { label: string; value: string; isolate?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
        {label}
      </dt>
      <dd className="s-nums text-[13px]" style={{ color: "hsl(var(--s-fg))" }}>
        {isolate ? <bdi dir="ltr">{value}</bdi> : value}
      </dd>
    </div>
  );
}

export function LeadDrawer({
  lead,
  events,
  eventsLoading,
  templates,
  savingNote = false,
  savingNextTouch = false,
  savingAssignee = false,
  savingStatus = false,
  error = null,
  onClose,
  onStatus,
  lostReasons,
  onNote,
  onNextTouch,
  onAssign,
  onArm,
}: LeadDrawerProps) {
  useReturnFocus();
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState(lead.assignee ?? "");
  const [date, setDate] = useState(
    lead.next_touch_at ? toDateInputValue(new Date(lead.next_touch_at)) : toDateInputValue(new Date()),
  );
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  // 0324 refuses to move a lead to working without a next touch, so the button
  // collects one instead of failing after the tap.
  const [working, setWorking] = useState(false);
  const [workingDate, setWorkingDate] = useState(toDateInputValue(new Date()));

  const reasons = lostReasons?.length ? lostReasons : LOST_REASONS;
  // Positional, not a literal: the list is Tom's to rename (0326), and keying
  // free text off the string "אחר" would break silently the day he does.
  const freeTextReason = reasons[reasons.length - 1];
  const chosenLostReason = lostReason === freeTextReason ? otherReason.trim() : lostReason;

  // What Escape and the backdrop would throw away.
  const dirty = note.trim().length > 0 || assignee !== (lead.assignee ?? "");
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, and Tab stays inside: the drawer covers the list behind a
  // backdrop, so focus escaping into unreachable rows would strand a keyboard
  // or screen-reader user. Same trap MobileNav uses for its drawer.
  useEffect(() => {
    const panel = panelRef.current;
    panel?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Typed text is work. Closing over it without asking is the same class
        // of loss as a dropped save, and it happened on a key nobody aims for.
        if (dirty && !window.confirm(UI.discardChanges)) return;
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
  }, [onClose, dirty]);

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
      style={{ background: "hsl(var(--s-overlay))" }}
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
              {UI.wonBannerPrefix} <bdi dir="ltr">{lead.converted_order_ref ?? "—"}</bdi>
            </p>
            <p className="mt-0.5 text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
              {UI.wonBannerHint}
            </p>
          </div>
        ) : null}

        {/* contact */}
        <div className="mt-3 flex flex-wrap gap-2">
          {tel ? (
            <a
              href={tel}
              data-testid="drawer-call"
              className="s-btn s-btn-primary flex-1"
              onClick={() => onArm?.(lead.id, "call")}
            >
              {UI.call}
            </a>
          ) : null}
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="drawer-whatsapp"
              className="s-btn s-btn-ghost flex-1"
              onClick={() => onArm?.(lead.id, "whatsapp")}
            >
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
            <Field label={UI.colPhone} value={fmtPhone(lead.phone_e164)} isolate />
            <Field label={UI.email} value={lead.email ?? "—"} isolate />
            <Field label={UI.colCampaign} value={lead.campaign_name ?? lead.platform ?? "—"} />
            <Field label={UI.colAge} value={UI.ageDays(lead.age_days)} />
            <Field
              label={UI.colNextTouch}
              value={lead.next_touch_at ? fmtDate(lead.next_touch_at) : UI.notSet}
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
                  disabled={savingStatus}
                  className="s-btn s-btn-ghost"
                  aria-expanded={working}
                  onClick={() => {
                    // Already carrying a date? Then the move is a single tap and
                    // the database is satisfied. Otherwise ask, because this is
                    // the path that used to drop leads out of every queue with
                    // no reminder at all (audit P0-3).
                    if (lead.next_touch_at) onStatus("working");
                    else setWorking((v) => !v);
                  }}
                >
                  {STATUS_LABELS.working}
                </button>
              ) : null}
              <button
                type="button"
                data-testid="drawer-set-lost"
                disabled={savingStatus}
                className="s-btn s-btn-danger-quiet"
                onClick={() => setLosing((v) => !v)}
                aria-expanded={losing}
              >
                {STATUS_LABELS.lost}
              </button>
            </div>

            {working && !lead.next_touch_at ? (
              <div className="flex flex-col gap-2">
                <label className="s-eyebrow" htmlFor="drawer-working-date">
                  {UI.workingNeedsDate}
                </label>
                <input
                  id="drawer-working-date"
                  type="date"
                  className="s-input"
                  value={workingDate}
                  onChange={(e) => setWorkingDate(e.target.value)}
                />
                <button
                  type="button"
                  data-testid="drawer-working-confirm"
                  disabled={savingStatus || !workingDate}
                  className="s-btn s-btn-ghost"
                  onClick={() =>
                    onStatus("working", null, new Date(`${workingDate}T09:00:00`).toISOString())
                  }
                >
                  {UI.saveDate}
                </button>
              </div>
            ) : null}

            {losing ? (
              // The same control the outcome sheet uses, including the free-text
              // branch it always had and this surface did not: choosing the last
              // reason here used to store the word itself as the reason, which is
              // exactly the "a lost lead with no reason teaches nothing" failure
              // the schema exists to prevent (audit P1-6).
              <div className="flex flex-col gap-2">
                <p className="s-eyebrow">{UI.lostReasonTitle}</p>
                <div
                  role="radiogroup"
                  aria-label={UI.lostReasonGroupLabel}
                  className="flex flex-col gap-2"
                >
                  {reasons.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      data-testid={`drawer-lost-reason-${r}`}
                      disabled={savingStatus}
                      aria-checked={lostReason === r}
                      className={`s-btn s-btn-ghost min-h-[48px] ${lostReason === r ? "s-tab-active" : ""}`}
                      onClick={() => setLostReason(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                {lostReason === freeTextReason ? (
                  <input
                    className="s-input"
                    aria-label={UI.lostReasonOtherLabel}
                    placeholder={UI.lostReasonOther}
                    value={otherReason}
                    onChange={(e) => setOtherReason(e.target.value)}
                  />
                ) : null}
                <button
                  type="button"
                  data-testid="drawer-lost-confirm"
                  disabled={savingStatus || !chosenLostReason}
                  className="s-btn s-btn-danger-quiet"
                  onClick={() => onStatus("lost", chosenLostReason)}
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
                disabled={savingNote || !note.trim()}
                className="s-btn s-btn-ghost"
                // Clears only once the write lands. Clearing on click looks
                // tidier but throws the text away on a failed save, and the
                // person retyping it is standing in a factory on one bar of
                // signal.
                onClick={() => onNote(note.trim(), () => setNote(""))}
              >
                {UI.saveNote}
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
                // Same floor the outcome sheet enforces: a next touch in the
                // past lands the lead straight back in the queue as overdue
                // work that was already done.
                min={toDateInputValue(new Date())}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <button
                type="button"
                data-testid="drawer-next-touch-save"
                disabled={savingNextTouch || !date}
                className="s-btn s-btn-ghost"
                onClick={() => onNextTouch(new Date(`${date}T09:00:00`).toISOString())}
              >
                {UI.saveDate}
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
                // Nothing typed, nothing to save — otherwise an idle tap writes
                // the value back to itself and reports success.
                disabled={savingAssignee || assignee.trim() === (lead.assignee ?? "")}
                className="s-btn s-btn-ghost"
                onClick={() => onAssign(assignee.trim())}
              >
                {UI.saveAssignee}
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
