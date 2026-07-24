"use client";

// ---------------------------------------------------------------------------
// ReportForm — the end-of-run report screen. Loads the run (reusing the
// pick-list query for its item / uom / status), then asks the operator what
// came out: good units (required, hero stepper), bad/thrown units (optional
// stepper), an optional QC block (Brix, pH, sample-taken, note) that NEVER
// blocks submit, and a free note. Submit posts the OUTPUT rows and moves the
// run to REPORTED.
//
// Simple-English-for-Denis discipline: all copy comes from _lib/copy; only
// `output_qty` gates the button. All payload/coercion math lives in
// _lib/report (pure, unit-tested); this component is the thin React shell.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Loader2,
  RotateCw,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/workflow/SectionCard";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { cn } from "@/lib/cn";
import { fmtNumStr } from "@/lib/utils/format-quantity";
import { t } from "../../../../_lib/copy";
import { isRunTerminal, runDisplayName, runStatusMeta } from "../../../../_lib/runs";
import type { PickListResponse } from "../../../../_lib/types";
import {
  buildReportBody,
  isOutputValid,
  type ReportSuccess,
} from "../_lib/report";

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function fetchRun(runId: string): Promise<PickListResponse> {
  const res = await fetch(
    `/api/production-runs/${encodeURIComponent(runId)}/pick-list`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(t("error_load_pick_list"));
  }
  return (await res.json()) as PickListResponse;
}

const STALE = "__STALE__";

/** Clamp-at-zero stepper. Keeps whole numbers whole; otherwise 2dp. */
function step(value: string, delta: number, set: (v: string) => void): void {
  const current = Number(value || "0");
  const base = Number.isFinite(current) ? current : 0;
  const next = Math.max(0, base + delta);
  set(Number.isInteger(next) ? String(next) : next.toFixed(2));
}

