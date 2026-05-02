"use client";

// ---------------------------------------------------------------------------
// Forecast version detail — Wave 2 redesign (W2 Mode B-ForecastMonthly-Redesign).
//
// Plan-of-record §Chunks 4 + 5 of
// docs/forecast_monthly_cadence_refactor_plan_2026-05-02.md
//
// Wave 1 backend (commit 31d3ee0) shipped:
//   - cadence='monthly' end-to-end on the API
//   - F1 sparse: only existing forecast_lines must be filled at publish
//   - v_planning_demand monthly→weekly disaggregation (migration 0128)
//   - fn_compute_daily_fg_projection extension (migration 0129)
//   - parity verified (monthly 200 → 4×50 weekly → SUM(daily June)≈200 ±1)
//   - RUNTIME_READY(Forecast-Monthly) signal #33 emitted
//
// Wave 2 (this commit) — frontend redesign:
//   - English LTR everywhere (Tom-locked global standard 2026-05-01)
//   - Integer-only display via formatQty (no .00000000 leakage)
//   - Month column labels "May 2026" / "Jun 2026" (no "26 מאי" duplicates)
//   - Sparse grid (start empty, items added via autocomplete)
//   - 800ms debounced auto-save
//   - Hero KPI band + AutoSaveIndicator + PublishGate modal
//   - Stunning visual quality per Tom-locked UI standard
//
// Backend contracts consumed verbatim — NO contract authoring here.
//   GET  /api/forecasts/versions/:version_id    (read draft + lines)
//   GET  /api/items?status=ACTIVE&limit=1000    (eligible-FG list)
//   POST /api/forecasts/save-lines              (auto-save)
//   POST /api/forecasts/publish                 (publish)
//
// Forbidden under Mode B:
//   - Backend authorship (api/src/**) — none touched
//   - New migrations — none authored
//   - Sandbox-to-canonical promotion — n/a (this IS the canonical portal per
//     EXECUTION_POLICY.md §Mode B-Portal-Refactor)
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Play,
} from "lucide-react";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";

import { computeMonthBuckets, formatInt } from "./_lib/format";
import { useAutoSave } from "./_lib/use-auto-save";
import { HeroKpiBand } from "./_components/HeroKpiBand";
import {
  ItemAutocompleteAdder,
  type ItemForAutocomplete,
} from "./_components/ItemAutocompleteAdder";
import {
  MonthlyGrid,
  type ForecastLineLite,
  type ItemForGrid,
} from "./_components/MonthlyGrid";
import { AutoSaveIndicator } from "./_components/AutoSaveIndicator";
import {
  PublishGate,
  type PublishMissingCell,
} from "./_components/PublishGate";
import { ForecastEmptyState } from "./_components/EmptyState";

// ---------------------------------------------------------------------------
// Types — mirror backend response shapes verbatim (no invention).
// ---------------------------------------------------------------------------

type ForecastStatus = "draft" | "published" | "superseded" | "discarded";
type ForecastCadence = "monthly" | "weekly" | "daily";

interface VersionMetadata {
  version_id: string;
  site_id: string;
  cadence: ForecastCadence;
  horizon_start_at: string;
  horizon_weeks: number;
  status: ForecastStatus;
  created_by_user_id: string;
  created_by_snapshot: string;
  created_at: string;
  updated_at: string;
  published_by_user_id: string | null;
  published_by_snapshot: string | null;
  published_at: string | null;
  supersedes_version_id: string | null;
  superseded_at: string | null;
  notes: string | null;
}

interface GetVersionResponse {
  version: VersionMetadata;
  lines: ForecastLineLite[];
}

interface ItemRow {
  item_id: string;
  item_name: string;
  status: string;
  supply_method: string;
  sales_uom: string | null;
}

interface ItemsListResponse {
  rows: ItemRow[];
  count: number;
}

interface PublishErrorResponse {
  reason_code?: string;
  detail?: string;
  error_code?: string;
  recovery?: string;
  expected_cell_count?: string;
  found_cell_count?: string;
  missing_cell_count?: string;
}

// Eligible supply methods for FG forecast — mirrors backend §F4.
const ELIGIBLE_SUPPLY_METHODS = new Set([
  "BOUGHT_FINISHED",
  "MANUFACTURED",
  "REPACK",
]);

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

