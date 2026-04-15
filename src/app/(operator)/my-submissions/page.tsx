"use client";

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { StatusBadge } from "@/components/badges/StatusBadge";
import { SearchFilterBar } from "@/components/data/SearchFilterBar";
import { EmptyState } from "@/components/feedback/states";
import { SEED_SUBMISSIONS } from "@/lib/fixtures/submissions";
import type { SubmissionState } from "@/lib/contracts/enums";
import type { SubmissionDto } from "@/lib/contracts/dto";

const STATE_FILTERS: SubmissionState[] = [
  "queued",
  "committed",
  "pending_approval",
  "failed_retriable",
  "failed_terminal",
];

export default function MySubmissionsPage() {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<SubmissionState | null>(null);

  const submissions: SubmissionDto[] = SEED_SUBMISSIONS.filter((s) => {
    if (stateFilter && s.state !== stateFilter) return false;
    if (query && !s.summary.toLowerCase().includes(query.toLowerCase()))
      return false;
    return true;
  });

  return (
    <>
      <WorkflowHeader
        eyebrow="Operator"
        title="My submissions"
        description="Everything you've submitted today and this week. Queued submissions live locally until they commit."
      />

      <SectionCard contentClassName="p-0">
        <div className="border-b border-border/60 px-5 py-3">
          <SearchFilterBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Search submissions"
            chips={STATE_FILTERS.map((s) => ({
              key: s,
              label: s.replace("_", " "),
              active: stateFilter === s,
              onToggle: () => setStateFilter((c) => (c === s ? null : s)),
            }))}
          />
        </div>

        {submissions.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No submissions match"
              description="Adjust the search or filter chips above to see more."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {submissions.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-4 px-5 py-4 transition-colors duration-150 hover:bg-bg-subtle/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-3xs">
                    <span className="chip">
                      {s.form_type.replace("_", " ")}
                    </span>
                    <span className="font-mono uppercase tracking-sops text-fg-subtle">
                      {s.idempotency_key}
                    </span>
                  </div>
                  <div className="mt-1.5 text-sm font-medium text-fg-strong">
                    {s.summary}
                  </div>
                  <div className="mt-1 font-mono text-3xs tabular-nums text-fg-subtle">
                    submitted{" "}
                    {new Date(s.created_at).toLocaleString(undefined, {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    <span className="text-fg-faint"> · </span>
                    event{" "}
                    {new Date(s.event_at).toLocaleString(undefined, {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <StatusBadge state={s.state} />
                  {s.state === "failed_retriable" || s.state === "queued" ? (
                    <div className="flex gap-1">
                      <button className="btn btn-ghost btn-xs gap-1">
                        <RotateCcw className="h-3 w-3" strokeWidth={2} />
                        Retry
                      </button>
                      <button className="btn btn-ghost btn-xs gap-1 text-danger">
                        <Trash2 className="h-3 w-3" strokeWidth={2} />
                        Discard
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
