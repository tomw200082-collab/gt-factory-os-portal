"use client";

// ---------------------------------------------------------------------------
// RunList — /production landing orchestrator. Loads today's runs, renders them
// in work order as RunCards, and hosts the "start an extra run" dialog. Full
// loading / error / empty triad; simple English throughout (Denis reads
// English poorly). Errors are inline danger cards with a Try-again refetch —
// no toast lib.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { CalendarClock, PackageOpen, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { t } from "../_lib/copy";
import { sortRuns } from "../_lib/runs";
import type { ProductionRunsTodayResponse } from "../_lib/types";
import { RunCard } from "./RunCard";
import { UnplannedRunDialog } from "./UnplannedRunDialog";

/** Local calendar date as YYYY-MM-DD (the backend keys "today" on the operator
 *  timezone, not UTC). */
function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function fetchTodayRuns(date: string): Promise<ProductionRunsTodayResponse> {
  const res = await fetch(
    `/api/production-runs/today?date=${encodeURIComponent(date)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(
      `Could not load today's runs (HTTP ${res.status}). Check your connection and try again.`,
    );
  }
  return (await res.json()) as ProductionRunsTodayResponse;
}

export function RunList() {
  const date = useMemo(() => todayYmd(), []);
  const [dialogOpen, setDialogOpen] = useState(false);

  const query = useQuery<ProductionRunsTodayResponse>({
    queryKey: ["production-runs", "today", date],
    queryFn: () => fetchTodayRuns(date),
    staleTime: 15_000,
  });

  const rows = useMemo(() => sortRuns(query.data?.rows ?? []), [query.data]);

  return (
    <div data-testid="production-today" className="mx-auto max-w-2xl">
      <WorkflowHeader
        size="section"
        eyebrow={t("today_eyebrow")}
        title={t("today_title")}
        description={t("today_subtitle")}
        actions={
          <button
            type="button"
            className="btn btn-sm gap-1.5"
            onClick={() => setDialogOpen(true)}
            data-testid="unplanned-run-open"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            {t("unplanned_button")}
          </button>
        }
      />

      {/* Loading */}
      {query.isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 w-full animate-pulse rounded-md bg-bg-subtle"
            />
          ))}
        </div>
      ) : query.isError ? (
        /* Error */
        <div
          className="rounded-md border border-danger/40 bg-danger-softer px-4 py-4 text-sm text-danger-fg"
          role="alert"
          data-testid="production-today-error"
        >
          <div className="font-semibold">{t("error_generic")}</div>
          <div className="mt-1 text-xs opacity-90">
            {(query.error as Error).message}
          </div>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-2 text-xs font-semibold underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            data-testid="production-today-retry"
          >
            {t("error_retry")}
          </button>
        </div>
      ) : rows.length === 0 ? (
        /* Empty — invites, does not dead-end */
        <div
          className="card flex flex-col items-center gap-3 px-6 py-12 text-center"
          data-testid="production-today-empty"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <CalendarClock className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="text-lg font-bold text-fg-strong">
            {t("today_empty_title")}
          </div>
          <p className="max-w-xs text-sm text-fg-muted">{t("today_empty_body")}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm mt-1 gap-1.5"
            onClick={() => setDialogOpen(true)}
            data-testid="unplanned-run-open-empty"
          >
            <PackageOpen className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            {t("unplanned_button")}
          </button>
        </div>
      ) : (
        /* Ordered work order */
        <ul className="space-y-3" data-testid="run-list">
          {rows.map((run, index) => (
            <li key={run.run_id}>
              <RunCard run={run} index={index} />
            </li>
          ))}
        </ul>
      )}

      <UnplannedRunDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        todayDate={date}
      />
    </div>
  );
}
