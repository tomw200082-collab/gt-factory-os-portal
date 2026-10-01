"use client";

import { useMemo, useState } from "react";
import { useLeads, useSaveSettings, useSettings } from "../../_lib/api";
import { UI } from "../../_lib/labels";
import { QueueError, QueueLoading } from "../../_components/EmptyStates";
import { SettingsForm } from "../../_components/SettingsForm";
import { useSession } from "@/lib/auth/session-provider";

export default function SettingsPage() {
  const { session } = useSession();
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
        <p role="status" className="text-sm" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {UI.settingsManagerOnly}
        </p>
      ) : null}
      {session?.role !== "sales_rep" && settings.isLoading ? <QueueLoading /> : null}
      {session?.role !== "sales_rep" && settings.isError ? <QueueError onRetry={() => void settings.refetch()} what={UI.loadErrorSettings} /> : null}

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
