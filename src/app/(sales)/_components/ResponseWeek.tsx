"use client";

// The attention screen's weekly response metric (D-043, tranche 204): per rep, the leads
// that came in over the last 7 days — on time, due soon, overdue — and the share whose
// first contact met the target. Counted by the server (0377 v_sales_response_week); a rep
// sees only their own row.

import { UI } from "../_lib/labels";
import { assigneeName } from "./AssigneePicker";
import type { AssigneeEntry, ResponseWeekRow } from "../_lib/types";

export function ResponseWeek({ rows, roster }: { rows: ResponseWeekRow[]; roster: AssigneeEntry[] }) {
  return (
    <section className="s-panel flex flex-col gap-1" aria-labelledby="rt-week-title" data-testid="rt-week">
      <h2 id="rt-week-title" className="s-section-heading">{UI.weekTitle}</h2>
      <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{UI.weekHint}</p>
      {rows.length === 0 ? (
        <p data-testid="rt-week-empty" className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.weekEmpty}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.assignee ?? "-"} data-testid={`rt-week-${r.assignee ?? "unowned"}`} className="s-rt-week-row">
              <span className="font-medium" style={{ color: "hsl(var(--s-fg))", minWidth: "7rem" }}>
                {assigneeName(r.assignee, roster) ?? UI.weekUnowned}
                <span className="ms-2 text-[12px] font-normal" style={{ color: "hsl(var(--s-fg-faint))" }}>{UI.weekTotal(r.total)}</span>
              </span>
              <dl className="s-rt-week-stats">
                <div data-testid="rt-week-on_time"><dt>{UI.weekOnTime}</dt><dd>{r.on_time}</dd></div>
                <div data-testid="rt-week-due_soon"><dt>{UI.weekDueSoon}</dt><dd>{r.due_soon}</dd></div>
                <div data-testid="rt-week-overdue">
                  <dt>{UI.weekOverdue}</dt>
                  <dd style={r.overdue > 0 ? { color: "hsl(var(--s-sla-overdue))" } : undefined}>{r.overdue}</dd>
                </div>
                <div><dt>{UI.weekMetLabel}</dt>
                  <dd data-testid="rt-week-met">{r.met_pct === null ? UI.weekNoDecided : UI.weekMet(r.met_pct, r.met, r.decided)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
