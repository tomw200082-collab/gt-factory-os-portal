"use client";

// ---------------------------------------------------------------------------
// PickList — the stage-aware picking screen orchestrator. Loads the run's
// BOM-exploded pick list, owns the per-row resolution map + the resolve-gate,
// and fires the stock-decrementing pick-confirm. Liquids are grouped above
// packaging. Physical truth wins: shortage/excess flag but never block.
//
// All display copy comes from _lib/copy (simple English). All gate math +
// payload building come from _lib/pick (pure, unit-tested). This component is
// the thin React shell over them.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Droplets, Loader2, Package, RotateCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/Badge";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { fmtNumStr } from "@/lib/utils/format-quantity";
import { t } from "../../../_lib/copy";
import {
  isRunActive,
  isRunTerminal,
  runDisplayName,
  runStatusMeta,
  stageHeadingKey,
  stageKindKey,
} from "../../../_lib/runs";
import type { PickListResponse } from "../../../_lib/types";
import {
  buildConfirmBody,
  confirmResolution,
  editResolution,
  groupPickLines,
  lineKey,
  notCollectedResolution,
  resolvedCount,
  type ResolutionMap,
} from "../_lib/pick";
import { AddMaterialControl } from "./AddMaterialControl";
import { DoneBar } from "./DoneBar";
import { EditQtySheet } from "./EditQtySheet";
import { PickRow } from "./PickRow";
import type { PickListLine } from "../../../_lib/types";

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function fetchPickList(runId: string): Promise<PickListResponse> {
  const res = await fetch(
    `/api/production-runs/${encodeURIComponent(runId)}/pick-list`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(
      `Could not load the material list (HTTP ${res.status}). Check your connection and try again.`,
    );
  }
  return (await res.json()) as PickListResponse;
}

const STALE = "__STALE__";

