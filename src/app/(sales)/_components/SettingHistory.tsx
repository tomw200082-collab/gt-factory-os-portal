"use client";

// "היסטוריית שינויים" under a settings area (D-045, tranche 205): the last 20 changes of that
// area's key, newest first — who, when, and what changed in words. Closed by default; the
// list is read from the server only when it is opened.

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TEAM_UI, actorLabel } from "../_lib/labels";
import { fmtRelative } from "../_lib/format";
import { describeChange } from "../_lib/settingHistory";
import { useSettingHistory } from "../_lib/api";
import type { HistoryKey, SettingHistoryRow } from "../_lib/types";

export interface SettingHistoryListProps {
  settingKey: HistoryKey;
  /** what the area is called, for the list's accessible name */
  title: string;
  open: boolean;
  onToggle: () => void;
  rows: SettingHistoryRow[] | undefined;
  loading: boolean;
  error: boolean;
  /** roster email → name, so a signer change names the person */
  names?: Record<string, string>;
}

export function SettingHistoryList({ settingKey, title, open, onToggle, rows, loading, error, names }: SettingHistoryListProps) {
  const listId = useId();
  return (
    <div className="flex flex-col gap-1" data-testid={`history-${settingKey}`}>
      <button
        type="button"
        className="s-history-toggle"
        aria-expanded={open}
        aria-controls={listId}
        data-testid={`history-toggle-${settingKey}`}
        onClick={onToggle}
      >
        <ChevronDown size={14} aria-hidden className={open ? "rotate-180" : undefined} />
        {TEAM_UI.historyShow}
      </button>
      {open ? (
        <div id={listId} role="region" aria-label={TEAM_UI.historyTitle(title)}>
          {loading ? <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{TEAM_UI.historyLoading}</p> : null}
          {error ? <p role="alert" className="text-[12px]" style={{ color: "hsl(var(--s-sla-overdue))" }}>{TEAM_UI.historyError}</p> : null}
          {rows && rows.length === 0 ? (
            <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{TEAM_UI.historyEmpty}</p>
          ) : null}
          {rows && rows.length > 0 ? (
            <ol className="s-history-list" data-testid={`history-list-${settingKey}`}>
              {rows.map((r) => (
                <li key={r.id} className="s-history-row">
                  <span className="font-medium" style={{ color: "hsl(var(--s-fg))" }}>
                    {actorLabel(r.actor)}
                  </span>
                  <span style={{ color: "hsl(var(--s-fg-muted))" }}> · {fmtRelative(r.at)}</span>
                  {describeChange(settingKey, r.old_value, r.new_value, names).map((line) => (
                    <span key={line} className="block" style={{ color: "hsl(var(--s-fg-muted))" }}>
                      <bdi>{line}</bdi>
                    </span>
                  ))}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The list wired to the server: read when first opened, refreshed after a save. */
export function SettingHistory(props: { settingKey: HistoryKey; title: string; names?: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const q = useSettingHistory(props.settingKey, open);
  return (
    <SettingHistoryList
      {...props}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      rows={q.data}
      loading={q.isLoading && open}
      error={q.isError}
    />
  );
}
