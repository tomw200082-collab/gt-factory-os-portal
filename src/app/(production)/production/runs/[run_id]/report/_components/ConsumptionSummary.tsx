"use client";

// ---------------------------------------------------------------------------
// ConsumptionSummary — what this report is about to take off stock, shown
// between entering the quantity and posting it (Tom, 2026-07-27).
//
// Deliberately NOT a new screen and NOT an extra tap: the report already had a
// two-step confirm, and this fills that step. The operator taps "Finish run",
// reads what moves, and taps again. One-handed on a phone, same as before.
//
// Two things can need an answer before the second tap:
//   • a material the projection says is empty — ticking "it really was used"
//     lets the balance go below zero, which is the honest state when units are
//     made before their packaging has been booked in;
//   • a collected quantity a factor of two or more away from the recipe, which
//     is more often a typed digit than a real over-take, so it asks why.
//
// Everything else just reads. The numbers come from the same reconciliation the
// report itself runs, so what is shown is what posts.
// ---------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { fmtNumStr } from "@/lib/utils/format-quantity";
import { t } from "../../../../_lib/copy";
import type {
  ConsumptionPreview,
  ConsumptionPreviewLine,
} from "../_lib/report";

export function lineKey(l: { source: string; component_id: string }): string {
  return `${l.source}:${l.component_id}`;
}

async function fetchPreview(
  runId: string,
  outputQty: string,
): Promise<ConsumptionPreview> {
  const res = await fetch(
    `/api/production-runs/${encodeURIComponent(runId)}/consumption-preview` +
      `?output_qty=${encodeURIComponent(outputQty)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as ConsumptionPreview;
}

export function useConsumptionPreview(
  runId: string,
  outputQty: string,
  enabled: boolean,
) {
  return useQuery<ConsumptionPreview, Error>({
    queryKey: ["production-run", runId, "consumption-preview", outputQty],
    queryFn: () => fetchPreview(runId, outputQty),
    enabled,
    staleTime: 0,
  });
}

function Row({
  line,
  confirmedNegative,
  explanation,
  onConfirmNegative,
  onExplain,
}: {
  line: ConsumptionPreviewLine;
  confirmedNegative: boolean;
  explanation: string;
  onConfirmNegative: (v: boolean) => void;
  onExplain: (v: string) => void;
}) {
  const key = lineKey(line);
  // Ticking the confirm is what decides the number: unticked, the take stops
  // at what stock says is there.
  const comesOff = line.would_go_negative && !confirmedNegative
    ? line.capped_qty
    : line.wanted_qty;
  const leftAfter = line.would_go_negative && !confirmedNegative
    ? "0"
    : line.on_hand_after_qty;
  const explainMissing = line.needs_explanation && explanation.trim() === "";

  return (
    <li className="px-3 py-2.5" data-testid={`summary-row-${line.component_id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
          {line.component_name ?? line.component_id}
        </span>
        <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-fg-strong">
          −{fmtNumStr(comesOff)}{" "}
          <span className="font-sans text-2xs font-normal text-fg-muted">
            {line.uom}
          </span>
        </span>
      </div>

      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-2xs">
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 font-semibold uppercase tracking-sops",
            line.basis === "PICKED"
              ? "bg-info-softer text-info-fg"
              : "bg-bg-subtle text-fg-muted",
          )}
        >
          {line.basis === "PICKED"
            ? t("summary_basis_picked")
            : t("summary_basis_recipe")}
        </span>
        {/* The cross-check: what was collected against what the finished
            product says was needed. Only meaningful when both exist. */}
        {line.picked_qty !== null && line.required_qty !== null ? (
          <span className="truncate text-fg-muted">
            {fmtNumStr(line.picked_qty)} {t("summary_collected_vs")} ·{" "}
            {fmtNumStr(line.required_qty)} {t("summary_recipe_vs")}
          </span>
        ) : null}
        <span className="shrink-0 font-mono tabular-nums text-fg-muted">
          {t("summary_col_left")} {fmtNumStr(leftAfter)}
        </span>
      </div>

      {line.would_go_negative ? (
        <div className="mt-2 rounded-md border border-warning/50 bg-warning-softer px-2.5 py-2">
          <div className="flex items-start gap-1.5 text-2xs font-semibold text-warning-fg">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("summary_negative_title")}
          </div>
          <label className="mt-1.5 flex items-start gap-2 text-xs text-fg">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--warning)]"
              checked={confirmedNegative}
              onChange={(e) => onConfirmNegative(e.target.checked)}
              data-testid={`summary-negative-${line.component_id}`}
            />
            <span>
              <span className="font-medium">{t("summary_negative_ask")}</span>
              <span className="mt-0.5 block text-2xs text-fg-muted">
                {confirmedNegative
                  ? t("summary_negative_help")
                  : t("summary_negative_skip")}
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {line.needs_explanation ? (
        <div
          className={cn(
            "mt-2 rounded-md border px-2.5 py-2",
            explainMissing
              ? "border-danger/50 bg-danger-softer"
              : "border-border bg-bg-subtle",
          )}
        >
          <label
            htmlFor={`summary-explain-${key}`}
            className="block text-2xs font-semibold text-fg"
          >
            {t("summary_explain_title")} — {t("summary_explain_ask")}
          </label>
          <input
            id={`summary-explain-${key}`}
            type="text"
            value={explanation}
            onChange={(e) => onExplain(e.target.value)}
            placeholder={t("summary_explain_placeholder")}
            className="input mt-1 h-9 w-full text-sm"
            data-testid={`summary-explain-input-${line.component_id}`}
          />
        </div>
      ) : null}
    </li>
  );
}

