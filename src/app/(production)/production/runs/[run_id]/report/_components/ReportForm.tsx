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
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Loader2,
  Minus,
  Plus,
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
    `/api/production-runs/${encodeURIComponent(runId)}/pick-list?intent=report`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(t("error_load_pick_list"));
  }
  return (await res.json()) as PickListResponse;
}

const STALE = "__STALE__";

/** The planned quantity to pre-fill the output field with, as a plain string.
 *  Empty when the run has not loaded or carries no usable target, so the field
 *  falls back to blank rather than showing "0" or "NaN". */
function plannedOutput(data: PickListResponse | null): string {
  const n = Number(data?.target_qty ?? "");
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

/** Clamp-at-zero stepper. Keeps whole numbers whole; otherwise 2dp. */
function step(value: string, delta: number, set: (v: string) => void): void {
  const current = Number(value || "0");
  const base = Number.isFinite(current) ? current : 0;
  const next = Math.max(0, base + delta);
  set(Number.isInteger(next) ? String(next) : next.toFixed(2));
}

export function ReportForm({ runId }: { runId: string }) {
  const qc = useQueryClient();
  const params = useSearchParams();

  // Reporting an earlier day is a run of several reports, not one — a base
  // batch is a tank plus one pack run per product. Carrying ?date= through
  // means "back" returns to that day's list instead of dumping the operator
  // on today after every single report (tranche 147).
  const backDate = params.get("date");
  const backHref = backDate ? `/production?date=${encodeURIComponent(backDate)}` : "/production";
  const backLabel = backDate ? t("day_back_to_that_day") : t("pick_done_back_to_runs");

  const query = useQuery<PickListResponse>({
    queryKey: ["production-runs", "pick-list", runId],
    queryFn: () => fetchRun(runId),
    staleTime: 15_000,
  });
  const data = query.data ?? null;

  // ── form state ─────────────────────────────────────────────────────────
  // Output shows the planned quantity until the operator types (tranche 147):
  // the usual case is "we made what we planned", so this is a confirm, not a
  // transcription. `null` means untouched — deriving the shown value instead
  // of seeding state keeps a cleared field cleared, and never overwrites an
  // edit when the run query refetches. It is a starting point, never an
  // assumption: what the operator submits is what actually came out.
  const [outputEdit, setOutput] = useState<string | null>(null);
  const [scrap, setScrap] = useState("0");
  const [qcOpen, setQcOpen] = useState(false);
  const [qcBrix, setQcBrix] = useState("");
  const [qcPh, setQcPh] = useState("");
  const [qcSample, setQcSample] = useState(false);
  const [qcNote, setQcNote] = useState("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(false);
  // Two-step confirm on the only action that moves stock. Not a modal — Denis
  // works one-handed on a phone and a dialog here would be one more thing to
  // dismiss; the submit bar itself becomes the question.
  const [confirming, setConfirming] = useState(false);

  const output = outputEdit ?? plannedOutput(data);
  const outputOk = isOutputValid(output);
  const isPlannedValue = outputEdit === null && output !== "";

  /** Changing the number drops out of the confirm — the operator is no longer
   *  agreeing to the figure they were shown. */
  function changeOutput(v: string): void {
    setOutput(v);
    setConfirming(false);
  }

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

  const liveMessage = done
    ? t("report_success")
    : report.isPending
      ? t("report_saving")
      : confirming
        ? `${t("report_confirm_ask")} ${output} ${data?.uom ?? ""} — ${t("report_confirm_undo")}`
        : query.isLoading
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
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-bg-subtle motion-reduce:animate-none" />
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 w-full animate-pulse rounded-md bg-bg-subtle motion-reduce:animate-none" />
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
          <Link href={backHref} className="btn btn-sm gap-1.5">
            ← {backLabel}
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
          {/* Server-confirmed values (report.data), not the raw form state —
              shows what actually posted. */}
          <p className="text-sm text-fg-muted">
            {name} ·{" "}
            {fmtNumStr(String(report.data?.output_qty ?? output))}{" "}
            {report.data?.output_uom ?? data.uom}
          </p>
          {/* Stale-projection signal. Not an error — the report succeeded —
              but the operator is the only person here who can tell the planner
              the shelf did not match the system. */}
          {report.data?.shortfalls?.length ? (
            <div
              className="mt-2 w-full rounded-md border border-warning/50 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
              data-testid="report-shortfalls"
            >
              {t("report_shortfall_note")}
            </div>
          ) : null}

          <div className="mt-2 flex flex-col items-center gap-2">
            <Link
              href={backHref}
              className="btn btn-primary btn-lg"
              data-testid="report-back"
            >
              {t("pick_done_back_to_runs")}
            </Link>
            {/* Closes the loop Tom described: the plan card is where this
                journey started, and it is where the reported quantity and the
                variance against plan now show. */}
            {report.data?.linked_plan_id ? (
              <Link
                href={`/planning/production-plan?focus_plan=${encodeURIComponent(report.data.linked_plan_id)}`}
                className="btn btn-ghost btn-sm"
                data-testid="report-back-to-plan"
              >
                {t("report_back_to_plan")}
              </Link>
            ) : null}
          </div>
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
          backHref={backHref}
          backLabel={backLabel}
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
            href={backHref}
            className="btn btn-primary btn-sm mt-3"
            data-testid="report-already-back"
          >
            {backLabel}
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
        backHref={backHref}
        backLabel={backLabel}
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
          if (!outputOk || report.isPending) return;
          // First submit asks; only the explicit second one posts.
          if (!confirming) {
            setConfirming(true);
            return;
          }
          report.mutate();
        }}
        className="space-y-4"
      >
        {/* Output — the one required field, hero stepper */}
        <SectionCard>
          <div className="block min-w-0">
            <label
              htmlFor="report-output-qty"
              className="mb-2 block text-base font-semibold text-fg"
            >
              {t("report_output")}
            </label>
            <div className="flex items-stretch gap-0">
              <button
                type="button"
                className="btn h-14 min-w-12 rounded-r-none border-r-0 px-4"
                onClick={() => step(output, -1, changeOutput)}
                disabled={disableForm}
                aria-label="Less good units"
                data-testid="report-output-minus"
              >
                <Minus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
              </button>
              <input
                id="report-output-qty"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                className="input h-14 min-w-0 flex-1 rounded-none text-center font-mono text-4xl font-bold tabular-nums"
                value={output}
                onChange={(e) => changeOutput(e.target.value)}
                disabled={disableForm}
                data-testid="report-output-qty"
                aria-describedby={
                !outputOk
                  ? "report-output-hint"
                  : isPlannedValue
                    ? "report-output-prefilled"
                    : undefined
              }
              />
              <button
                type="button"
                className="btn h-14 min-w-12 rounded-l-none border-l-0 px-4"
                onClick={() => step(output, 1, changeOutput)}
                disabled={disableForm}
                aria-label="More good units"
                data-testid="report-output-plus"
              >
                <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
            <div className="mt-1 text-center text-sm font-medium text-fg-muted">
              {data.uom}
            </div>
            {!outputOk ? (
              <p
                id="report-output-hint"
                className="mt-2 text-center text-xs text-fg-muted"
                data-testid="report-output-hint"
              >
                {t("report_need_output")}
              </p>
            ) : isPlannedValue ? (
              /* Say plainly that this number is the plan, not a measurement —
                 an unlabelled pre-filled figure invites a blind confirm. */
              <p
                id="report-output-prefilled"
                className="mt-2 text-center text-xs text-fg-muted"
                data-testid="report-output-prefilled"
              >
                {t("report_output_prefilled")}
              </p>
            ) : null}
          </div>

          {/* Scrap — optional, smaller stepper */}
          <div className="mt-6 block min-w-0">
            <label
              htmlFor="report-scrap-qty"
              className="mb-2 block text-sm font-semibold text-fg"
            >
              {t("report_scrap")}
            </label>
            <div className="flex items-stretch gap-0">
              <button
                type="button"
                className="btn h-12 min-w-11 rounded-r-none border-r-0 px-3"
                onClick={() => step(scrap, -1, setScrap)}
                disabled={disableForm}
                aria-label="Less bad units"
                data-testid="report-scrap-minus"
              >
                <Minus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              </button>
              <input
                id="report-scrap-qty"
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
                className="btn h-12 min-w-11 rounded-l-none border-l-0 px-3"
                onClick={() => step(scrap, 1, setScrap)}
                disabled={disableForm}
                aria-label="More bad units"
                data-testid="report-scrap-plus"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
            <div className="mt-1 text-center text-sm font-medium text-fg-muted">
              {data.uom}
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
              aria-controls={qcOpen ? "report-qc-panel" : undefined}
              data-testid="report-qc-toggle"
            >
              {qcOpen ? t("report_qc_close") : t("run_open")}
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
              className="textarea min-h-12 w-full"
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
          {/* The confirm names the product and the number, so the operator
              checks the figure rather than the sentence. */}
          {confirming && !report.isPending ? (
            <div
              className="mb-2 rounded-md border border-warning/50 bg-warning-softer px-4 py-3 text-center"
              role="status"
              data-testid="report-confirm"
            >
              <div className="text-sm font-semibold text-warning-fg">
                {t("report_confirm_ask")}
              </div>
              <div className="mt-1 font-mono text-lg font-bold tabular-nums text-fg-strong">
                {fmtNumStr(output)} {data.uom}
                <span className="ml-1.5 font-sans text-sm font-medium text-fg-muted">
                  {name}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-warning-fg">
                {t("report_confirm_undo")}
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!outputOk || report.isPending}
            aria-disabled={!outputOk || report.isPending}
            aria-describedby={!outputOk ? "report-output-hint" : "report-stock-note"}
            title={!outputOk ? t("report_need_output") : undefined}
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
                {confirming ? t("report_confirm_yes") : t("report_submit")}
              </>
            )}
          </button>
          {confirming && !report.isPending ? (
            <button
              type="button"
              className="btn btn-lg mt-2 w-full"
              onClick={() => setConfirming(false)}
              data-testid="report-confirm-no"
            >
              {t("report_confirm_no")}
            </button>
          ) : null}
          <p id="report-stock-note" className="mt-1.5 text-center text-xs text-fg-muted">
            {!outputOk ? t("report_need_output") : t("report_stock_note")}
          </p>
        </div>
      </form>
    </div>
  );
}