export function ReportForm({ runId }: { runId: string }) {
  const qc = useQueryClient();

  const query = useQuery<PickListResponse>({
    queryKey: ["production-runs", "pick-list", runId],
    queryFn: () => fetchRun(runId),
    staleTime: 15_000,
  });
  const data = query.data ?? null;

  // ── form state ─────────────────────────────────────────────────────────
  const [output, setOutput] = useState("");
  const [scrap, setScrap] = useState("0");
  const [qcOpen, setQcOpen] = useState(false);
  const [qcBrix, setQcBrix] = useState("");
  const [qcPh, setQcPh] = useState("");
  const [qcSample, setQcSample] = useState(false);
  const [qcNote, setQcNote] = useState("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(false);

  const outputOk = isOutputValid(output);

  const report = useMutation<ReportSuccess, Error>({
    mutationFn: async () => {
      if (!data) throw new Error(t("error_generic"));
      const body = buildReportBody({
        output,
        scrap,
        outputUom: data.uom,
        qcBrix,
        qcPh,
        qcSampleTaken: qcSample,
        qcNote,
        notes,
        idempotencyKey: newKey(),
        eventAt: new Date().toISOString(),
      });
      const res = await fetch(
        `/api/production-runs/${encodeURIComponent(runId)}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (res.status === 503) throw new Error(t("error_break_glass"));
      if (res.status === 409) {
        const b = (await res.json().catch(() => null)) as
          | { reason_code?: string; detail?: string }
          | null;
        const code = b?.reason_code ?? "";
        if (code.includes("STALE")) throw new Error(STALE);
        if (code === "RUN_ALREADY_REPORTED")
          throw new Error(t("report_err_already"));
        if (code === "RUN_NOT_REPORTABLE")
          throw new Error(t("report_err_not_reportable"));
        throw new Error(b?.detail ?? t("error_generic"));
      }
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as
          | { detail?: string; error?: string }
          | null;
        throw new Error(b?.detail ?? b?.error ?? t("error_generic"));
      }
      return (await res.json()) as ReportSuccess;
    },
    onSuccess: () => {
      setDone(true);
      void qc.invalidateQueries({ queryKey: ["production-runs", "today"] });
      void qc.invalidateQueries({
        queryKey: ["production-runs", "pick-list", runId],
      });
    },
  });

  const isStale = report.error?.message === STALE;

  const liveMessage = query.isLoading
    ? t("loading")
    : query.isError || !data
      ? t("error_load_pick_list")
      : t(runStatusMeta(data.status).labelKey);
  const liveRegion = (
    <span className="sr-only" aria-live="polite" data-testid="report-live">
      {liveMessage}
    </span>
  );

  // ── loading ──────────────────────────────────────────────────────────────
  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        {liveRegion}
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-bg-subtle" />
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 w-full animate-pulse rounded-md bg-bg-subtle" />
          ))}
        </div>
      </div>
    );
  }

  // ── error ──────────────────────────────────────────────────────────────
  if (query.isError || !data) {
    return (
      <div className="mx-auto max-w-2xl">
        {liveRegion}
        <div className="mb-4">
          <Link href="/production" className="btn btn-sm gap-1.5">
            ← {t("pick_done_back_to_runs")}
          </Link>
        </div>
        <div
          className="rounded-md border border-danger/40 bg-danger-softer px-4 py-4 text-sm text-danger-fg"
          role="alert"
          data-testid="report-load-error"
        >
          <div className="font-semibold">{t("error_generic")}</div>
          <div className="mt-1 text-xs opacity-90">
            {(query.error as Error | undefined)?.message}
          </div>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-2 text-xs font-semibold underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            data-testid="report-load-retry"
          >
            {t("error_retry")}
          </button>
        </div>
      </div>
    );
  }

  const status = runStatusMeta(data.status);
  const name = runDisplayName(data);
  const alreadyReported = data.status === "REPORTED";
  const cancelled = data.status === "CANCELLED";

  // ── success ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="mx-auto max-w-2xl">
        {liveRegion}
        <div
          className="reveal card flex flex-col items-center gap-3 px-6 py-12 text-center"
          role="status"
          data-testid="report-success"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-softer text-success">
            <CheckCircle2 className="h-9 w-9" strokeWidth={2} aria-hidden />
          </span>
          <div className="text-xl font-bold text-fg-strong">
            {t("report_success")}
          </div>
          <p className="text-sm text-fg-muted">
            {name} · {fmtNumStr(output)} {data.uom}
          </p>
          <Link
            href="/production"
            className="btn btn-primary btn-lg mt-2"
            data-testid="report-back"
          >
            {t("pick_done_back_to_runs")}
          </Link>
        </div>
      </div>
    );
  }

  // ── terminal: already reported / cancelled — no form ──────────────────────
  if (alreadyReported || cancelled) {
    return (
      <div className="mx-auto max-w-2xl">
        {liveRegion}
        <WorkflowHeader
          size="section"
          backHref="/production"
          backLabel={t("pick_done_back_to_runs")}
          eyebrow={t("report_eyebrow")}
          title={t("report_title")}
        />
        <div
          className="rounded-md border border-border/70 bg-bg-subtle/50 px-4 py-4 text-sm text-fg-muted"
          role="status"
          data-testid="report-already"
        >
          <div className="font-semibold text-fg">
            {cancelled ? t("run_status_cancelled") : t("report_already_title")}
          </div>
          <p className="mt-1">
            {cancelled ? t("pick_terminal_cancelled") : t("report_already_body")}
          </p>
          <Link
            href="/production"
            className="btn btn-primary btn-sm mt-3"
            data-testid="report-already-back"
          >
            {t("pick_done_back_to_runs")}
          </Link>
        </div>
      </div>
    );
  }

  const disableForm = isRunTerminal(data.status) || report.isPending;

  return (
    <div className="mx-auto max-w-2xl pb-4">
      {liveRegion}
      <WorkflowHeader
        size="section"
        backHref={`/production/runs/${encodeURIComponent(runId)}`}
        backLabel={t("pick_done_back_to_runs")}
        eyebrow={t("report_eyebrow")}
        title={t("report_title")}
        meta={
          <>
            <Badge tone={status.tone === "muted" ? "neutral" : status.tone} size="sm">
              {t(status.labelKey)}
            </Badge>
            <span className="text-sm text-fg-muted">
              {name}
              {data.name_he ? (
                <span className="ml-1.5 text-fg-subtle">
                  <bdi>{data.name_he}</bdi>
                </span>
              ) : null}
            </span>
            <span className="inline-flex items-center gap-1 text-sm text-fg-muted">
              {t("pick_target")}
              <span className="font-mono font-semibold tabular-nums text-fg">
                {fmtNumStr(data.target_qty)} {data.uom}
              </span>
            </span>
          </>
        }
      />

      {/* Conflict / error banner */}
      {isStale ? (
        <div
          className="mb-4 rounded-md border border-warning/50 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
          role="alert"
          data-testid="report-stale-banner"
        >
          <div className="font-semibold">{t("error_stale_bom")}</div>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1.5 rounded-sm text-xs font-semibold underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            onClick={() => {
              report.reset();
              void query.refetch();
            }}
            data-testid="report-stale-reload"
          >
            <RotateCw className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            {t("error_retry")}
          </button>
        </div>
      ) : report.isError ? (
        <div
          className="mb-4 rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
          role="alert"
          data-testid="report-submit-error"
        >
          <div>{report.error.message}</div>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1.5 rounded-sm text-xs font-semibold underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            onClick={() => report.mutate()}
            data-testid="report-submit-retry"
          >
            <RotateCw className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            {t("error_retry")}
          </button>
        </div>
      ) : null}

      <form
        data-testid="report-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (outputOk && !report.isPending) report.mutate();
        }}
        className="space-y-4"
      >
        {/* Output — the one required field, hero stepper */}
        <SectionCard>
          <label className="block min-w-0">
            <span className="mb-2 block text-base font-semibold text-fg">
              {t("report_output")}
            </span>
            <div className="flex items-stretch gap-0">
              <button
                type="button"
                className="btn h-14 min-w-[3rem] rounded-r-none border-r-0 px-4 text-2xl font-bold leading-none"
                onClick={() => step(output, -1, setOutput)}
                disabled={disableForm}
                aria-label="Less good units"
                data-testid="report-output-minus"
              >
                −
              </button>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="input h-14 min-w-0 flex-1 rounded-none text-center font-mono text-4xl font-bold tabular-nums"
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                disabled={disableForm}
                data-testid="report-output-qty"
                aria-describedby={outputOk ? undefined : "report-output-hint"}
              />
              <button
                type="button"
                className="btn h-14 min-w-[3rem] rounded-l-none border-l-0 px-4 text-2xl font-bold leading-none"
                onClick={() => step(output, 1, setOutput)}
                disabled={disableForm}
                aria-label="More good units"
                data-testid="report-output-plus"
              >
                +
              </button>
              <span className="ml-3 flex items-center text-sm font-medium text-fg-muted">
                {data.uom}
              </span>
            </div>
            {!outputOk ? (
              <p
                id="report-output-hint"
                className="mt-2 text-xs text-fg-muted"
                data-testid="report-output-hint"
              >
                {t("report_need_output")}
              </p>
            ) : null}
          </label>

          {/* Scrap — optional, smaller stepper */}
          <div className="mt-6 block min-w-0">
            <span className="mb-2 block text-sm font-semibold text-fg">
              {t("report_scrap")}
            </span>
            <div className="flex items-stretch gap-0">
              <button
                type="button"
                className="btn h-12 min-w-[2.75rem] rounded-r-none border-r-0 px-3 text-lg font-bold leading-none"
                onClick={() => step(scrap, -1, setScrap)}
                disabled={disableForm}
                aria-label="Less bad units"
                data-testid="report-scrap-minus"
              >
                −
              </button>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="input h-12 min-w-0 flex-1 rounded-none text-center font-mono text-xl font-semibold tabular-nums"
                value={scrap}
                onChange={(e) => setScrap(e.target.value)}
                disabled={disableForm}
                data-testid="report-scrap-qty"
              />
              <button
                type="button"
                className="btn h-12 min-w-[2.75rem] rounded-l-none border-l-0 px-3 text-lg font-bold leading-none"
                onClick={() => step(scrap, 1, setScrap)}
                disabled={disableForm}
                aria-label="More bad units"
                data-testid="report-scrap-plus"
              >
                +
              </button>
              <span className="ml-3 flex items-center text-sm font-medium text-fg-muted">
                {data.uom}
              </span>
            </div>
          </div>
        </SectionCard>

        {/* QC — always optional, collapsible. NEVER blocks submit. */}
        <SectionCard
          density="compact"
          title={
            <span className="inline-flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-info" strokeWidth={2} aria-hidden />
              {t("report_qc_heading")}
            </span>
          }
          actions={
            <button
              type="button"
              className="btn btn-ghost btn-xs text-accent"
              onClick={() => setQcOpen((v) => !v)}
              aria-expanded={qcOpen}
              aria-controls="report-qc-panel"
              data-testid="report-qc-toggle"
            >
              {qcOpen ? t("pick_cancel") : t("run_open")}
            </button>
          }
        >
          {qcOpen ? (
            <div id="report-qc-panel" className="space-y-4" data-testid="report-qc-panel">
              <p className="text-xs text-fg-muted">{t("report_qc_hint")}</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block min-w-0">
                  <span className="mb-1 block text-sm font-medium text-fg">
                    {t("report_brix")}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    className="input h-12 w-full font-mono tabular-nums"
                    value={qcBrix}
                    onChange={(e) => setQcBrix(e.target.value)}
                    disabled={disableForm}
                    data-testid="report-qc-brix"
                  />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1 block text-sm font-medium text-fg">
                    {t("report_ph")}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    className="input h-12 w-full font-mono tabular-nums"
                    value={qcPh}
                    onChange={(e) => setQcPh(e.target.value)}
                    disabled={disableForm}
                    data-testid="report-qc-ph"
                  />
                </label>
              </div>
              <label
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-md border px-4 py-3 transition-colors",
                  qcSample
                    ? "border-success/40 bg-success-softer/40"
                    : "border-border/70 bg-bg-subtle/40",
                )}
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-fg">
                  <ClipboardCheck
                    className={cn("h-4 w-4", qcSample ? "text-success" : "text-fg-subtle")}
                    strokeWidth={2}
                    aria-hidden
                  />
                  {t("report_sample_taken")}
                </span>
                <input
                  type="checkbox"
                  className="h-6 w-6 accent-accent"
                  checked={qcSample}
                  onChange={(e) => setQcSample(e.target.checked)}
                  disabled={disableForm}
                  data-testid="report-qc-sample"
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-sm font-medium text-fg">
                  {t("report_qc_note")}
                </span>
                <input
                  type="text"
                  className="input h-12 w-full"
                  value={qcNote}
                  onChange={(e) => setQcNote(e.target.value)}
                  disabled={disableForm}
                  data-testid="report-qc-note"
                />
              </label>
            </div>
          ) : (
            <p className="text-sm text-fg-muted">{t("report_qc_hint")}</p>
          )}
        </SectionCard>

        {/* Notes — optional */}
        <SectionCard density="compact">
          <label className="block min-w-0">
            <span className="mb-2 block text-sm font-semibold text-fg">
              {t("report_notes")}
            </span>
            <textarea
              className="input min-h-[3rem] w-full"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={disableForm}
              placeholder={t("report_notes_ph")}
              data-testid="report-notes"
            />
          </label>
        </SectionCard>

        {/* Sticky submit */}
        <div
          className="sticky bottom-0 left-0 right-0 z-30 -mx-4 mt-6 border-t border-border bg-bg/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm sm:-mx-6 sm:px-6"
          data-testid="report-bar"
        >
          <button
            type="submit"
            disabled={!outputOk || report.isPending}
            aria-disabled={!outputOk || report.isPending}
            aria-describedby={!outputOk ? "report-output-hint" : undefined}
            data-testid="report-submit"
            className={cn(
              "btn btn-lg w-full gap-2 text-base",
              outputOk
                ? "btn-primary"
                : "cursor-not-allowed border-border bg-bg-subtle text-fg-subtle hover:bg-bg-subtle",
            )}
          >
            {report.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                {t("report_saving")}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                {t("report_submit")}
              </>
            )}
          </button>
          {!outputOk ? (
            <p className="mt-1.5 text-center text-xs text-fg-muted">
              {t("report_need_output")}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
