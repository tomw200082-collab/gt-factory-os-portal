"use client";

// The full table: every lead GT has ever received, in one place.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAddNote,
  useAssign,
  useLeadEvents,
  useBulkAssign,
  useLeads,
  useOutcome,
  useOutreach,
  useSetNextTouch,
  useSetStatus,
  useSettings,
} from "../../_lib/api";
import { useOutcomeCapture } from "../../_lib/useOutcomeCapture";
import { matchesQuery } from "../../_lib/format";
import { STATUS_LABELS, UI } from "../../_lib/labels";
import type { LeadStatus } from "../../_lib/types";
import { ListEmpty, QueueError, QueueLoading } from "../../_components/EmptyStates";
import { LeadsTable } from "../../_components/LeadsTable";
import { LeadDrawer } from "../../_components/LeadDrawer";
import { assigneeName } from "../../_components/AssigneePicker";
import { BulkBar } from "../../_components/BulkBar";
import { OutcomeSheet } from "../../_components/OutcomeSheet";
import { Toast } from "../../_components/Toast";

const TABS: LeadStatus[] = ["new", "working", "won", "lost"];

function LeadsScreen() {
  const params = useSearchParams();
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
  const events = useLeadEvents(openId);

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
  const capture = useOutcomeCapture();
  const [toast, setToast] = useState<string | null>(null);

  const pendingRow = useMemo(
    () => rows.find((r) => r.id === capture.pending?.leadId) ?? null,
    [rows, capture.pending],
  );
  const outcome = useOutcome(capture.pending?.leadId ?? "");
  const answerSheetOpen = Boolean(capture.pending && (pendingRow || outcome.isPending));

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  const error =
    setStatus.error?.message ??
    addNote.error?.message ??
    setNextTouch.error?.message ??
    assign.error?.message ??
    null;

  /** Every drawer write says so — silence reads the same as a dropped save. */
  const saved = { onSuccess: () => setToast(UI.saved) };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--s-fg))" }}>
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
              className={`s-tab ${unownedOnly ? "s-tab-active" : ""}`}
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
              className={`s-tab ${uncontactableOnly ? "s-tab-active" : ""}`}
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

        {leads.isSuccess && visible.length === 0 ? (
          <ListEmpty label={query ? UI.searchEmpty : UI.emptyForTab(tab)} />
        ) : null}

        {leads.isSuccess && visible.length > 0 ? (
          <LeadsTable
            rows={visible}
            roster={roster}
            selected={selected}
            onToggle={(id) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onToggleAll={(ids) =>
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
          events={events.data ?? []}
          eventsLoading={events.isLoading}
          templates={settings.data?.whatsapp_templates ?? null}
          savingStatus={setStatus.isPending}
          savingNote={addNote.isPending}
          savingNextTouch={setNextTouch.isPending}
          savingAssignee={assign.isPending}
          error={error}
          onClose={() => setOpenId(null)}
          roster={roster}
          lostReasons={settings.data?.lost_reasons}
          onStatus={(status, reason, nextTouchAt) =>
            setStatus.mutate({ status, reason, next_touch_at: nextTouchAt }, saved)
          }
          onNote={(note, done) =>
            addNote.mutate(
              { note },
              {
                onSuccess: () => {
                  done();
                  setToast(UI.saved);
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

      {selected.size > 0 ? (
        <BulkBar
          count={selected.size}
          roster={roster}
          busy={bulkAssign.isPending}
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

      {answerSheetOpen && capture.pending ? (
        <OutcomeSheet
          leadName={pendingRow ? (pendingRow.contact_name ?? pendingRow.org_name) : ""}
          lostReasons={settings.data?.lost_reasons}
          channel={capture.pending.channel}
          busy={outcome.isPending}
          error={outcome.error?.message ?? null}
          onSubmit={(vars) => {
            if (!vars.result) return;
            outcome.mutate(
              { result: vars.result, next_touch_at: vars.next_touch_at, reason: vars.reason },
              {
                onSuccess: () => {
                  capture.clear();
                  setToast(UI.outcomeSaved);
                },
              },
            );
          }}
          // Dismissal here means the same as on Today: the sheet closes, the
          // intent stays owed, and the next return asks again.
          onDismiss={capture.dismiss}
        />
      ) : null}

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
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
