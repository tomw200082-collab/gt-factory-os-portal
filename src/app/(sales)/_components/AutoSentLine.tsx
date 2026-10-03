"use client";

// What the lead line sent this lead automatically (tranche 203, D-042).
//
// One compact line — the latest message, whether it was read, the button the lead tapped
// — that expands to the whole list. Only messages that really left are here: the server
// never returns a dry run or a failed send. Read and delivered come from the provider's
// status rows, linked by the message's wamid; with no status, nothing is claimed.

import { useId, useState } from "react";
import { UI } from "../_lib/labels";
import { autoKindLabel, autoStatus, autoSummary, fmtWhen } from "../_lib/quickMessages";
import type { LeadConversation } from "../_lib/types";

export function AutoSentLine({ conversation, now }: { conversation: LeadConversation | null | undefined; now?: Date }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const at = now ?? new Date();
  const line = autoSummary(conversation, at);
  if (!conversation || !line) return null;

  // messages and taps, in the order they happened
  const items = [
    ...conversation.auto.map((a) => ({
      at: a.at,
      key: `a-${a.at}-${a.kind}-${a.step ?? ""}`,
      text: [autoKindLabel(a.kind, a.kind === "first_menu" ? conversation.menu_label : null), autoStatus(a, at)]
        .filter(Boolean).join(" · "),
    })),
    ...conversation.taps.filter((t) => t.title).map((t) => ({
      at: t.at, key: `t-${t.at}-${t.button_id}`, text: UI.autoTapped(t.title as string),
    })),
  ].sort((x, y) => x.at.localeCompare(y.at));

  return (
    <section className="s-auto-sent mt-3" aria-label={UI.autoListTitle}>
      <div className="flex items-start gap-2">
        <p data-testid="auto-sent-line" className="min-w-0 flex-1 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {line}
        </p>
        <button
          type="button"
          data-testid="auto-sent-toggle"
          aria-expanded={open}
          aria-controls={listId}
          className="s-wa-other shrink-0"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? UI.autoHide : UI.autoShowAll}
        </button>
      </div>
      {open ? (
        <ol id={listId} data-testid="auto-sent-list" className="mt-1 flex flex-col gap-1">
          {items.map((i) => (
            <li key={i.key} className="flex items-baseline gap-2 text-[13px]" style={{ color: "hsl(var(--s-fg))" }}>
              <time className="s-nums shrink-0 text-[12px]" dateTime={i.at} style={{ color: "hsl(var(--s-fg-faint))" }}>
                {fmtWhen(i.at, at)}
              </time>
              <span className="min-w-0">{i.text}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
