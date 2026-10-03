"use client";

// /sales/control — the control room (D-045, tranche 205), Tom only.
//
// The guard is the server: GET /api/v1/queries/sales/control allows only the session email
// tom@gteveryday.com and answers 404 to everyone else. This page shows exactly what the server
// gives: the tiles for Tom, and for anyone else a plain "not found" — no data and no hint.
// The navigation entry is shown only to Tom's session (SalesShell), but that is courtesy, not
// the guard.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useControlRoom, useSaveTestPhones } from "../../_lib/api";
import { CONTROL_UI, RULE_MESSAGES, UI } from "../../_lib/labels";
import { fmtRelative } from "../../_lib/format";
import { QueueError, QueueLoading } from "../../_components/EmptyStates";
import { ControlRoomView } from "../../_components/ControlRoomView";

export default function ControlPage() {
  const room = useControlRoom();
  const save = useSaveTestPhones();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  if (room.isError && (room.error.status === 404 || room.error.status === 403)) {
    return (
      <div className="flex flex-col gap-2" data-testid="control-not-found">
        <h1 className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>{CONTROL_UI.notFound}</h1>
        <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{CONTROL_UI.notFoundHint}</p>
        <Link href="/sales/today" className="s-btn s-btn-ghost self-start">{CONTROL_UI.backToToday}</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {room.isSuccess ? (
        <header className="s-opening s-opening-compact flex flex-col gap-1">
          <h1 className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>{CONTROL_UI.title}</h1>
          <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{CONTROL_UI.hint}</p>
          <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{CONTROL_UI.generatedAt(fmtRelative(room.data.generated_at))}</p>
        </header>
      ) : null}
      {room.isLoading ? <QueueLoading /> : null}
      {room.isError ? <QueueError onRetry={() => void room.refetch()} what={CONTROL_UI.loadError} /> : null}
      {room.isSuccess ? (
        <ControlRoomView
          room={room.data}
          phones={{
            phones: room.data.technical.test_phones,
            saving: save.isPending,
            saved,
            error: save.error ? ((save.error.code && RULE_MESSAGES[save.error.code]) || UI.saveFailed) : null,
            onSave: (phones) => {
              setSaved(false);
              save.mutate(phones, { onSuccess: () => setSaved(true) });
            },
          }}
        />
      ) : null}
    </div>
  );
}
