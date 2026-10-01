"use client";

// The full table: every lead GT has ever received, in one place.

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useAddNote,
  useAssign,
  useLeadEvents,
  useBulkAssign,
  useLeads,
  useConvert,
  useOutcome,
  useRecordActivity,
  useOutreach,
  useSetNextTouch,
  useSetStatus,
  useSettings,
} from "../../_lib/api";
import { useOutcomeCapture } from "../../_lib/useOutcomeCapture";
import { clearActivityDraft } from "../../_lib/activityDraft";
import { useSession } from "@/lib/auth/session-provider";
import { matchesQuery } from "../../_lib/format";
import { STATUS_LABELS, UI } from "../../_lib/labels";
import type { LeadStatus, UndoTarget } from "../../_lib/types";
import { ListEmpty, QueueError, QueueLoading } from "../../_components/EmptyStates";
import { LeadsTable } from "../../_components/LeadsTable";
import { LeadDrawer } from "../../_components/LeadDrawer";
import { assigneeName } from "../../_components/AssigneePicker";
import { BulkBar } from "../../_components/BulkBar";
import { OutcomeSheet, nextBusinessTouchPreview } from "../../_components/OutcomeSheet";
import { Toast } from "../../_components/Toast";

const TABS: LeadStatus[] = ["new", "working", "won", "lost"];

