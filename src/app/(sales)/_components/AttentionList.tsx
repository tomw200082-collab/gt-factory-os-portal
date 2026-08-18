"use client";

// What is stuck, what nobody owns, what has gone quiet.
//
// This is the question the admin actually asks each morning, and until now it
// was answered in SQL or not at all (audit P0-5): the ingredients were computed
// per row — an overdue flag here, a red date there — and nothing ever added
// them up. A lead can appear in two sections; that is deliberate, each one
// answers a different question and hiding the second would hide the problem.

import { Phone } from "lucide-react";
import { fmtPhone } from "../_lib/format";
import { UI } from "../_lib/labels";
import { assigneeName } from "./AssigneePicker";
import { telHref } from "../_lib/wa";
import type { AssigneeEntry, AttentionRow } from "../_lib/types";

const BUCKETS = ["overdue", "unowned", "stalled"] as const;

const BUCKET_LABELS: Record<(typeof BUCKETS)[number], (n: number) => string> = {
  overdue: UI.bucketOverdue,
  unowned: UI.bucketUnowned,
  stalled: UI.bucketStalled,
};

export interface AttentionListProps {
  rows: AttentionRow[];
  roster: AssigneeEntry[];
  onOpen: (leadId: string) => void;
}

export function AttentionList({ rows, roster, onOpen }: AttentionListProps) {
  return (
    <div className="flex flex-col gap-6">
      {BUCKETS.map((bucket) => {
        const section = rows.filter((r) => r.bucket === bucket);
        if (section.length === 0) return null;
        return (
          <section
            key={bucket}
            data-testid={`attention-section-${bucket}`}
            aria-labelledby={`attention-title-${bucket}`}
            className="flex flex-col gap-2"
          >
            <h2 id={`attention-title-${bucket}`} className="s-eyebrow" style={{ margin: 0 }}>
              {BUCKET_LABELS[bucket](section.length)}
            </h2>

            {section.map((row) => {
              const tel = telHref(row.phone_e164);
              return (
                <article
                  key={`${row.bucket}-${row.lead_id}`}
                  data-testid={`attention-row-${row.lead_id}-${row.bucket}`}
                  className="s-card flex flex-wrap items-center gap-2 p-3"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-start font-semibold"
                    style={{ color: "hsl(var(--s-fg))" }}
                    onClick={() => onOpen(row.lead_id)}
                  >
                    {row.org_name}
                  </button>

                  <span className="text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
                    {assigneeName(row.assignee, roster) ?? UI.ownerNone}
                  </span>

                  {/* Days, in numerals, in the one colour that means late. */}
                  <span
                    className="s-badge s-badge-sla-overdue"
                    data-testid={`attention-days-${row.lead_id}-${row.bucket}`}
                  >
                    <bdi dir="ltr">{UI.daysStuck(row.days_stuck)}</bdi>
                  </span>

                  {tel ? (
                    <a href={tel} className="s-btn s-btn-ghost" aria-label={UI.call}>
                      <Phone size={16} aria-hidden />
                      <bdi dir="ltr" className="s-nums text-[12px]">
                        {fmtPhone(row.phone_e164)}
                      </bdi>
                    </a>
                  ) : null}
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
