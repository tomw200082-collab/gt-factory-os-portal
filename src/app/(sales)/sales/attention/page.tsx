"use client";

// The admin's morning question, on one screen.
//
// v1 locked "three screens, no more", and that was right for an operator's
// loop. It was decided before §5 asked for control: what is stuck, what nobody
// owns, what has gone quiet. Putting it in a tab inside /leads would bury the
// one question the person running this asks every day, so it gets a screen —
// the fourth, and the last (decision gate D5).

import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useActivity,
  useAddNote,
  useAssign,
  useAttention,
  useLeadEvents,
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
import { UI } from "../../_lib/labels";
import { QueueError, QueueLoading } from "../../_components/EmptyStates";
import { ActivityFeed } from "../../_components/ActivityFeed";
import { AttentionList } from "../../_components/AttentionList";
import { LeadDrawer } from "../../_components/LeadDrawer";
import { OutcomeSheet } from "../../_components/OutcomeSheet";
import { Toast } from "../../_components/Toast";

export default function AttentionPage() {
  const { session } = useSession();
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
  const capture = useOutcomeCapture(session?.email);
  const pendingLead = leads.data?.find((l) => l.id === capture.pending?.leadId) ?? null;
  const outcome = useOutcome(capture.pending?.leadId ?? "");
  const recordActivity = useRecordActivity(capture.pending?.leadId ?? "");
  const convert = useConvert(capture.pending?.leadId ?? "");
  // convert_lead answers 200 {converted:false} when the lead is no longer open.
  // That is not an HTTP error and carries no error.message, so it needs its own
  // channel — otherwise a close that did nothing reads as a close that worked.
  const [convertNote, setConvertNote] = useState<string | null>(null);
  const answerSheetOpen = Boolean(capture.pending && (pendingLead || recordActivity.isPending || outcome.isPending));

  // The answered lead leaves /attention the moment it is answered for, and the
  // sheet asking about it is still open.
  const lastLeadName = useRef<string | null>(null);
  useEffect(() => {
    if (pendingLead) lastLeadName.current = pendingLead.contact_name ?? pendingLead.org_name;
  }, [pendingLead]);

  function arm(leadId: string, channel: "call" | "whatsapp" | "email") {
    capture.arm(leadId, channel);
    outreach.mutate({ leadId, channel });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="s-opening s-opening-compact flex flex-col gap-1">
        <h1 className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
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
        <div data-testid="attention-clear" className="s-panel s-enter flex items-center gap-3">
          <span className="s-empty-icon s-empty-icon-won" aria-hidden>
            <CheckCircle2 size={26} />
          </span>
          <p className="text-[15px] font-medium" style={{ color: "hsl(var(--s-fg))" }}>
            {UI.attentionClear}
          </p>
        </div>
      ) : null}

      {attention.isSuccess && attention.data.length > 0 ? (
        <AttentionList
          rows={attention.data}
          roster={roster}
          ownerEmail={session?.email}
          manager={session?.role !== "sales_rep"}
          onOpen={setOpenId}
          onArm={arm}
        />
      ) : null}

      {/* Given its own rule and card: on a wide screen the buckets end near the
          middle of the viewport and the feed floated on the background below
          them, so the page read as one that stopped partway. */}
      <section
        className="s-panel mt-6 flex flex-col gap-2"
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
          canEdit={session?.role !== "sales_rep" || openLead.assignee === session?.email}
          canAssign={session?.role !== "sales_rep"}
          suspended={answerSheetOpen}
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
          // One sheet per lead: a re-arm on another lead never inherits this draft.
          key={capture.pending.leadId}
          leadName={
            pendingLead
              ? (pendingLead.contact_name ?? pendingLead.org_name)
              : (lastLeadName.current ?? "")
          }
          lostReasons={settings.data?.lost_reasons}
          channel={capture.pending.channel}
          draftIdentity={{ email: session?.email ?? "", leadId: capture.pending.leadId }}
          busy={recordActivity.isPending || outcome.isPending || convert.isPending}
          error={recordActivity.error?.message ?? outcome.error?.message ?? convert.error?.message ?? convertNote}
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
                    setToast(UI.wonSaved);
                  },
                },
              );
              return;
            }
            const leadId = capture.pending?.leadId ?? "";
            if (vars.result === "lost") {
              outcome.mutate({ result: "lost", reason: vars.reason }, { onSuccess: () => {
                clearActivityDraft(session?.email ?? "", leadId);
                capture.clear();
                setToast(UI.outcomeSaved);
              } });
              return;
            }
            if (!vars.request_id || !capture.pending) return;
            recordActivity.mutate({ request_id: vars.request_id, source_task_id: capture.pending.taskId,
              channel: capture.pending.channel,
              result: vars.result, note: vars.note, primary_action: vars.primary_action }, {
              onSuccess: () => {
                clearActivityDraft(session?.email ?? "", leadId);
                capture.clear();
                setToast(UI.outcomeSaved);
              },
            });
          }}
          onDismiss={capture.dismiss}
        />
      ) : null}

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
