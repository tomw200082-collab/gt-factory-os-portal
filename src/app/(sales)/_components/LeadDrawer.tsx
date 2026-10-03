"use client";

// The lead, opened over the list rather than on a page of its own.
//
// Scan, open, act, close, next — a route change would break that rhythm and
// lose the reader's place in a 188-row table.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Mail, Phone, X } from "lucide-react";
import { fmtDate, fmtDateTime, fmtPhone } from "../_lib/format";
import { LOST_REASONS, STATUS_LABELS, UI } from "../_lib/labels";
import { mailtoHref, telHref } from "../_lib/wa";
import type { AssigneeEntry, LeadEventRow, SalesLeadRow, SalesSettings, WhatsappTemplates } from "../_lib/types";
import { AutoSentLine } from "./AutoSentLine";
import { WhatsAppQuick } from "./WhatsAppQuick";
import { AssigneePicker } from "./AssigneePicker";
import { CustomerContext } from "./CustomerBadge";
import { EventTimeline } from "./EventTimeline";
import { LeadJourneyRail } from "./LeadJourneyRail";
import { MiniRail } from "./MiniRail";
import { SlaBadge } from "./SlaBadge";
import { StatusPill } from "./StatusPill";
import { useReturnFocus } from "../_lib/useReturnFocus";
import { atLeastSchedulable, israelDate, israelFirstSchedulableDate, israelNineAM } from "../_lib/israelTime";

export interface LeadDrawerProps {
  lead: SalesLeadRow;
  canEdit?: boolean;
  canAssign?: boolean;
  suspended?: boolean;
  events: LeadEventRow[];
  eventsLoading: boolean;
  /** Legacy: the old three templates. The WhatsApp button reads `settings` (D-042). */
  templates?: WhatsappTemplates | null;
  /** The quick messages, the sender's signer, and the old templates as a fallback. */
  settings?: SalesSettings | null;
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
  /** The date travels with the assignment: a lead handed over without one
   *  lands in a name but in nobody's queue (audit P1-2). */
  onAssign: (assignee: string, nextTouchAt?: string | null) => void;
  /** The curated roster (0325). Free text is gone — it assigned leads to
   *  ghosts and no screen ever said so. */
  roster?: AssigneeEntry[];
  /**
   * Recording an outreach intent, the same way a Today card does. Without it a
   * call placed from here leaves no trace in the timeline and never raises the
   * outcome sheet — the loop the product is built on would close on one surface
   * and silently not on the other.
   */
  onArm?: (leadId: string, channel: "call" | "whatsapp" | "email") => void;
}

/**
 * A label/value row. `isolate` bidi-isolates the value for the Latin-and-digit
 * ones (phone, email, order ref): inside an RTL paragraph their punctuation
 * otherwise resolves to the paragraph direction and renders on the wrong side.
 */
function Field({ label, value, isolate }: { label: string; value: string; isolate?: boolean }) {
  return (
    // Two columns where the value may wrap: a long email or campaign name used
    // to push the whole drawer sideways on a phone.
    <div className="s-field grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
        {label}
      </dt>
      <dd className="s-nums min-w-0 text-end text-[13px] [overflow-wrap:anywhere]" style={{ color: "hsl(var(--s-fg))" }}>
        {isolate ? <bdi dir="ltr">{value}</bdi> : value}
      </dd>
    </div>
  );
}