export function PickList({ runId }: { runId: string }) {
  const qc = useQueryClient();
  const [resolutions, setResolutions] = useState<ResolutionMap>({});
  const [editingLine, setEditingLine] = useState<PickListLine | null>(null);
  const [done, setDone] = useState(false);

  const query = useQuery<PickListResponse>({
    queryKey: ["production-runs", "pick-list", runId],
    queryFn: () => fetchPickList(runId),
    staleTime: 15_000,
  });

  const data = query.data ?? null;
  const lines = useMemo(() => data?.lines ?? [], [data]);
  const grouped = useMemo(() => groupPickLines(lines), [lines]);
  const resolved = resolvedCount(lines, resolutions);

  const confirm = useMutation<{ run_status: string }, Error>({
    mutationFn: async () => {
      if (!data) throw new Error(t("error_generic"));
      const body = buildConfirmBody({
        lines: data.lines,
        resolutions,
        packBomVersionId: data.pack_bom_version_id,
        baseBomVersionId: data.base_bom_version_id,
        idempotencyKey: newKey(),
        eventAt: new Date().toISOString(),
      });
      const res = await fetch(
        `/api/production-runs/${encodeURIComponent(runId)}/pick-confirm`,
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
        throw new Error(b?.detail ?? t("error_generic"));
      }
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as
          | { detail?: string; error?: string }
          | null;
        throw new Error(b?.detail ?? b?.error ?? t("error_generic"));
      }
      return (await res.json()) as { run_status: string };
    },
    onSuccess: () => {
      setDone(true);
      void qc.invalidateQueries({ queryKey: ["production-runs", "today"] });
      void qc.invalidateQueries({ queryKey: ["production-runs", "pick-list", runId] });
    },
  });

  const isStale = confirm.error?.message === STALE;

  // ── loading ────────────────────────────────────────────────────────────
  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-bg-subtle" />
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 w-full animate-pulse rounded-md bg-bg-subtle" />
          ))}
        </div>
      </div>
    );
  }

  // ── error ──────────────────────────────────────────────────────────────
  if (query.isError || !data) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <Link href="/production" className="btn btn-sm gap-1.5">
            ← {t("pick_done_back_to_runs")}
          </Link>
        </div>
        <div
          className="rounded-md border border-danger/40 bg-danger-softer px-4 py-4 text-sm text-danger-fg"
          role="alert"
          data-testid="pick-list-error"
        >
          <div className="font-semibold">{t("error_generic")}</div>
          <div className="mt-1 text-xs opacity-90">
            {(query.error as Error | undefined)?.message}
          </div>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-2 text-xs font-semibold underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            data-testid="pick-list-retry"
          >
            {t("error_retry")}
          </button>
        </div>
      </div>
    );
  }

  const status = runStatusMeta(data.status);
  const terminal = isRunTerminal(data.status);
  const active = isRunActive(data.status);
  const name = runDisplayName(data);

  // ── success ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="mx-auto max-w-2xl">
        <div
          className="reveal card flex flex-col items-center gap-3 px-6 py-12 text-center"
          role="status"
          data-testid="pick-done-success"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success-softer text-success">
            <CheckCircle2 className="h-9 w-9" strokeWidth={2} aria-hidden />
          </span>
          <div className="text-xl font-bold text-fg-strong">
            {t("pick_done_success")}
          </div>
          <p className="text-sm text-fg-muted">
            {name} · {fmtNumStr(data.target_qty)} {data.uom}
          </p>
          <Link
            href="/production"
            className="btn btn-primary btn-lg mt-2"
            data-testid="pick-done-back"
          >
            {t("pick_done_back_to_runs")}
          </Link>
        </div>
      </div>
    );
  }

  const renderGroup = (label: string, icon: React.ReactNode, groupLines: PickListLine[]) => {
    if (groupLines.length === 0) return null;
    const showHeading = grouped.liquids.length > 0 && grouped.packaging.length > 0;
    return (
      <div className="space-y-2.5">
        {showHeading ? (
          <div className="flex items-center gap-2 px-1 pt-2">
            {icon}
            <span className="text-2xs font-semibold uppercase tracking-sops text-fg-subtle">
              {label}
            </span>
            <span className="text-2xs text-fg-faint">({groupLines.length})</span>
          </div>
        ) : null}
        {groupLines.map((line) => (
          <PickRow
            key={lineKey(line)}
            line={line}
            resolution={resolutions[lineKey(line)]}
            disabled={terminal}
            onConfirm={() =>
              setResolutions((prev) => ({
                ...prev,
                [lineKey(line)]: confirmResolution(line),
              }))
            }
            onEdit={() => setEditingLine(line)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-2xl pb-4">
      <WorkflowHeader
        size="section"
        backHref="/production"
        backLabel={t("pick_done_back_to_runs")}
        eyebrow={t(stageKindKey(data.stage))}
        title={t(stageHeadingKey(data.stage))}
        meta={
          <>
            <Badge tone={status.tone === "muted" ? "neutral" : status.tone} size="sm">
              {t(status.labelKey)}
            </Badge>
            <span className="text-sm text-fg-muted">
              {name}
              {data.name_he ? (
                <span className="ml-1.5 text-fg-subtle" dir="rtl">
                  {data.name_he}
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

      {/* Terminal run — read-only notice */}
      {terminal ? (
        <div
          className="mb-4 rounded-md border border-border/70 bg-bg-subtle/50 px-4 py-3 text-sm text-fg-muted"
          role="status"
          data-testid="pick-terminal-banner"
        >
          {t(status.labelKey)} · {t("pick_done_success")}
        </div>
      ) : null}

      {/* Stale-recipe conflict */}
      {isStale ? (
        <div
          className="mb-4 rounded-md border border-warning/50 bg-warning-softer px-4 py-3 text-sm text-warning-fg"
          role="alert"
          data-testid="pick-stale-banner"
        >
          <div className="font-semibold">{t("error_stale_bom")}</div>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold underline hover:no-underline"
            onClick={() => {
              confirm.reset();
              setResolutions({});
              void query.refetch();
            }}
            data-testid="pick-stale-reload"
          >
            <RotateCw className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            {t("error_retry")}
          </button>
        </div>
      ) : confirm.isError ? (
        <div
          className="mb-4 rounded-md border border-danger/40 bg-danger-softer px-4 py-3 text-sm text-danger-fg"
          role="alert"
          data-testid="pick-confirm-error"
        >
          {confirm.error.message}
        </div>
      ) : null}

      {/* Rows */}
      {lines.length === 0 ? (
        <div
          className="card px-6 py-10 text-center text-sm text-fg-muted"
          data-testid="pick-list-empty"
        >
          —
        </div>
      ) : (
        <div className="space-y-4" data-testid="pick-list">
          {renderGroup(
            t("pick_group_liquids"),
            <Droplets className="h-4 w-4 text-info" strokeWidth={2} aria-hidden />,
            grouped.liquids,
          )}
          {renderGroup(
            t("pick_group_packaging"),
            <Package className="h-4 w-4 text-accent" strokeWidth={2} aria-hidden />,
            grouped.packaging,
          )}
        </div>
      )}

      {/* Corrections on an active run */}
      {active ? (
        <div className="mt-4">
          <AddMaterialControl
            runId={runId}
            lines={lines}
            onChanged={() => void query.refetch()}
          />
        </div>
      ) : null}

      {/* Done bar — hidden on a terminal run */}
      {!terminal && lines.length > 0 ? (
        <DoneBar
          total={lines.length}
          resolved={resolved}
          pending={confirm.isPending}
          onConfirm={() => confirm.mutate()}
        />
      ) : null}

      {/* Edit sheet */}
      <EditQtySheet
        line={editingLine}
        resolution={editingLine ? resolutions[lineKey(editingLine)] : undefined}
        onClose={() => setEditingLine(null)}
        onSave={(qty) => {
          if (editingLine) {
            const l = editingLine;
            setResolutions((prev) => ({ ...prev, [lineKey(l)]: editResolution(l, qty) }));
          }
          setEditingLine(null);
        }}
        onNotTaken={() => {
          if (editingLine) {
            const l = editingLine;
            setResolutions((prev) => ({ ...prev, [lineKey(l)]: notCollectedResolution() }));
          }
          setEditingLine(null);
        }}
      />

      {/* Loading overlay hint while confirming (aria) */}
      {confirm.isPending ? (
        <span className="sr-only" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("pick_done_saving")}
        </span>
      ) : null}
    </div>
  );
}