function LeadsScreen() {
  const { session } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const leads = useLeads();
  const settings = useSettings();

  const [tab, setTab] = useState<LeadStatus>("new");
  const [query, setQuery] = useState("");
  // 39 of the imported leads carry neither phone nor email. They left the Today
  // queue in 0326 because no outcome could ever clear them — but they are real
  // history, so they stay here behind a chip that makes them findable and
  // fixable rather than silently dropped (audit P0-1, decision gate D2).
  const [uncontactableOnly, setUncontactableOnly] = useState(false);
  const [unownedOnly, setUnownedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(params?.get("lead") ?? null);
  const requestedLeadId = params?.get("lead") ?? null;
  useEffect(() => setOpenId(requestedLeadId), [requestedLeadId]);
  function closeLead() {
    setOpenId(null);
    if (requestedLeadId) {
      const next = new URLSearchParams(params?.toString() ?? "");
      next.delete("lead");
      next.delete("event");
      router.replace(`/sales/leads${next.size ? `?${next}` : ""}`, { scroll: false });
    }
  }

  const rows = useMemo(() => leads.data ?? [], [leads.data]);
  const counts = useMemo(() => {
    const out: Record<LeadStatus, number> = { new: 0, working: 0, won: 0, lost: 0 };
    for (const row of rows) out[row.status] += 1;
    return out;
  }, [rows]);

  const uncontactableCount = useMemo(
    () => rows.filter((r) => r.uncontactable).length,
    [rows],
  );
  const unownedCount = useMemo(
    () => rows.filter((r) => !r.assignee && (r.status === "new" || r.status === "working")).length,
    [rows],
  );
  const roster = useMemo(() => settings.data?.assignees ?? [], [settings.data]);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.status === tab &&
          matchesQuery(r, query) &&
          (!uncontactableOnly || r.uncontactable) &&
          (!unownedOnly || !r.assignee),
      ),
    [rows, tab, query, uncontactableOnly, unownedOnly],
  );

  const openLead = rows.find((r) => r.id === openId) ?? null;
  const isRep = session?.role === "sales_rep";
  const canEditOpenLead = !isRep || openLead?.assignee === session?.email;
  const events = useLeadEvents(openId);
  const sourceEventId = params?.get("event");
  useEffect(() => {
    if (!openId || !sourceEventId || events.isLoading) return;
    const source = document.getElementById(`lead-event-${sourceEventId}`);
    source?.scrollIntoView({ block: "nearest", behavior: "instant" });
    source?.focus();
  }, [openId, sourceEventId, events.isLoading, events.data]);

  const setStatus = useSetStatus(openId ?? "");
  const addNote = useAddNote(openId ?? "");
  const setNextTouch = useSetNextTouch(openId ?? "");
  const assign = useAssign(openId ?? "");

  // Arming from the drawer writes the same outreach event a Today card writes
  // and leaves the same owed intent — and now raises the same sheet here. It
  // used to be raised only on Today, so a call placed from this table came back
  // to a screen that asked nothing and an intent that Today then discarded: the
  // conversation was never logged and nothing said so (audit P0-4).
  const outreach = useOutreach();
  const bulkAssign = useBulkAssign();
  const capture = useOutcomeCapture(session?.email);
  const [toast, setToast] = useState<string | null>(null);
  // The lead a just-recorded "אבוד" can be taken back from, for as long as its
  // toast is on screen — the same affordance the Today card has had since audit
  // P1-9. This screen sets 'lost' by two doors of its own (the drawer's status
  // control and the outcome sheet raised by a call placed from this table) and
  // neither could be undone: the recovery was to find the lead, reopen the
  // drawer and set the status back by hand.
  const [undo, setUndo] = useState<UndoTarget | null>(null);
  // Bound to the undo target rather than to openId: the drawer may well be
  // closed by the time the reversal is tapped, and the lead it is about is not
  // necessarily the one still open.
  const undoStatus = useSetStatus(undo?.leadId ?? "");

  const pendingRow = useMemo(
    () => rows.find((r) => r.id === capture.pending?.leadId) ?? null,
    [rows, capture.pending],
  );
  // An answered lead leaves the list, and the sheet asking about it is still
  // open. Without this the heading empties mid-interaction and the question
  // becomes "what happened?" about nothing.
  const lastLeadName = useRef<string | null>(null);
  useEffect(() => {
    if (pendingRow) lastLeadName.current = pendingRow.contact_name ?? pendingRow.org_name;
  }, [pendingRow]);
  const outcome = useOutcome(capture.pending?.leadId ?? "");
  const activity = useRecordActivity(capture.pending?.leadId ?? "");
  const convert = useConvert(capture.pending?.leadId ?? "");
  // convert_lead answers 200 {converted:false} when the lead is no longer open.
  // That is not an HTTP error and carries no error.message, so it needs its own
  // channel — otherwise a close that did nothing reads as a close that worked.
  const [convertNote, setConvertNote] = useState<string | null>(null);
  const answerSheetOpen = Boolean(capture.pending && (pendingRow || activity.isPending || outcome.isPending));
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bodyRef.current?.toggleAttribute("inert", answerSheetOpen); }, [answerSheetOpen]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => {
      setToast(null);
      setUndo(null);
    }, 4500);
    return () => clearTimeout(id);
  }, [toast]);

  // Selection belongs to the rows on screen — and the invariant is exactly
  // that, not "clear it when the tab changes". Clearing on the tab and the two
  // chips left the search open: select eight leads, type a query that narrows
  // the list to three, press שייך, and five leads nobody is looking at move.
  // Same defect, a different door (gate P0, INTER-001).
  //
  // So the effect prunes rather than clears. Anything that changes the visible
  // set — tab, chip, query, or the rows themselves arriving — drops whatever
  // left the screen and keeps what is still on it, which also means refining a
  // search no longer throws away a selection the person is still building.
  // Returning `prev` unchanged is load-bearing: a fresh Set every run would
  // re-trigger this effect forever.
  const visibleIds = useMemo(() => visible.map((r) => r.id), [visible]);
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const shown = new Set(visibleIds);
      const kept = [...prev].filter((id) => shown.has(id));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [visibleIds]);

  const error =
    setStatus.error?.message ??
    addNote.error?.message ??
    setNextTouch.error?.message ??
    assign.error?.message ??
    null;

  /**
   * One setter for both, because they are one thing.
   *
   * `undo` used to be sibling state that no toast owned. The 4.5s timer cleared
   * the message and left the target behind, and any toast raised afterwards
   * inherited it — a button labelled "בטל", next to a message about lead B,
   * that wrote status='working' to lead A. Routing every toast through here
   * means raising one always replaces the way back, or removes it.
   */
  function showToast(message: string, undoTarget: UndoTarget | null = null) {
    setToast(message);
    setUndo(undoTarget);
  }

  /** Every drawer write says so — silence reads the same as a dropped save. */
  const saved = { onSuccess: () => showToast(UI.saved) };

  return (
    <div className="flex flex-col gap-4">
      <div ref={bodyRef} data-testid="leads-body" aria-hidden={answerSheetOpen || undefined}>
      {/* D1 corridor: every screen opens on petrol, with its own controls. */}
      <header className="s-opening s-opening-compact flex flex-col gap-3">
        <h1 className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
          {UI.leadsTitle}
        </h1>

        <input
          type="search"
          className="s-input"
          placeholder={UI.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={UI.search}
          data-testid="leads-search"
        />

        <div role="tablist" aria-label={UI.statusLabel} className="flex flex-wrap gap-1">
          {TABS.map((status) => (
            <button
              key={status}
              role="tab"
              type="button"
              id={`leads-tab-${status}`}
              aria-selected={tab === status}
              aria-controls="leads-panel"
              // Only the selected tab stays in the tab order; the arrow keys
              // move between them, which is what the tab pattern promises.
              tabIndex={tab === status ? 0 : -1}
              data-testid={`leads-tab-${status}`}
              className={`s-tab ${tab === status ? "s-tab-active" : ""}`}
              onClick={() => setTab(status)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                // RTL: ArrowLeft advances, ArrowRight goes back.
                const step = e.key === "ArrowLeft" ? 1 : -1;
                const next = TABS[(TABS.indexOf(status) + step + TABS.length) % TABS.length];
                setTab(next);
                document.getElementById(`leads-tab-${next}`)?.focus();
              }}
            >
              {STATUS_LABELS[status]}
              {/* A count only exists once the data does. Rendering "0" for
                  every status while the table loads states four facts that
                  are not yet known, then silently corrects them. */}
              {leads.isSuccess ? (
                <span className="s-nums" style={{ color: "hsl(var(--s-fg-faint))" }}>
                  {counts[status]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </header>

      {/* One chip, not a filter bar: this is the only cut of the table that
          answers a question the tabs cannot. */}
      {leads.isSuccess && (uncontactableCount > 0 || unownedCount > 0) ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {unownedCount > 0 ? (
            <button
              type="button"
              data-testid="leads-chip-unowned"
              aria-pressed={unownedOnly}
              className={`s-tab s-chip ${unownedOnly ? "s-tab-active" : ""}`}
              onClick={() => setUnownedOnly((v) => !v)}
            >
              {UI.chipUnowned(unownedCount)}
            </button>
          ) : null}
          {uncontactableCount > 0 ? (
            <button
              type="button"
              data-testid="leads-chip-uncontactable"
              aria-pressed={uncontactableOnly}
              className={`s-tab s-chip ${uncontactableOnly ? "s-tab-active" : ""}`}
              onClick={() => setUncontactableOnly((v) => !v)}
            >
              {UI.uncontactableChip(uncontactableCount)}
            </button>
          ) : null}
        </div>
      ) : null}

      <div id="leads-panel" role="tabpanel" aria-labelledby={`leads-tab-${tab}`}>
        {leads.isLoading ? <QueueLoading /> : null}
        {leads.isError ? <QueueError onRetry={() => void leads.refetch()} what={UI.loadErrorLeads} /> : null}
        {leads.isSuccess && requestedLeadId && !openLead ? (
          <p role="alert" data-testid="lead-not-found" className="s-card p-4">הליד המבוקש אינו זמין. ייתכן שהקישור השתנה או שאין גישה לרשומה.</p>
        ) : null}

        {leads.isSuccess && visible.length === 0 ? (
          <ListEmpty label={query ? UI.searchEmpty : UI.emptyForTab(tab)} />
        ) : null}

        {leads.isSuccess && visible.length > 0 ? (
          <LeadsTable
            rows={visible}
            // The tabs are one status each, so the column would repeat the tab
            // on every row. The prop stays so an "all" tab restores it.
            showStatus={false}
            roster={roster}
            selected={isRep ? undefined : selected}
            onToggle={isRep ? undefined : (id) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onToggleAll={isRep ? undefined : (ids) =>
              setSelected((prev) =>
                ids.every((id) => prev.has(id)) ? new Set() : new Set(ids),
              )
            }
            onOpen={(lead) => setOpenId(lead.id)}
          />
        ) : null}
      </div>

      {openLead ? (
        <LeadDrawer
          lead={openLead}
          canEdit={canEditOpenLead}
          canAssign={!isRep}
          suspended={answerSheetOpen}
          events={events.data ?? []}
          eventsLoading={events.isLoading}
          templates={settings.data?.whatsapp_templates ?? null}
          savingStatus={setStatus.isPending}
          savingNote={addNote.isPending}
          savingNextTouch={setNextTouch.isPending}
          savingAssignee={assign.isPending}
          error={error}
          onClose={closeLead}
          roster={roster}
          lostReasons={settings.data?.lost_reasons}
          onStatus={(status, reason, nextTouchAt) => {
            const target = openLead;
            setStatus.mutate(
              { status, reason, next_touch_at: nextTouchAt },
              {
                onSuccess: () =>
                  showToast(
                    UI.saved,
                    status === "lost" && target
                      ? { leadId: target.id, previousNextTouch: target.next_touch_at }
                      : null,
                  ),
              },
            );
          }}
          onNote={(note, done) =>
            addNote.mutate(
              { note },
              {
                onSuccess: () => {
                  done();
                  showToast(UI.saved);
                },
              },
            )
          }
          onNextTouch={(at) => setNextTouch.mutate({ at }, saved)}
          onAssign={(assignee, nextTouchAt) =>
            assign.mutate({ assignee, next_touch_at: nextTouchAt }, saved)
          }
          onArm={(leadId, channel) => {
            capture.arm(leadId, channel);
            outreach.mutate({ leadId, channel });
          }}
        />
      ) : null}

      {/* Mounted always, and empty when nothing is selected. A live region that
          appears already carrying its message never announces it — so the bar
          arriving was silent to anyone not looking at the screen, and bulk
          assignment was undiscoverable by keyboard (gate P0, A11Y-001). */}
      <span role="status" aria-live="polite" className="sr-only" data-testid="bulk-live">
        {selected.size > 0 ? UI.bulkSelected(selected.size) : ""}
      </span>

      {!isRep && selected.size > 0 ? (
        <BulkBar
          count={selected.size}
          roster={roster}
          busy={bulkAssign.isPending}
          // The server's own words when it gave any, a plain sentence when it
          // did not — an errored write must never render an empty alert.
          error={
            bulkAssign.isError
              ? (bulkAssign.error?.message || UI.bulkAssignFailed)
              : null
          }
          onClear={() => setSelected(new Set())}
          onAssign={(email, at) =>
            bulkAssign.mutate(
              { lead_ids: [...selected], assignee: email, next_touch_at: at },
              {
                onSuccess: (res) => {
                  setToast(
                    UI.bulkAssigned(
                      res.assigned,
                      assigneeName(email, roster) ?? email,
                    ),
                  );
                  setSelected(new Set());
                },
              },
            )
          }
        />
      ) : null}

      </div>

      {answerSheetOpen && capture.pending ? (
        <OutcomeSheet
          // One sheet per lead: a re-arm on another lead never inherits this draft.
          key={capture.pending.leadId}
          leadName={
            pendingRow
              ? (pendingRow.contact_name ?? pendingRow.org_name)
              : (lastLeadName.current ?? "")
          }
          lostReasons={settings.data?.lost_reasons}
          channel={capture.pending.channel}
          draftIdentity={{ email: session?.email ?? "", leadId: capture.pending.leadId }}
          busy={activity.isPending || outcome.isPending || convert.isPending}
          error={activity.error?.message ?? outcome.error?.message ?? convert.error?.message ?? convertNote}
          onSubmit={(vars) => {
            if (!vars.result) return;
            // `won` is not an outcome — record_outcome refuses it, because a
            // close is evidence-only. It goes to convert_lead, which is also
            // the only writer that emits the `converted` event v_sales_today
            // needs to keep showing the deal.
            if (vars.result === "won") {
              if (!vars.document_number) return;
              setConvertNote(null);
              convert.mutate(
                { document_number: vars.document_number },
                {
                  onSuccess: (res) => {
                    // A close that did not happen must not be celebrated. The
                    // intent stays armed, so the sheet stays open on this lead.
                    if (!res.converted) {
                      setConvertNote(UI.wonNotOpen);
                      return;
                    }
                    clearActivityDraft(session?.email ?? "", capture.pending?.leadId ?? "");
                    capture.clear();
                    showToast(UI.wonSaved);
                  },
                },
              );
              return;
            }
            // Read before the write, for the same reason Today reads it there:
            // the row leaves the list on success and takes its date with it.
            const leadId = capture.pending?.leadId ?? null;
            const previousNextTouch = pendingRow?.next_touch_at ?? null;
            if (vars.result === "lost") {
              outcome.mutate({ result: "lost", reason: vars.reason }, { onSuccess: () => {
                clearActivityDraft(session?.email ?? "", leadId ?? "");
                capture.clear();
                showToast(UI.outcomeSaved, leadId ? { leadId, previousNextTouch } : null);
              } });
              return;
            }
            if (!vars.request_id || !capture.pending) return;
            activity.mutate({ request_id: vars.request_id, source_task_id: capture.pending.taskId,
              channel: capture.pending.channel,
              result: vars.result, note: vars.note, primary_action: vars.primary_action }, {
              onSuccess: () => {
                clearActivityDraft(session?.email ?? "", leadId ?? "");
                capture.clear();
                showToast(UI.outcomeSaved);
              },
            });
          }}
          // Dismissal here means the same as on Today: the sheet closes, the
          // intent stays owed, and the next return asks again.
          onDismiss={capture.dismiss}
        />
      ) : null}

      {toast ? (
        <Toast
          message={toast}
          action={
            undo
              ? {
                  label: UI.undo,
                  onAction: () => {
                    const target = undo;
                    setUndo(null);
                    undoStatus.mutate(
                      {
                        status: "working",
                        // 0324 refuses a working lead with no next touch, so
                        // the reversal restores the date the lead carried, or
                        // falls back to the same next-business-day rule the
                        // outcome sheet previews.
                        next_touch_at:
                          target.previousNextTouch ??
                          nextBusinessTouchPreview(1).toISOString(),
                      },
                      { onSuccess: () => showToast(UI.undone) },
                    );
                  },
                }
              : undefined
          }
          onClose={() => {
            setToast(null);
            setUndo(null);
          }}
        />
      ) : null}
    </div>
  );
}

export default function LeadsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<QueueLoading />}>
      <LeadsScreen />
    </Suspense>
  );
}
