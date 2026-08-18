"use client";

// The admin's morning question, on one screen.
//
// v1 locked "three screens, no more", and that was right for an operator's
// loop. It was decided before §5 asked for control: what is stuck, what nobody
// owns, what has gone quiet. Putting it in a tab inside /leads would bury the
// one question the person running this asks every day, so it gets a screen —
// the fourth, and the last (decision gate D5).

import { useMemo, useState } from "react";
import {
  useActivity,
  useAddNote,
  useAssign,
  useAttention,
  useLeadEvents,
  useLeads,
  useSetNextTouch,
  useSetStatus,
  useSettings,
} from "../../_lib/api";
import { UI } from "../../_lib/labels";
import { QueueError, QueueLoading } from "../../_components/EmptyStates";
import { ActivityFeed } from "../../_components/ActivityFeed";
import { AttentionList } from "../../_components/AttentionList";
import { LeadDrawer } from "../../_components/LeadDrawer";
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
        <AttentionList rows={attention.data} roster={roster} onOpen={setOpenId} />
      ) : null}

      <section className="mt-2 flex flex-col gap-2">
        <h2 className="s-eyebrow">{UI.activityTitle}</h2>
        {activity.isSuccess ? <ActivityFeed rows={activity.data} /> : null}
      </section>

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
        />
      ) : null}

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
