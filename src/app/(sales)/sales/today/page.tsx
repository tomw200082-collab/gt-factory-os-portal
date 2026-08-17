"use client";

// The home of the workspace: what to do now, in order.

import { useMemo, useState } from "react";
import {
  useOutcome,
  useOutreach,
  useSetNextTouch,
  useSettings,
  useToday,
  useWeekStats,
} from "../../_lib/api";
import { useOutcomeCapture } from "../../_lib/useOutcomeCapture";
import { UI } from "../../_lib/labels";
import type { TodayRow } from "../../_lib/types";
import { QueueDone, QueueError, QueueLoading } from "../../_components/EmptyStates";
import { StatsStrip } from "../../_components/StatsStrip";
import { TodayQueue } from "../../_components/TodayQueue";
import { OutcomeSheet, type OutcomeSubmit } from "../../_components/OutcomeSheet";

export default function TodayPage() {
  const today = useToday();
  const stats = useWeekStats();
  const settings = useSettings();
  const capture = useOutcomeCapture();

  // The two direct actions on a card, which skip the call-and-return cycle.
  const [postponing, setPostponing] = useState<TodayRow | null>(null);
  const [losing, setLosing] = useState<TodayRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const rows = useMemo(() => today.data ?? [], [today.data]);
  const pendingRow = useMemo(
    () => rows.find((r) => r.lead_id === capture.pending?.leadId) ?? null,
    [rows, capture.pending],
  );

  const outreach = useOutreach();
  const outcome = useOutcome(capture.pending?.leadId ?? "");
  const nextTouch = useSetNextTouch(postponing?.lead_id ?? "");
  const lostOutcome = useOutcome(losing?.lead_id ?? "");

  function arm(leadId: string, channel: "call" | "whatsapp") {
    capture.arm(leadId, channel);
    // Intent, not a touch: only an outcome, a note or a status change stops the
    // SLA clock (§5.3), and record_outreach is written that way server-side.
    // The id travels in the vars — nothing is "pending" yet at this instant.
    outreach.mutate({ leadId, channel });
  }

  function submitOutcome(vars: OutcomeSubmit) {
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
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--s-fg))" }}>
          {UI.todayTitle}
        </h1>
        <StatsStrip stats={stats.data} />
      </header>

      {today.isLoading ? <QueueLoading /> : null}
      {today.isError ? <QueueError onRetry={() => void today.refetch()} /> : null}
      {today.isSuccess && rows.length === 0 ? <QueueDone /> : null}

      {today.isSuccess && rows.length > 0 ? (
        <TodayQueue
          rows={rows}
          templates={settings.data?.whatsapp_templates ?? null}
          onArm={arm}
          onPostpone={setPostponing}
          onLost={setLosing}
        />
      ) : null}

      {capture.pending && pendingRow ? (
        <OutcomeSheet
          leadName={pendingRow.contact_name ?? pendingRow.org_name}
          busy={outcome.isPending}
          error={outcome.error?.message ?? null}
          onSubmit={submitOutcome}
          // Closes the sheet but leaves the intent owed — it will be asked
          // again on the next return. Only an answer clears it.
          onDismiss={capture.dismiss}
        />
      ) : null}

      {postponing ? (
        <OutcomeSheet
          mode="next-touch"
          leadName={postponing.contact_name ?? postponing.org_name}
          busy={nextTouch.isPending}
          error={nextTouch.error?.message ?? null}
          onSubmit={(vars) => {
            if (!vars.next_touch_at) return;
            nextTouch.mutate(
              { at: vars.next_touch_at },
              {
                onSuccess: () => {
                  setPostponing(null);
                  setToast(UI.outcomeSaved);
                },
              },
            );
          }}
          onDismiss={() => setPostponing(null)}
        />
      ) : null}

      {losing ? (
        <OutcomeSheet
          mode="lost"
          leadName={losing.contact_name ?? losing.org_name}
          busy={lostOutcome.isPending}
          error={lostOutcome.error?.message ?? null}
          onSubmit={(vars) => {
            if (!vars.reason) return;
            lostOutcome.mutate(
              { result: "lost", reason: vars.reason },
              {
                onSuccess: () => {
                  setLosing(null);
                  setToast(UI.outcomeSaved);
                },
              },
            );
          }}
          onDismiss={() => setLosing(null)}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="sales-toast"
          className="fixed inset-x-0 bottom-24 mx-auto w-fit rounded-full px-4 py-2 text-[13px]"
          style={{ background: "hsl(var(--s-fg))", color: "hsl(var(--s-bg))" }}
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