function sessionHeaders(_s: Session): HeadersInit {
  return { "Content-Type": "application/json" };
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `fc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

async function fetchVersion(
  session: Session,
  versionId: string,
): Promise<GetVersionResponse> {
  const res = await fetch(
    `/api/forecasts/versions/${encodeURIComponent(versionId)}`,
    { method: "GET", headers: sessionHeaders(session) },
  );
  if (!res.ok) {
    throw new Error(
      "Could not load this forecast version. Check your connection and try refreshing.",
    );
  }
  return (await res.json()) as GetVersionResponse;
}

async function fetchItemsList(
  session: Session,
): Promise<ItemsListResponse> {
  const res = await fetch(`/api/items?status=ACTIVE&limit=1000`, {
    method: "GET",
    headers: sessionHeaders(session),
  });
  if (!res.ok) {
    throw new Error("Could not load eligible items.");
  }
  return (await res.json()) as ItemsListResponse;
}

async function fetchVersionsList(
  session: Session,
): Promise<{ versions: VersionMetadata[] }> {
  const res = await fetch(`/api/forecasts/versions?status=published`, {
    method: "GET",
    headers: sessionHeaders(session),
  });
  if (!res.ok) {
    // Soft fail: prev-month KPI just shows "—" if list query errors.
    return { versions: [] };
  }
  return (await res.json()) as { versions: VersionMetadata[] };
}

async function fetchVersionLines(
  session: Session,
  versionId: string,
): Promise<GetVersionResponse | null> {
  try {
    return await fetchVersion(session, versionId);
  } catch {
    return null;
  }
}

async function postPublish(
  session: Session,
  versionId: string,
): Promise<{ ok: true } | { ok: false; status: number; body: PublishErrorResponse }> {
  const res = await fetch(`/api/forecasts/publish`, {
    method: "POST",
    headers: sessionHeaders(session),
    body: JSON.stringify({
      version_id: versionId,
      idempotency_key: newIdempotencyKey(),
    }),
  });
  if (res.ok) return { ok: true };
  const txt = await res.text().catch(() => "");
  let body: PublishErrorResponse = {};
  try {
    body = JSON.parse(txt) as PublishErrorResponse;
  } catch {
    /* ignore */
  }
  return { ok: false, status: res.status, body };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ForecastVersionDetailPage() {
  const params = useParams<{ version_id: string }>();
  const versionId = params.version_id;
  const queryClient = useQueryClient();
  const { session } = useSession();
  const canAuthor = session.role === "planner" || session.role === "admin";

  // ----- Data -----
  const versionQuery = useQuery<GetVersionResponse>({
    queryKey: ["forecast", "version", versionId, session.role],
    queryFn: () => fetchVersion(session, versionId),
    enabled: Boolean(versionId),
    staleTime: 60_000,
  });

  const itemsQuery = useQuery<ItemsListResponse>({
    queryKey: ["master", "items", "ALL_ACTIVE"],
    queryFn: () => fetchItemsList(session),
    staleTime: 5 * 60 * 1000,
  });

  // Most recent published version, if any — used for the "vs prev month" KPI.
  const priorPublishedQuery = useQuery({
    queryKey: ["forecast", "versions", "published-list", session.role],
    queryFn: () => fetchVersionsList(session),
    staleTime: 5 * 60 * 1000,
  });

  const data = versionQuery.data;
  const version = data?.version;
  const lines = data?.lines ?? [];
  const isDraft = version?.status === "draft";
  const isPublished = version?.status === "published";
  const isEditable = isDraft && canAuthor;

  // ----- Local UI state -----
  const [localCells, setLocalCells] = useState<Record<string, string>>({});
  const [freshlyAddedItemIds, setFreshlyAddedItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMissing, setPublishMissing] = useState<
    PublishMissingCell[] | null
  >(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  const autocompleteInputRef = useRef<HTMLInputElement | null>(null);
  const focusAutocomplete = useCallback(() => {
    autocompleteInputRef.current?.focus();
  }, []);

  // ----- Buckets + items derived -----
  const buckets = useMemo(() => {
    if (!version) return [];
    return computeMonthBuckets(
      version.cadence,
      version.horizon_start_at,
      version.horizon_weeks,
    );
  }, [version]);

  const itemsById = useMemo(() => {
    const m = new Map<string, ItemRow>();
    for (const r of itemsQuery.data?.rows ?? []) m.set(r.item_id, r);
    return m;
  }, [itemsQuery.data]);

  const eligibleItems: ItemForAutocomplete[] = useMemo(() => {
    return (itemsQuery.data?.rows ?? [])
      .filter((r) => ELIGIBLE_SUPPLY_METHODS.has(r.supply_method))
      .filter((r) => r.status === "ACTIVE")
      .map((r) => ({
        item_id: r.item_id,
        item_name: r.item_name,
        status: r.status,
        supply_method: r.supply_method,
        sales_uom: r.sales_uom,
      }));
  }, [itemsQuery.data]);

  // Items in the grid = items with at least one line OR freshly added.
  const itemsForGrid: ItemForGrid[] = useMemo(() => {
    const ids = new Set(lines.map((l) => l.item_id));
    for (const id of freshlyAddedItemIds) ids.add(id);
    return Array.from(ids)
      .map((id) => {
        const meta = itemsById.get(id);
        return {
          item_id: id,
          item_name: meta?.item_name ?? id,
          supply_method: meta?.supply_method ?? "",
        };
      })
      .sort((a, b) => a.item_name.localeCompare(b.item_name));
  }, [lines, freshlyAddedItemIds, itemsById]);

  const itemsForGridById = useMemo(() => {
    const m = new Map<string, { item_id: string; item_name: string }>();
    for (const it of itemsForGrid) {
      m.set(it.item_id, { item_id: it.item_id, item_name: it.item_name });
    }
    return m;
  }, [itemsForGrid]);

  const alreadyAddedItemIds = useMemo(
    () => new Set(itemsForGrid.map((i) => i.item_id)),
    [itemsForGrid],
  );

  // ----- Auto-save -----
  const autoSave = useAutoSave(versionId, {
    debounceMs: 800,
    enabled: isEditable,
  });

  // ----- KPI computation -----
  // Tom-locked amendment 2026-05-02: every bucket is editable, so the KPI
  // anchor is simply the first bucket in the horizon (the "current/active"
  // month from the planner's POV — typically the month they just opened the
  // forecast to edit).
  const primaryBucket = useMemo(
    () => buckets[0] ?? null,
    [buckets],
  );

  const totalDemandNextMonth = useMemo(() => {
    if (!primaryBucket) return 0;
    return lines
      .filter((l) => l.period_bucket_key === primaryBucket.key)
      .reduce((acc, l) => {
        // Prefer local cell value when present (planner is mid-edit).
        const localKey = `${l.item_id}|${l.period_bucket_key}`;
        const local = localCells[localKey];
        const v = local !== undefined && local !== "" ? local : l.forecast_quantity;
        return acc + Number(v);
      }, 0);
  }, [lines, primaryBucket, localCells]);

  const itemsInForecast = itemsForGrid.length;
  const totalEligibleItems = eligibleItems.length;

  // Cells expected = items with lines × all buckets in horizon (no frozen skip).
  const expectedCells =
    new Set(lines.map((l) => l.item_id)).size * buckets.length;
  const filledCells = lines.filter(
    (l) => Number(l.forecast_quantity) > 0,
  ).length;
  const percentProgress =
    expectedCells > 0
      ? Math.min(100, Math.round((filledCells / expectedCells) * 100))
      : 0;

  // Prev-month demand from the most recent prior published version (if any).
  const priorPublishedVersionId = useMemo(() => {
    const list = priorPublishedQuery.data?.versions ?? [];
    // Skip the current version itself if it's already published.
    return (
      list.find((v) => v.version_id !== versionId)?.version_id ?? null
    );
  }, [priorPublishedQuery.data, versionId]);

  const priorPublishedQueryLines = useQuery<GetVersionResponse | null>({
    queryKey: ["forecast", "version", priorPublishedVersionId, "prev-month"],
    queryFn: () =>
      priorPublishedVersionId
        ? fetchVersionLines(session, priorPublishedVersionId)
        : Promise.resolve(null),
    enabled: Boolean(priorPublishedVersionId),
    staleTime: 5 * 60 * 1000,
  });

  // Compute prev-month's same-month demand by aligning to the same bucket
  // key in the prior version. Cheap heuristic; null if no prior or buckets
  // don't align.
  const totalDemandPrevMonth: number | null = useMemo(() => {
    const prior = priorPublishedQueryLines.data;
    if (!prior || !primaryBucket) return null;
    // Match by bucket key directly first (best case: same horizon_start_at).
    const sameKey = prior.lines
      .filter((l) => l.period_bucket_key === primaryBucket.key)
      .reduce((acc, l) => acc + Number(l.forecast_quantity), 0);
    if (sameKey > 0) return sameKey;
    return null;
  }, [priorPublishedQueryLines.data, primaryBucket]);

  // ----- Mutations -----
  const publishMut = useMutation({
    mutationFn: () => postPublish(session, versionId),
    onSuccess: (result) => {
      if (result.ok) {
        setPublishSuccess(
          "Published. This forecast is now the active demand source for planning.",
        );
        setPublishError(null);
        setPublishMissing(null);
        setPublishOpen(false);
        queryClient.invalidateQueries({
          queryKey: ["forecast", "version", versionId],
        });
        queryClient.invalidateQueries({
          queryKey: ["forecasts", "versions"],
        });
        return;
      }
      // 409 / 400: surface inline list when the structured payload is present.
      const body = result.body;
      if (
        body.error_code === "FORECAST_CELLS_MISSING" ||
        body.recovery === "GENERATE_MISSING_CELLS"
      ) {
        // Backend returns counts but not per-cell list (Wave 1 backend); we
        // re-derive missing cells client-side from the version's lines so
        // the modal shows them inline.
        const linesByCell = new Map<string, string>();
        for (const l of lines)
          linesByCell.set(`${l.item_id}|${l.period_bucket_key}`, l.forecast_quantity);
        const itemsWithLines = new Set(lines.map((l) => l.item_id));
        const missing: PublishMissingCell[] = [];
        for (const itemId of itemsWithLines) {
          for (const b of buckets) {
            const v = linesByCell.get(`${itemId}|${b.key}`);
            if (v === undefined || v === "" || Number(v) <= 0) {
              missing.push({ item_id: itemId, period_bucket_key: b.key });
            }
          }
        }
        setPublishMissing(missing);
        setPublishError(null);
      } else {
        setPublishMissing(null);
        setPublishError(
          body.detail ||
            body.reason_code ||
            "Publish failed. Check your changes and try again.",
        );
      }
    },
    onError: (err: unknown) => {
      setPublishError(err instanceof Error ? err.message : String(err));
    },
  });

  // Delete-item handler — clears all cells for the item via auto-save with
  // empty string (the backend treats "" as zero-quantity = effectively a
  // no-op delete in v1; full delete-line endpoint not yet exposed).
  // For Wave 2, we treat removal as: clear the local cells, then drop the
  // item from freshlyAddedItemIds. The backend lines remain (zero out via
  // setting forecast_quantity = "0" for each cell). This is the Wave-2-safe
  // path; a true line-delete handler is W1 follow-on work if needed.
  const onItemRemove = useCallback(
    (itemId: string) => {
      // Zero out every cell for this item via auto-save (every month is
      // editable post-amendment 2026-05-02).
      for (const b of buckets) {
        autoSave.queueChange({
          item_id: itemId,
          period_bucket_key: b.key,
          forecast_quantity: "0",
        });
        setLocalCells((prev) => ({ ...prev, [`${itemId}|${b.key}`]: "0" }));
      }
      setFreshlyAddedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    },
    [autoSave, buckets],
  );

  // ----- Render: loading / error -----
  if (versionQuery.isLoading) {
    return (
      <>
        <WorkflowHeader
          eyebrow="Planner workspace"
          title="Loading forecast…"
          actions={
            <Link href="/planning/forecast" className="btn btn-sm gap-1.5">
              <ChevronLeft className="h-3 w-3" strokeWidth={2} /> Back
            </Link>
          }
        />
        <SectionCard>
          <div className="space-y-3" aria-busy="true" aria-live="polite">
            <div className="h-9 w-1/3 animate-pulse rounded bg-bg-subtle" />
            <div className="h-5 w-2/3 animate-pulse rounded bg-bg-subtle" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
              <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
              <div className="h-9 w-full animate-pulse rounded bg-bg-subtle" />
            </div>
            <div className="h-32 w-full animate-pulse rounded bg-bg-subtle" />
          </div>
        </SectionCard>
      </>
    );
  }

  if (versionQuery.isError || !version) {
    return (
      <>
        <WorkflowHeader
          eyebrow="Planner workspace"
          title="Forecast"
          actions={
            <Link href="/planning/forecast" className="btn btn-sm gap-1.5">
              <ChevronLeft className="h-3 w-3" strokeWidth={2} /> Back
            </Link>
          }
        />
        <SectionCard>
          <div
            className="rounded border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg"
            data-testid="forecast-detail-error"
          >
            <div className="font-semibold">
              Could not load this forecast version
            </div>
            <div className="mt-1 text-xs">
              Check your connection and try refreshing, or go back to the list.
            </div>
            <button
              type="button"
              onClick={() => void versionQuery.refetch()}
              className="mt-2 text-xs font-medium text-danger-fg underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        </SectionCard>
      </>
    );
  }

  // ----- Render: main -----
  const horizonLabel =
    buckets.length > 0
      ? `${buckets[0]!.label} → ${buckets[buckets.length - 1]!.label}`
      : "—";

  const cadenceLabel =
    version.cadence === "monthly"
      ? "Monthly"
      : version.cadence === "weekly"
        ? "Weekly"
        : "Daily";

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title="Forecast"
        description={`${cadenceLabel} cadence · ${horizonLabel}`}
        meta={
          <>
            <StatusBadge status={version.status} />
            <Badge tone="neutral" dotted>
              {cadenceLabel}
            </Badge>
            {version.published_at ? (
              <Badge tone="neutral" dotted>
                published {fmtDate(version.published_at)}
              </Badge>
            ) : null}
            {version.updated_at && version.updated_at !== version.created_at ? (
              <Badge tone="neutral" dotted>
                updated {fmtDate(version.updated_at)}
              </Badge>
            ) : null}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {isEditable ? (
              <AutoSaveIndicator
                state={autoSave.state}
                lastSavedAt={autoSave.lastSavedAt}
                errorMessage={autoSave.errorMessage}
                pendingCount={autoSave.pendingCount}
                onRetry={() => void autoSave.flush()}
              />
            ) : null}
            <Link
              href="/planning/forecast"
              className="btn btn-sm gap-1.5"
              data-testid="forecast-detail-back"
            >
              <ChevronLeft className="h-3 w-3" strokeWidth={2} /> Back
            </Link>
            {isEditable ? (
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                data-testid="forecast-detail-publish"
                disabled={publishMut.isPending || itemsInForecast === 0}
                onClick={async () => {
                  setPublishError(null);
                  setPublishSuccess(null);
                  // Make sure any in-flight edits are saved before opening
                  // the gate, so the F1 preview reflects current state.
                  await autoSave.flush();
                  setPublishOpen(true);
                }}
              >
                <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                Publish
              </button>
            ) : null}
          </div>
        }
      />

      {/* Inline success / error banners */}
      {publishSuccess ? (
        <div
          className="mb-3 flex items-center gap-2 rounded border border-success/30 bg-success-softer px-4 py-2 text-xs text-success-fg"
          data-testid="forecast-action-success"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {publishSuccess}
        </div>
      ) : null}

      {publishError && !publishOpen ? (
        <div
          className="mb-3 flex items-center gap-2 rounded border border-danger/30 bg-danger-softer px-4 py-2 text-xs text-danger-fg"
          data-testid="forecast-action-error"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {publishError}
        </div>
      ) : null}

      {/* Active-published bridge: tell the planner the next step */}
      {isPublished ? (
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded border border-info/30 bg-info-softer px-4 py-3 text-xs text-info-fg"
          data-testid="forecast-published-notice"
        >
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              Active forecast — demand source for planning
            </div>
            <div className="mt-0.5 text-fg-muted">
              Trigger a planning run to turn this forecast into purchase and
              production recommendations.
            </div>
          </div>
          <Link
            href="/planning/runs"
            className="btn btn-sm btn-primary gap-1.5 shrink-0"
            data-testid="forecast-published-go-runs"
          >
            {canAuthor ? (
              <>
                <Play className="h-3 w-3" strokeWidth={2.5} />
                Run planning
              </>
            ) : (
              <>
                <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
                Planning runs
              </>
            )}
          </Link>
        </div>
      ) : null}

      {/* Hero KPI band */}
      <HeroKpiBand
        totalDemandNextMonth={totalDemandNextMonth}
        itemsInForecast={itemsInForecast}
        totalEligibleItems={totalEligibleItems}
        totalDemandPrevMonth={totalDemandPrevMonth}
        percentProgress={percentProgress}
        nextMonthLabel={primaryBucket?.label ?? "—"}
        prevMonthLabel={
          // Derive prev-month label from the primary (first) bucket minus 1.
          primaryBucket
            ? prevMonthLabelFromKey(primaryBucket.key, version.cadence)
            : null
        }
      />

      {/* Grid section */}
      <SectionCard
        eyebrow="Lines"
        title={
          itemsInForecast === 0
            ? "No items yet"
            : `${formatInt(itemsInForecast)} item${itemsInForecast === 1 ? "" : "s"} × ${buckets.length} month${buckets.length === 1 ? "" : "s"}`
        }
        description={
          isEditable
            ? "Add items via the search box. Edits auto-save after a brief pause."
            : isPublished
              ? "Read-only view of the published forecast."
              : "Read-only."
        }
        contentClassName="p-0"
      >
        {/* Toolbar: autocomplete + secondary actions */}
        {isEditable ? (
          <div className="border-b border-border/60 px-4 py-3">
            <ItemAutocompleteAdder
              eligibleItems={eligibleItems}
              alreadyAddedItemIds={alreadyAddedItemIds}
              isLoading={itemsQuery.isLoading}
              inputRefCallback={(el) => {
                autocompleteInputRef.current = el;
              }}
              onAdd={(itemId) => {
                setFreshlyAddedItemIds((prev) => {
                  const next = new Set(prev);
                  next.add(itemId);
                  return next;
                });
                // Pre-seed an empty-string local value for each bucket so
                // the editor renders editable inputs immediately (every
                // month is editable post-amendment 2026-05-02).
                setLocalCells((prev) => {
                  const next = { ...prev };
                  for (const b of buckets) {
                    next[`${itemId}|${b.key}`] = "";
                  }
                  return next;
                });
              }}
            />
          </div>
        ) : null}

        {/* Empty state vs grid */}
        {itemsForGrid.length === 0 ? (
          <div className="p-6">
            <ForecastEmptyState onAddFirstItem={focusAutocomplete} />
          </div>
        ) : (
          <MonthlyGrid
            items={itemsForGrid}
            lines={lines}
            localCells={localCells}
            freshlyAddedItemIds={freshlyAddedItemIds}
            buckets={buckets}
            isEditable={isEditable}
            onCellEdit={(itemId, bucketKey, value) => {
              const cellKey = `${itemId}|${bucketKey}`;
              setLocalCells((prev) => ({ ...prev, [cellKey]: value }));
              if (value === "") return; // wait for a real value before saving
              autoSave.queueChange({
                item_id: itemId,
                period_bucket_key: bucketKey,
                forecast_quantity: value,
              });
            }}
            onItemRemove={onItemRemove}
          />
        )}
      </SectionCard>

      {/* Publish gate modal */}
      <PublishGate
        open={publishOpen}
        onOpenChange={(o) => {
          setPublishOpen(o);
          if (!o) {
            setPublishMissing(null);
          }
        }}
        items={itemsForGrid}
        lines={lines}
        buckets={buckets}
        itemsById={itemsForGridById}
        missingCellsFromBackend={publishMissing ?? undefined}
        isPublishing={publishMut.isPending}
        onConfirm={() => {
          setPublishError(null);
          publishMut.mutate();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ForecastStatus }) {
  if (status === "published") {
    return (
      <Badge tone="success" variant="solid">
        Published
      </Badge>
    );
  }
  if (status === "draft") {
    return (
      <Badge tone="warning" dotted>
        Draft
      </Badge>
    );
  }
  if (status === "superseded") {
    return (
      <Badge tone="neutral" dotted>
        Superseded
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" dotted>
      Discarded
    </Badge>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Derive a prev-month label from a YYYY-MM-DD bucket key.
 * Example: "2026-06-01" + monthly → "May 2026".
 */
function prevMonthLabelFromKey(
  bucketKey: string,
  cadence: ForecastCadence,
): string | null {
  try {
    const d = new Date(bucketKey + "T00:00:00.000Z");
    if (cadence === "monthly") {
      d.setUTCMonth(d.getUTCMonth() - 1);
      return d.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    }
    if (cadence === "weekly") {
      d.setUTCDate(d.getUTCDate() - 7);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        timeZone: "UTC",
      });
    }
    return null;
  } catch {
    return null;
  }
}
