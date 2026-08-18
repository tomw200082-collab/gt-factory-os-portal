"use client";

import { useState } from "react";
import { useSaveSettings, useSettings } from "../../_lib/api";
import { UI } from "../../_lib/labels";
import { QueueError, QueueLoading } from "../../_components/EmptyStates";
import { SettingsForm } from "../../_components/SettingsForm";

export default function SettingsPage() {
  const settings = useSettings();
  const save = useSaveSettings();
  const [saved, setSaved] = useState(false);

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