export function ConsumptionSummary({
  preview,
  isLoading,
  isError,
  confirmedNegatives,
  explanations,
  onConfirmNegative,
  onExplain,
}: {
  preview: ConsumptionPreview | undefined;
  isLoading: boolean;
  isError: boolean;
  confirmedNegatives: Record<string, boolean>;
  explanations: Record<string, string>;
  onConfirmNegative: (key: string, v: boolean) => void;
  onExplain: (key: string, v: string) => void;
}) {
  if (isLoading) {
    return (
      <div
        className="mb-2 flex items-center justify-center gap-2 rounded-md border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted"
        data-testid="summary-loading"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {t("summary_loading")}
      </div>
    );
  }

  // A preview that will not load must never trap the operator on the floor:
  // the run still finishes, the backend still reconciles, the summary is the
  // only thing lost.
  if (isError || !preview) {
    return (
      <div
        className="mb-2 rounded-md border border-border bg-bg-subtle px-4 py-3 text-xs text-fg-muted"
        role="status"
        data-testid="summary-error"
      >
        {t("summary_error")}
      </div>
    );
  }

  if (preview.lines.length === 0) {
    return (
      <div
        className="mb-2 rounded-md border border-border bg-bg-subtle px-4 py-3 text-xs text-fg-muted"
        data-testid="summary-empty"
      >
        {t("summary_empty")}
      </div>
    );
  }

  return (
    <div
      className="mb-2 overflow-hidden rounded-md border border-border bg-bg"
      data-testid="consumption-summary"
    >
      <div className="border-b border-border bg-bg-subtle px-3 py-2 text-2xs font-semibold uppercase tracking-sops text-fg-muted">
        {t("summary_title")}
      </div>
      <ul className="max-h-[45vh] divide-y divide-border overflow-y-auto">
        {preview.lines.map((line) => {
          const key = lineKey(line);
          return (
            <Row
              key={key}
              line={line}
              confirmedNegative={confirmedNegatives[key] ?? false}
              explanation={explanations[key] ?? ""}
              onConfirmNegative={(v) => onConfirmNegative(key, v)}
              onExplain={(v) => onExplain(key, v)}
            />
          );
        })}
      </ul>
    </div>
  );
}
