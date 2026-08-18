"use client";

// The full table: every lead GT has ever received, in one place.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAddNote,
  useAssign,
  useLeadEvents,
  useLeads,
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

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.status === tab &&
          matchesQuery(r, query) &&
          (!uncontactableOnly || r.uncontactable),
      ),
    [rows, tab, query, uncontactableOnly],
  );

  const openLead = rows.find((r) => r.id === openId) ?? null;
  const events = useLeadEvents(openId);

  const setStatus = useSetStatus(openId ?? "");
  const addNote = useAddNote(openId ?? "");
  const setNextTouch = useSetNextTouch(openId ?? "");
  const assign = useAssign(openId ?? "");

  // Arming from the drawer writes the same outreach event a Today card writes,
  // and leaves the same owed intent. The outcome sheet stays owned by Today —
  // one place asks "what happened", wherever the call was placed from.
  const outreach = useOutreach();
  const capture = useOutcomeCapture();
  const [toast, setToast] = useState<string | null>(null);

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
      {leads.isSuccess && uncontactableCount > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="leads-chip-uncontactable"
            aria-pressed={uncontactableOnly}
            className={`s-tab ${uncontactableOnly ? "s-tab-active" : ""}`}
            onClick={() => setUncontactableOnly((v) => !v)}
          >
            {UI.uncontactableChip(uncontactableCount)}
          </button>
        </div>
      ) : null}

      <div id="leads-panel" role="tabpanel" aria-labelledby={`leads-tab-${tab}`}>
        {leads.isLoading ? <QueueLoading /> : null}
        {leads.isError ? <QueueError onRetry={() => void leads.refetch()} what={UI.loadErrorLeads} /> : null}

        {leads.isSuccess && visible.length === 0 ? (
          <ListEmpty label={query ? UI.searchEmpty : UI.emptyForTab(tab)} />
        ) : null}

        {leads.isSuccess && visible.length > 0 ? (
          <LeadsTable rows={visible} onOpen={(lead) => setOpenId(lead.id)} />
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
          onStatus={(status, reason) => setStatus.mutate({ status, reason }, saved)}
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
          onAssign={(assignee) => assign.mutate({ assignee }, saved)}
          onArm={(leadId, channel) => {
            capture.arm(leadId, channel);
            outreach.mutate({ leadId, channel });
          }}
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
