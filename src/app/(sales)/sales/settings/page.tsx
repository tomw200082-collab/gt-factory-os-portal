"use client";

import { useMemo, useState } from "react";
import { useLeads, useSaveSettings, useSettings } from "../../_lib/api";
import { UI } from "../../_lib/labels";
import { QueueError, QueueLoading } from "../../_components/EmptyStates";
import { SettingsForm } from "../../_components/SettingsForm";

export default function SettingsPage() {
  const settings = useSettings();
  const save = useSaveSettings();
  const [saved, setSaved] = useState(false);
  const leads = useLeads();

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
      <h1 className="text-xl font-semibold tracking-tight" style={{ color: "hsl(var(--s-fg))" }}>
        {UI.settingsTitle}
      </h1>

      {settings.isLoading ? <QueueLoading /> : null}
      {settings.isError ? <QueueError onRetry={() => void settings.refetch()} what={UI.loadErrorSettings} /> : null}

      {settings.isSuccess ? (
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