export function LeadDrawer({
  lead,
  canEdit = true,
  canAssign = true,
  suspended = false,
  events,
  eventsLoading,
  settings = null,
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
  roster = [],
  onArm,
}: LeadDrawerProps) {
  useReturnFocus();
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState<string | null>(lead.assignee);
  // Every date here saves at 09:00 Israel, so none may start or land before
  // the first date whose 09:00 is still ahead (review 2026-10-01).
  const scheduleFloor = israelFirstSchedulableDate();
  const startDate = atLeastSchedulable(
    lead.next_touch_at ? israelDate(new Date(lead.next_touch_at)) : scheduleFloor,
  );
  const [assignDate, setAssignDate] = useState(startDate);
  const [date, setDate] = useState(startDate);
  const [losing, setLosing] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  // 0324 refuses to move a lead to working without a next touch, so the button
  // collects one instead of failing after the tap.
  const [working, setWorking] = useState(false);
  const [workingDate, setWorkingDate] = useState(scheduleFloor);

  const reasons = lostReasons?.length ? lostReasons : LOST_REASONS;
  // Positional, not a literal: the list is Tom's to rename (0326), and keying
  // free text off the string "אחר" would break silently the day he does.
  const freeTextReason = reasons[reasons.length - 1];
  const chosenLostReason = lostReason === freeTextReason ? otherReason.trim() : lostReason;

  // What Escape and the backdrop would throw away.
  const dirty = note.trim().length > 0 || (assignee ?? "") !== (lead.assignee ?? "");
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.parentElement?.toggleAttribute("inert", suspended);
  }, [suspended]);

  // Escape closes, and Tab stays inside: the drawer covers the list behind a
  // backdrop, so focus escaping into unreachable rows would strand a keyboard
  // or screen-reader user. Same trap MobileNav uses for its drawer.
  useEffect(() => {
    const panel = panelRef.current;
    if (!suspended) panel?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (suspended) return;
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
  }, [onClose, dirty, suspended]);

  const [noteSaved, setNoteSaved] = useState(false);
  useEffect(() => {
    if (!noteSaved) return;
    const timer = setTimeout(() => setNoteSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [noteSaved]);
  const tel = telHref(lead.phone_e164);
  const mail = mailtoHref(lead.email);
  const won = lead.status === "won";

  return (
    <div
      className="fixed inset-0 z-40 flex justify-start"
      aria-hidden={suspended || undefined}
      style={{ background: "hsl(var(--s-overlay))" }}
      onClick={(e) => {
        if (suspended || e.target !== e.currentTarget) return;
        // Escape asks before discarding an unsaved note; the backdrop did not,
        // so the same keystroke-equivalent gesture threw away typed work
        // depending only on how the drawer was dismissed (gate P1).
        if (dirty && !window.confirm(UI.discardChanges)) return;
        onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal={!suspended}
        aria-label={lead.org_name}
        dir="rtl"
        data-testid="lead-drawer"
        // Opens from the inline-end edge; in RTL that is the left of the screen.
        className="s-drawer-panel ms-auto flex h-full w-full max-w-md flex-col overflow-y-auto overflow-x-hidden p-3"
        style={{ background: "hsl(var(--s-bg))" }}
      >
        {/* GT Pulse D1: the lead opens on petrol, with where it stands. */}
        <header className="s-opening flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 break-words text-xl font-semibold leading-tight" style={{ color: "hsl(var(--s-fg))" }}>
              {lead.org_name}
            </h2>
            {lead.contact_name ? (
              <p className="mt-1 truncate text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{lead.contact_name}</p>
            ) : null}
            <p className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusPill status={lead.status} />
              <SlaBadge state={lead.sla_state} />
            </p>
            <MiniRail row={lead} />
            {/* Unit B: the business behind the lead, its orders and its people. */}
            <Link href={`/sales/orgs/${encodeURIComponent(lead.org_id)}`} className="s-org-back mt-2" data-testid="drawer-open-business">
              <Building2 size={15} aria-hidden />
              {UI.openBusiness}
            </Link>
          </div>
          <button
            type="button"
            aria-label={UI.close}
            data-testid="drawer-close"
            onClick={onClose}
            className="s-glass-btn grid h-11 w-11 shrink-0 place-items-center rounded-full"
            style={{ color: "hsl(var(--s-fg))" }}
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
        {!canEdit && !won ? <p className="mt-3 text-sm" role="status">הליד אינו משויך אליך. מנהל יכול לשייך אותו לפני יצירת קשר.</p> : null}
        {canEdit ? <div className="mt-3 flex flex-wrap items-start gap-2">
          {tel ? (
            <a
              href={tel}
              data-testid="drawer-call"
              className="s-btn s-btn-primary flex-1"
              onClick={() => onArm?.(lead.id, "call")}
            >
              <Phone size={16} aria-hidden />
              {UI.call}
            </a>
          ) : null}
          {/* D-042: the message for the lead's situation, signed by the sender;
              disabled, with the reason, for a lead who opted out. */}
          <WhatsAppQuick
            leadId={lead.id}
            phone={lead.phone_e164}
            lead={lead}
            settings={settings}
            onArm={onArm}
            testId="drawer-whatsapp"
          />
          {mail ? (
            <a href={mail} className="s-btn s-btn-ghost" onClick={() => onArm?.(lead.id, "email")}>
              <Mail size={16} aria-hidden />
              {UI.email}
            </a>
          ) : null}
        </div> : null}

        {/* D-042: what the lead line already sent, before the rep writes. */}
        <AutoSentLine conversation={lead.conversation} />

        {lead.is_existing_customer ? (
          <div className="mt-3">
            <CustomerContext
              snapshot={lead.shopify_snapshot}
              snapshotAt={lead.shopify_snapshot_at}
            />
          </div>
        ) : null}


        {/* actions — absent entirely on a won lead: that status is evidence */}
        {won || !canEdit ? null : (
          <section className="s-panel mt-4 flex flex-col gap-3">
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
                  min={scheduleFloor}
                  value={workingDate}
                  onChange={(e) => setWorkingDate(atLeastSchedulable(e.target.value))}
                />
                <button
                  type="button"
                  data-testid="drawer-working-confirm"
                  aria-busy={savingStatus || undefined}
                  disabled={savingStatus || !workingDate}
                  className="s-btn s-btn-ghost"
                  onClick={() =>
                    onStatus("working", null, israelNineAM(workingDate))
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
                  {reasons.map((r, i) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      data-testid={`drawer-lost-reason-${r}`}
                      disabled={savingStatus}
                      aria-checked={lostReason === r}
                      // Same roving pattern as the outcome sheet: one tab stop,
                      // arrows between the options.
                      tabIndex={lostReason === r || (!lostReason && i === 0) ? 0 : -1}
                      onKeyDown={(e) => {
                        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                        e.preventDefault();
                        const step = e.key === "ArrowDown" ? 1 : -1;
                        const next = reasons[(i + step + reasons.length) % reasons.length];
                        setLostReason(next);
                        document
                          .querySelector<HTMLElement>(`[data-testid="drawer-lost-reason-${next}"]`)
                          ?.focus();
                      }}
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
                  aria-busy={savingStatus || undefined}
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
                aria-describedby={note.trim() ? undefined : "drawer-note-hint"}
                  aria-busy={savingNote || undefined}
                disabled={savingNote || !note.trim()}
                className="s-btn s-btn-ghost"
                // Clears only once the write lands. Clearing on click looks
                // tidier but throws the text away on a failed save, and the
                // person retyping it is standing in a factory on one bar of
                // signal.
                onClick={() => onNote(note.trim(), () => {
                  setNote("");
                  setNoteSaved(true);
                })}
              >
                {UI.saveNote}
              </button>
              {/* Why Save is unavailable, said once, quietly (UX gate INTER-187-005). */}
              {!note.trim() && !noteSaved ? (
                <p id="drawer-note-hint" className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
                  {UI.noteNeeded}
                </p>
              ) : null}
              {/* The write landed: say so, briefly (UX gate FLOW-003). */}
              <p role="status" className="s-saved text-[13px]" data-testid="drawer-note-saved">
                {noteSaved ? UI.noteSaved : ""}
              </p>
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
                min={scheduleFloor}
                value={date}
                onChange={(e) => setDate(atLeastSchedulable(e.target.value))}
              />
              <button
                type="button"
                data-testid="drawer-next-touch-save"
                  aria-busy={savingNextTouch || undefined}
                disabled={savingNextTouch || !date}
                className="s-btn s-btn-ghost"
                onClick={() => onNextTouch(israelNineAM(date))}
              >
                {UI.saveDate}
              </button>
            </div>

            {canAssign ? <div className="flex flex-col gap-1">
              <label className="s-eyebrow" htmlFor="drawer-assignee">
                {UI.assigneeLabel}
              </label>
              <AssigneePicker
                id="drawer-assignee"
                value={assignee}
                roster={roster}
                allowUnassign
                disabled={savingAssignee}
                onChange={setAssignee}
              />
              {/* Handing the lead to somebody asks when it is due back;
                  returning it to the pool does not. */}
              {assignee ? (
                <>
                  <label className="s-eyebrow" htmlFor="drawer-assign-date">
                    {UI.assignNeedsDate}
                  </label>
                  <input
                    id="drawer-assign-date"
                    type="date"
                    className="s-input"
                    min={scheduleFloor}
                    value={assignDate}
                    onChange={(e) => setAssignDate(atLeastSchedulable(e.target.value))}
                  />
                </>
              ) : null}
              <button
                type="button"
                data-testid="drawer-assign-save"
                  aria-busy={savingAssignee || undefined}
                // Nothing changed, nothing to save — otherwise an idle tap
                // writes the value back to itself and reports success.
                disabled={
                  savingAssignee ||
                  (assignee ?? "") === (lead.assignee ?? "") ||
                  (Boolean(assignee) && !assignDate)
                }
                className="s-btn s-btn-ghost"
                onClick={() =>
                  onAssign(
                    assignee ?? "",
                    assignee ? israelNineAM(assignDate) : null,
                  )
                }
              >
                {UI.saveAssignee}
              </button>
            </div> : null}
          </section>
        )}

        {/* details — reference, so below what a rep does mid-call (UX gate FLOW-002) */}
        <section className="s-panel mt-4">
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

        {!eventsLoading ? <LeadJourneyRail events={events} /> : null}

        <section className="s-panel mt-4">
          <h3 className="s-eyebrow">{UI.timelineTitle}</h3>
          {/* Opening the drawer mid-call to check when you last spoke should
              not require tabbing around to discover the timeline arrived. */}
          <span className="sr-only" role="status" aria-live="polite">
            {eventsLoading ? "" : UI.eventsLoaded(events.length)}
          </span>
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
