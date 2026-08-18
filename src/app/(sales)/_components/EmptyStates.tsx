"use client";

// The states a queue spends real time in. Designed on purpose, not left to
// whatever a spinner does by default: the empty one is the reward for
// finishing, and the error one has to admit what happened and offer a way out.

import { AlertCircle, CheckCircle2, Inbox } from "lucide-react";
import { UI } from "../_lib/labels";

export function QueueDone() {
  return (
    <div
      data-testid="queue-done"
      className="s-card s-enter flex flex-col items-center gap-2 px-6 py-12 text-center"
    >
      <CheckCircle2 size={30} aria-hidden style={{ color: "hsl(var(--s-status-won))" }} />
      <p className="text-lg font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
        {UI.queueDone}
      </p>
      <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
        {UI.queueDoneHint}
      </p>
    </div>
  );
}

/**
 * `what` names the thing that failed to load, in Hebrew, for the screens that
 * are not the queue — "we couldn't load the queue" is simply untrue on the
 * settings page. Omit it on Today, where the queue is what failed.
 */
export function QueueError({ onRetry, what }: { onRetry: () => void; what?: string }) {
  return (
    <div
      data-testid="queue-error"
      role="alert"
      className="s-card flex flex-col items-center gap-3 px-6 py-10 text-center"
    >
      <AlertCircle size={26} aria-hidden style={{ color: "hsl(var(--s-sla-overdue))" }} />
      <div>
        <p className="font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
          {what ? UI.loadError(what) : UI.queueError}
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {UI.queueErrorHint}
        </p>
      </div>
      <button type="button" className="s-btn s-btn-ghost" onClick={onRetry}>
        {UI.retry}
      </button>
    </div>
  );
}

export function QueueLoading() {
  return (
    <div data-testid="queue-loading" className="flex flex-col gap-3" aria-busy="true">
      <span className="sr-only">{UI.loading}</span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden
          className="s-card animate-pulse"
          style={{ height: 188, opacity: 1 - i * 0.22 }}
        />
      ))}
    </div>
  );
}

export function ListEmpty({ label }: { label: string }) {
  return (
    <div
      data-testid="list-empty"
      className="s-card flex flex-col items-center gap-2 px-6 py-10 text-center"
    >
      <Inbox size={24} aria-hidden style={{ color: "hsl(var(--s-fg-faint))" }} />
      <p className="text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
        {label}
      </p>
    </div>
  );
}
