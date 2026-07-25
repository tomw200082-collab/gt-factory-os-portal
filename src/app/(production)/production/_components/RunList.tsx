"use client";

// ---------------------------------------------------------------------------
// RunList — /production landing orchestrator. Loads today's runs, renders them
// in work order as RunCards, and hosts the "start an extra run" dialog. Full
// loading / error / empty triad; simple English throughout (Denis reads
// English poorly). Errors are inline danger cards with a Try-again refetch —
// no toast lib.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, PackageOpen, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { t } from "../_lib/copy";
import { autoForwardRunId, planRuns, sortRuns } from "../_lib/runs";
import type { ProductionRunsTodayResponse } from "../_lib/types";
import { RunCard } from "./RunCard";
import { UnplannedRunDialog } from "./UnplannedRunDialog";

/** Earliest day worth browsing — the factory has no production data before
 *  the system was in use. */
const SYSTEM_START_DATE = "2026-04-01";

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
    throw new Error(t("error_load_runs"));
  }
  return (await res.json()) as ProductionRunsTodayResponse;
}

export function RunList() {
  const router = useRouter();
  const params = useSearchParams();
  const today = useMemo(() => todayYmd(), []);

  // ?date= lets the operator work a past day — reporting production after the
  // fact is normal here, so the list is never pinned to today (tranche 147).
  const date = params.get("date") || today;
  // ?plan= scopes the list to one production plan's runs; ?report=1 asks to go
  // straight to the report form when that plan resolves to a single run.
  const planId = params.get("plan");
  const wantsReport = params.get("report") === "1";

  const [dialogOpen, setDialogOpen] = useState(false);

  const query = useQuery<ProductionRunsTodayResponse>({
    queryKey: ["production-runs", "today", date],
    queryFn: () => fetchTodayRuns(date),
    staleTime: 15_000,
  });

  const allRows = useMemo(() => sortRuns(query.data?.rows ?? []), [query.data]);
  const rows = useMemo(() => planRuns(allRows, planId), [allRows, planId]);

  // Single-item plan → one reportable run → open its report directly, which is
  // what "Report production" on the plan card promises. `replace` keeps the
  // back button pointing at the plan, not at this transient list.
  const forwardTo = wantsReport && planId ? autoForwardRunId(rows) : null;
  useEffect(() => {
    if (forwardTo) {
      router.replace(
        `/production/runs/${encodeURIComponent(forwardTo)}/report${date !== today ? `?date=${encodeURIComponent(date)}` : ""}`,
      );
    }
  }, [forwardTo, router, date, today]);

  const isBackDated = date !== today;

  return (
    <div data-testid="production-today" className="mx-auto max-w-2xl">
      <WorkflowHeader
        size="section"
        eyebrow={t("today_eyebrow")}
        title={isBackDated ? t("day_title_past") : t("today_title")}
        description={isBackDated ? t("day_subtitle_past") : t("today_subtitle")}
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

      {/* Day switcher — the operator reports a day that already happened by
          changing this date, so back-dated reporting never dead-ends. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label
          htmlFor="production-day"
          className="text-sm font-medium text-fg-muted"
        >
          {t("day_picker_label")}
        </label>
        <input
          id="production-day"
          type="date"
          className="input h-14 min-w-[9rem]"
          value={date}
          // Today is the practical ceiling for browsing, but a plan made ahead
          // of its date links here with a future date — accept the value it
          // arrived with rather than rendering the field out of range.
          max={date > today ? date : today}
          // Nothing was produced before the system existed; without a floor the
          // picker happily scrolls to 1999 and lands on an empty state that
          // reads like a data problem rather than an out-of-range date.
          min={SYSTEM_START_DATE}
          onChange={(e) => {
            const next = e.target.value || today;
            // Changing the day drops the plan scope — it belongs to one date.
            router.replace(next === today ? "/production" : `/production?date=${next}`);
          }}
          data-testid="production-day-picker"
        />
        {isBackDated ? (
          <button
            type="button"
            className="btn h-14"
            onClick={() => router.replace("/production")}
            data-testid="production-day-today"
          >
            {t("day_back_to_today")}
          </button>
        ) : null}
      </div>

      {planId && rows.length > 0 ? (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-bg-subtle/50 px-4 py-3 text-sm"
          data-testid="production-plan-scope"
        >
          <span className="text-fg-muted">{t("day_plan_scope")}</span>
          <button
            type="button"
            className="btn h-11"
            onClick={() =>
              router.replace(date === today ? "/production" : `/production?date=${date}`)
            }
            data-testid="production-plan-scope-clear"
          >
            {t("day_plan_scope_clear")}
          </button>
        </div>
      ) : null}

      {/* Persistent SR status — always mounted so its text update is announced
          even after the ephemeral skeleton unmounts (A11Y-009). */}
      <span className="sr-only" aria-live="polite" data-testid="production-today-live">
        {forwardTo
          ? t("day_opening_report")
          : query.isLoading
            ? t("loading")
            : query.isError
              ? t("error_load_runs")
              : isBackDated
                ? t("day_subtitle_past")
                : t("today_subtitle")}
      </span>

      {/* Loading */}
      {forwardTo ? (
        /* Mid-forward. Showing the list for the frame before the redirect
           lands would flash a screen the operator never asked for — this is
           the plan card's "Report production" journey, so say what is
           happening instead. */
        <div
          className="card flex flex-col items-center gap-3 px-6 py-12 text-center"
          role="status"
          data-testid="production-forwarding"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent motion-reduce:animate-none" aria-hidden />
          <p className="text-sm text-fg-muted">{t("day_opening_report")}</p>
        </div>
      ) : query.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 w-full animate-pulse rounded-md bg-bg-subtle motion-reduce:animate-none"
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
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
            <CalendarClock className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="text-lg font-bold text-fg-strong">
            {planId
              ? t("day_empty_plan_title")
              : isBackDated
                ? t("day_empty_past_title")
                : t("today_empty_title")}
          </div>
          <p className="max-w-xs text-sm text-fg-muted">
            {planId
              ? t("day_empty_plan_body")
              : isBackDated
                ? t("day_empty_past_body")
                : t("today_empty_body")}
          </p>
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
              <RunCard run={run} index={index} date={isBackDated ? date : undefined} />
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
