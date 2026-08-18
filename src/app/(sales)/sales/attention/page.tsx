"use client";

// The admin's morning question, on one screen.
//
// v1 locked "three screens, no more", and that was right for an operator's
// loop. It was decided before §5 asked for control: what is stuck, what nobody
// owns, what has gone quiet. Putting it in a tab inside /leads would bury the
// one question the person running this asks every day, so it gets a screen —
// the fourth, and the last (decision gate D5).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useActivity,
  useAddNote,
  useAssign,
  useAttention,
  useLeadEvents,
  useLeads,
  useOutcome,
  useOutreach,
  useSetNextTouch,
  useSetStatus,
  useSettings,
} from "../../_lib/api";
import { useOutcomeCapture } from "../../_lib/useOutcomeCapture";
import { UI } from "../../_lib/labels";
import { QueueError, QueueLoading } from "../../_components/EmptyStates";
import { ActivityFeed } from "../../_components/ActivityFeed";
import { AttentionList } from "../../_components/AttentionList";
import { LeadDrawer } from "../../_components/LeadDrawer";
import { OutcomeSheet } from "../../_components/OutcomeSheet";
import { Toast } from "../../_components/Toast";

export default function AttentionPage() {
  const attention = useAttention();
  const activity = useActivity(50);
  const settings = useSettings();
  const leads = useLeads();

  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const roster = useMemo(() => settings.data?.assignees ?? [], [settings.data]);
  const openLead = leads.data?.find((l) => l.id === openId) ?? null;
  const events = useLeadEvents(openId);

  const setStatus = useSetStatus(openId ?? "");
  const addNote = useAddNote(openId ?? "");
  const setNextTouch = useSetNextTouch(openId ?? "");
  const assign = useAssign(openId ?? "");
  const saved = { onSuccess: () => setToast(UI.saved) };

  // A call placed from this screen owes an outcome, the same as one placed
  // from Today. Until now this screen dialled and asked nothing, so the one
  // surface built for "what is stuck" was itself a way to leave a lead stuck
  // with no record of the conversation (gate flow P1 / INTER-008).
  const outreach = useOutreach();
  const capture = useOutcomeCapture();
  const pendingLead = leads.data?.find((l) => l.id === capture.pending?.leadId) ?? null;
  const outcome = useOutcome(capture.pending?.leadId ?? "");
  const answerSheetOpen = Boolean(capture.pending && (pendingLead || outcome.isPending));

  // The answered lead leaves /attention the moment it is answered for, and the
  // sheet asking about it is still open.
  const lastLeadName = useRef<string | null>(null);
  useEffect(() => {
    if (pendingLead) lastLeadName.current = pendingLead.contact_name ?? pendingLead.org_name;
  }, [pendingLead]);

  function arm(leadId: string, channel: "call") {
    capture.arm(leadId, channel);
    outreach.mutate({ leadId, channel });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--s-fg))" }}>
          {UI.attentionTitle}
        </h1>
        <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {UI.attentionHint}
        </p>
      </header>

      {/* While a sheet is open the screen behind it is unreachable by pointer;
          hiding it from assistive technology keeps the two contexts from being
          read as one. aria-modal alone is only partly honoured on iOS — the
          same reason /sales/today does this. */}
      <div data-testid="attention-body" aria-hidden={answerSheetOpen || undefined}>
      {attention.isLoading ? <QueueLoading /> : null}
      {attention.isError ? (
        <QueueError onRetry={() => void attention.refetch()} what={UI.attentionTitle} />
      ) : null}

      {attention.isSuccess && attention.data.length === 0 ? (
        // An authored empty state: this one is the good news.
        <p data-testid="attention-clear" className="text-[15px]" style={{ color: "hsl(var(--s-fg))" }}>
          {UI.attentionClear}
        </p>
      ) : null}

      {attention.isSuccess && attention.data.length > 0 ? (
        <AttentionList
          rows={attention.data}
          roster={roster}
          onOpen={setOpenId}
          onArm={arm}
        />
      ) : null}

      {/* Given its own rule and card: on a wide screen the buckets end near the
          middle of the viewport and the feed floated on the background below
          them, so the page read as one that stopped partway. */}
      <section
        className="s-card mt-6 flex flex-col gap-2 p-3"
        aria-labelledby="activity-feed-title"
      >
        <h2 id="activity-feed-title" className="s-eyebrow" style={{ margin: 0 }}>
          {UI.activityTitle}
        </h2>
        {activity.isLoading ? (
          <ul data-testid="activity-loading" aria-hidden className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <li
                key={i}
                className="animate-pulse rounded"
                style={{ height: 20, background: "hsl(var(--s-surface-sunken))" }}
              />
            ))}
          </ul>
        ) : null}
        {/* Outside the aria-hidden skeleton — a status buried inside it would
            be hidden along with the shapes it is describing. */}
        {activity.isLoading ? (
          <span role="status" aria-live="polite" className="sr-only">
            {UI.loading}
          </span>
        ) : null}
        {activity.isError ? (
          <QueueError onRetry={() => void activity.refetch()} what={UI.activityError} />
        ) : null}
        {activity.isSuccess ? <ActivityFeed rows={activity.data} /> : null}
      </section>

      </div>

      {openLead ? (
        <LeadDrawer
          lead={openLead}
          events={events.data ?? []}
          eventsLoading={events.isLoading}
          templates={settings.data?.whatsapp_templates ?? null}
          roster={roster}
          lostReasons={settings.data?.lost_reasons}
          savingStatus={setStatus.isPending}
          savingNote={addNote.isPending}
          savingNextTouch={setNextTouch.isPending}
          savingAssignee={assign.isPending}
          error={
            setStatus.error?.message ??
            addNote.error?.message ??
            setNextTouch.error?.message ??
            assign.error?.message ??
            null
          }
          onClose={() => setOpenId(null)}
          onStatus={(status, reason, nextTouchAt) =>
            setStatus.mutate({ status, reason, next_touch_at: nextTouchAt }, saved)
          }
          onNote={(note, done) =>
            addNote.mutate({ note }, { onSuccess: () => { done(); setToast(UI.saved); } })
          }
          onNextTouch={(at) => setNextTouch.mutate({ at }, saved)}
          onAssign={(assignee, nextTouchAt) =>
            assign.mutate({ assignee, next_touch_at: nextTouchAt }, saved)
          }
          // The drawer dials too, and a call placed from inside it owes the
          // same answer as one placed from the card behind it.
          onArm={(leadId, channel) => {
            capture.arm(leadId, channel);
            outreach.mutate({ leadId, channel });
          }}
        />
      ) : null}

      {answerSheetOpen && capture.pending ? (
        <OutcomeSheet
          leadName={
            pendingLead
              ? (pendingLead.contact_name ?? pendingLead.org_name)
              : (lastLeadName.current ?? "")
          }
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
          onDismiss={capture.dismiss}
        />
      ) : null}

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
