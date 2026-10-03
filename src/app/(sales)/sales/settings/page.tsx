"use client";

import { useEffect, useMemo, useState } from "react";
import { useJourney, useLeads, useSaveQuickMessage, useSaveSettings, useSettings } from "../../_lib/api";
import { RULE_MESSAGES, UI } from "../../_lib/labels";
import { QueueError, QueueLoading } from "../../_components/EmptyStates";
import { SettingsForm } from "../../_components/SettingsForm";
import { JourneySection } from "../../_components/JourneySection";
import { QuickMessagesSection } from "../../_components/QuickMessagesSection";
import type { QuickSituation } from "../../_lib/types";
import { useSession } from "@/lib/auth/session-provider";

export default function SettingsPage() {
  const { session } = useSession();
  const settings = useSettings();
  const save = useSaveSettings();
  const [saved, setSaved] = useState(false);
  // "Saved" is news for a moment, not a standing claim about fields edited
  // since (UX gate FLOW-006).
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(timer);
  }, [saved]);
  const leads = useLeads();
  const manager = Boolean(session) && session?.role !== "sales_rep";
  // D-044: the automatic sequence, read-only. D-042: the quick messages, one save each.
  const journey = useJourney(manager);
  const saveQuick = useSaveQuickMessage();
  const [quickSaved, setQuickSaved] = useState<QuickSituation | null>(null);
  const [quickError, setQuickError] = useState<{ situation: QuickSituation; message: string } | null>(null);
  useEffect(() => {
    if (!quickSaved) return;
    const timer = setTimeout(() => setQuickSaved(null), 3000);
    return () => clearTimeout(timer);
  }, [quickSaved]);

  const openLeadsByAssignee = useMemo(() => {
    const out: Record<string, number> = {};
    for (const lead of leads.data ?? []) {
      if (!lead.assignee) continue;
      if (lead.status !== "new" && lead.status !== "working") continue;
      out[lead.assignee] = (out[lead.assignee] ?? 0) + 1;
    }
    return out;
  }, [leads.data]);

  return (
    <div className="flex flex-col gap-4">
      {/* Every other screen frames itself — Today with the stats strip, Leads
          with the search field, /attention with a subtitle. Settings opened on
          a bare title and went straight into form controls. */}
      <header className="s-opening s-opening-compact flex flex-col gap-1">
        <h1 className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
          {UI.settingsTitle}
        </h1>
        <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {UI.settingsHint}
        </p>
      </header>

      {session?.role === "sales_rep" ? (
        <p className="text-sm" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {UI.settingsManagerOnly}
        </p>
      ) : null}
      {session?.role !== "sales_rep" && settings.isLoading ? <QueueLoading /> : null}
      {session?.role !== "sales_rep" && settings.isError ? <QueueError onRetry={() => void settings.refetch()} what={UI.loadErrorSettings} /> : null}

      {manager && journey.isLoading ? <QueueLoading /> : null}
      {manager && journey.isError ? (
        <QueueError onRetry={() => void journey.refetch()} what={UI.journeyLoadError} />
      ) : null}
      {manager && journey.isSuccess ? <JourneySection journey={journey.data} /> : null}

      {session?.role !== "sales_rep" && settings.isSuccess && settings.data.whatsapp_quick_messages ? (
        <QuickMessagesSection
          messages={settings.data.whatsapp_quick_messages}
          changes={settings.data.quick_message_changes ?? {}}
          signer={settings.data.quick_message_signer ?? ""}
          savingSituation={saveQuick.isPending ? (saveQuick.variables?.situation ?? null) : null}
          savedSituation={quickSaved}
          error={quickError}
          onSave={(situation, text) => {
            setQuickSaved(null);
            setQuickError(null);
            saveQuick.mutate({ situation, text }, {
              onSuccess: () => setQuickSaved(situation),
              onError: (e) => setQuickError({ situation, message: (e.code && RULE_MESSAGES[e.code]) || UI.saveFailed }),
            });
          }}
        />
      ) : null}

      {session?.role !== "sales_rep" && settings.isSuccess ? (
        <SettingsForm
          settings={settings.data}
          // Deactivating somebody who still owns open leads should say so
          // before it strands them; the count comes from the list already on
          // screen elsewhere, so this costs one query, not a new endpoint.
          openLeadsByAssignee={openLeadsByAssignee}
          busy={save.isPending}
          error={save.error?.message ?? null}
          saved={saved}
          onSave={(vars) => {
            setSaved(false);
            save.mutate(vars, { onSuccess: () => setSaved(true) });
          }}
        />
      ) : null}
    </div>
  );
}
