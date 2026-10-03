"use client";

// /sales/control — the control room (D-045, tranche 205), Tom only.
//
// The guard is the server: GET /api/v1/queries/sales/control allows only the session email
// tom@gteveryday.com and answers 404 to everyone else. The route's server layout answers 404
// first (the portal's own not-found, identical to an unknown route), and this page calls
// notFound() too if the API refuses. The navigation entry follows the server's can_control
// flag (SalesShell), which is courtesy, not the guard.

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useControlRoom, useSaveTestPhones } from "../../_lib/api";
import { RULE_MESSAGES, UI } from "../../_lib/labels";
import { CONTROL_UI } from "./copy";
import { fmtRelative } from "../../_lib/format";
import { QueueError, QueueLoading } from "../../_components/EmptyStates";
import { ControlRoomView } from "./ControlRoomView";

export default function ControlPage() {
  const room = useControlRoom();
  const save = useSaveTestPhones();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  // The server said this session has no control room: the same 404 as any unknown route.
  // (The route's server layout already answers 404 before this renders; this is the fallback.)
  if (room.isError && (room.error.status === 404 || room.error.status === 403)) notFound();

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
