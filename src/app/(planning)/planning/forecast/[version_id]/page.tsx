"use client";

// ---------------------------------------------------------------------------
// /planner/forecast/[version_id] — version detail, line editor, publish.
//
// Scope (W2 Mode B, Forecast MVP):
//   - GET /api/v1/queries/forecasts/versions/:version_id (§G.2)
//   - For drafts: editable line grid (item × period × qty), Save button
//     calling POST /api/v1/mutations/forecasts/save-lines (§G.5).
//   - For published: read-only grid.
//   - Publish button visible on drafts only; calls
//     POST /api/v1/mutations/forecasts/publish (§G.6).
//   - Freeze indicator (minimal): rows whose period_bucket_key is within
//     FREEZE_HORIZON_WEEKS=1 of today are marked read-only in UI. Admin
//     break-glass override UI is DEFERRED (checkpoint §8).
//   - Uses existing lines from the API response; no grid auto-expansion to
//     include eligible-items-without-lines (that is the job of a "seed from
//     prior" flow — deferred).
//
// Out of MVP scope (deferred):
//   Revise, Discard, admin freeze override UI, active-published callout.
// ---------------------------------------------------------------------------

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, Save } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";
import type { Session } from "@/lib/auth/fake-auth";
import { cn } from "@/lib/cn";

type ForecastStatus = "draft" | "published" | "superseded" | "discarded";

interface VersionMetadata {
  version_id: string;
  site_id: string;
  cadence: "monthly" | "weekly" | "daily";
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

interface ForecastLine {
  line_id: string;
  item_id: string;
  period_bucket_key: string;
  forecast_quantity: string;
}

interface GetVersionResponse {
  version: VersionMetadata;
  lines: ForecastLine[];
}

interface ItemRow {
  item_id: string;
  item_name: string;
  status: string;
  supply_method: string;
  sales_uom: string | null;
}

async function fetchJsonSilent<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Request failed");
  return (await res.json()) as T;
}

// Generate expected period bucket keys from version metadata when the draft
// has no existing lines yet (fresh draft). Keys are ISO date strings matching
// the server's period_bucket_key format: YYYY-MM-DD (first day of month for
// monthly, Monday for weekly, daily date for daily).
function generateBucketsFromMetadata(
  horizonStartAt: string,
  horizonWeeks: number,
  cadence: "monthly" | "weekly" | "daily",
): string[] {
  const start = new Date(horizonStartAt + "T00:00:00Z");
  const endMs = start.getTime() + horizonWeeks * 7 * 24 * 60 * 60 * 1000;
  const buckets: string[] = [];
  if (cadence === "monthly") {
    let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (d.getTime() < endMs && buckets.length < 24) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      buckets.push(`${y}-${m}-01`);
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
  } else if (cadence === "weekly") {
    let d = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const dow = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    while (d.getTime() < endMs && buckets.length < horizonWeeks + 2) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      buckets.push(`${y}-${m}-${dd}`);
      d.setUTCDate(d.getUTCDate() + 7);
    }
  } else {
    let d = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    for (let i = 0; i < Math.min(horizonWeeks * 7, 62); i++) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      buckets.push(`${y}-${m}-${dd}`);
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return buckets;
}

// Matches api/src/forecasts/schemas.ts FORECAST_FREEZE_HORIZON_WEEKS.
// FP-2 = 1 per contract §B.4.
const FREEZE_HORIZON_WEEKS = 1;

function sessionHeaders(_session: Session): HeadersInit {
  return {
    "Content-Type": "application/json",
  };
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `fc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// A period bucket is "frozen" if its ISO-week-start <= today + FREEZE_WEEKS*7.
function isBucketFrozen(bucketKey: string): boolean {
  const cutoff = addDays(todayIsoDate(), FREEZE_HORIZON_WEEKS * 7);
  return bucketKey <= cutoff;
}

async function fetchVersion(
  session: Session,
  version_id: string,
): Promise<GetVersionResponse> {
  const res = await fetch(
    `/api/forecasts/versions/${encodeURIComponent(version_id)}`,
    {
      method: "GET",
      headers: sessionHeaders(session),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("Could not load this forecast version. Check your connection and try refreshing.");
  }
  return (await res.json()) as GetVersionResponse;
}

async function postSaveLines(
  session: Session,
  version_id: string,
  lines: Array<{
    item_id: string;
    period_bucket_key: string;
    forecast_quantity: string;
  }>,
): Promise<void> {
  const res = await fetch("/api/forecasts/save-lines", {
    method: "POST",
    headers: sessionHeaders(session),
    body: JSON.stringify({
      version_id,
      idempotency_key: newIdempotencyKey(),
      lines,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(txt) as { detail?: string };
      detail = parsed.detail ?? "";
    } catch { /* ignore */ }
    throw new Error(detail || "Save failed. Check your connection and try again.");
  }
}

async function postPublish(
  session: Session,
  version_id: string,
): Promise<void> {
  const res = await fetch("/api/forecasts/publish", {
    method: "POST",
    headers: sessionHeaders(session),
    body: JSON.stringify({
      version_id,
      idempotency_key: newIdempotencyKey(),
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(txt) as { detail?: string };
      detail = parsed.detail ?? "";
    } catch { /* ignore */ }
    throw new Error(detail || "Publish failed. Check your connection and try again.");
  }
}

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
    return new Date(iso).toLocaleString(undefined, {
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

function fmtHorizonStart(iso: string): string {
  try {
    return new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtBucket(
  key: string,
  cadence: "monthly" | "weekly" | "daily",
): string {
  try {
    const d = new Date(key + "T00:00:00Z");
    if (cadence === "monthly") {
      return d.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "2-digit", timeZone: "UTC" });
  } catch {
    return key;
  }
}

export default function ForecastVersionDetailPage() {
  const params = useParams<{ version_id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const canAuthor = session.role === "planner" || session.role === "admin";
  const versionId = params.version_id;

  const [localCells, setLocalCells] = useState<Record<string, string>>({});
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [addedItemIds, setAddedItemIds] = useState<Set<string>>(new Set());
  const [addItemInput, setAddItemInput] = useState<string>("");

  const query = useQuery<GetVersionResponse>({
    queryKey: ["forecast", "version", versionId, session.role],
    queryFn: () => fetchVersion(session, versionId),
    enabled: Boolean(versionId),
    staleTime: 60_000,
  });

  const data = query.data;
  const version = data?.version;
  const lines = data?.lines ?? [];
  const isDraft = version?.status === "draft";
  const isPublished = version?.status === "published";
  const isEditable = isDraft && canAuthor;

  const itemsQuery = useQuery<{ rows: ItemRow[]; count: number }>({
    queryKey: ["master", "items", "ALL_ACTIVE"],
    queryFn: () => fetchJsonSilent("/api/items?status=ACTIVE&limit=1000"),
    staleTime: 5 * 60 * 1000,
  });

  const itemsById = useMemo(() => {
    const m = new Map<string, ItemRow>();
    for (const r of itemsQuery.data?.rows ?? []) {
      m.set(r.item_id, r);
    }
    return m;
  }, [itemsQuery.data]);

  // Group lines by item for a stable row order, distinct buckets as columns.
  // Existing items are sorted alphabetically; locally-added items trail at bottom
  // in insertion order so the user sees them immediately after adding.
  // When the draft has no existing lines, buckets are generated from version
  // metadata (horizon_start_at + horizon_weeks + cadence) so a fresh draft is
  // immediately editable without requiring a prior API seed call.
  const { items, buckets } = useMemo(() => {
    const lineItemSet = new Set<string>();
    const bucketSet = new Set<string>();
    for (const l of lines) {
      lineItemSet.add(l.item_id);
      bucketSet.add(l.period_bucket_key);
    }
    const sortedExisting = Array.from(lineItemSet).sort();
    const newItems = Array.from(addedItemIds).filter(
      (id) => !lineItemSet.has(id),
    );
    const derivedBuckets =
      bucketSet.size > 0
        ? Array.from(bucketSet).sort()
        : version
          ? generateBucketsFromMetadata(
              version.horizon_start_at,
              version.horizon_weeks,
              version.cadence,
            )
          : [];
    return {
      items: [...sortedExisting, ...newItems],
      buckets: derivedBuckets,
    };
  }, [lines, addedItemIds, version]);

  // Set used for O(1) membership checks in the add-item combobox filter.
  const itemsInForecast = useMemo(() => new Set(items), [items]);

  const cellKey = (item_id: string, bucket: string) => `${item_id}|${bucket}`;
  const originalByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lines) {
      m.set(cellKey(l.item_id, l.period_bucket_key), l.forecast_quantity);
    }
    return m;
  }, [lines]);

  const dirtyEntries = useMemo(() => {
    const out: Array<{
      item_id: string;
      period_bucket_key: string;
      forecast_quantity: string;
    }> = [];
    for (const [key, val] of Object.entries(localCells)) {
      const [item_id, period_bucket_key] = key.split("|");
      const orig = originalByKey.get(key) ?? null;
      if (orig !== val) {
        out.push({
          item_id,
          period_bucket_key,
          forecast_quantity: val,
        });
      }
    }
    return out;
  }, [localCells, originalByKey]);

  const saveMut = useMutation({
    mutationFn: (
      payload: Array<{
        item_id: string;
        period_bucket_key: string;
        forecast_quantity: string;
      }>,
    ) => postSaveLines(session, versionId, payload),
    onSuccess: () => {
      setActionSuccess("Lines saved.");
      setActionError(null);
      setLocalCells({});
      setAddedItemIds(new Set());
      queryClient.invalidateQueries({
        queryKey: ["forecast", "version", versionId],
      });
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : String(err));
      setActionSuccess(null);
    },
  });

  const publishMut = useMutation({
    mutationFn: () => postPublish(session, versionId),
    onSuccess: () => {
      setActionSuccess("Published successfully. This forecast is now active.");
      setActionError(null);
      queryClient.invalidateQueries({
        queryKey: ["forecast", "version", versionId],
      });
      queryClient.invalidateQueries({ queryKey: ["forecasts", "versions"] });
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : String(err));
      setActionSuccess(null);
    },
  });

  if (query.isLoading) {
    return <div className="p-5 text-xs text-fg-muted">Loading…</div>;
  }
  if (query.isError || !version) {
    return (
      <>
        <WorkflowHeader
          eyebrow="Planner workspace"
          title="Forecast version"
          actions={
            <Link href="/planning/forecast" className="btn btn-sm gap-1.5">
              <ChevronLeft className="h-3 w-3" strokeWidth={2} /> Back
            </Link>
          }
        />
        <SectionCard>
          <div
            className="text-xs text-danger-fg"
            data-testid="forecast-detail-error"
          >
            Could not load this forecast version. Check your connection and try refreshing, or go back to the forecast list.
          </div>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <WorkflowHeader
        eyebrow="Planner workspace"
        title={`Forecast ${version.version_id.slice(0, 8)}`}
        description={`Horizon starts ${fmtHorizonStart(version.horizon_start_at)} · ${version.horizon_weeks} weeks · ${version.cadence} · site ${version.site_id}`}
        meta={
          <>
            <StatusBadge status={version.status} />
            <Badge tone="neutral" dotted>
              created {fmtDate(version.created_at)}
            </Badge>
            {version.published_at ? (
              <Badge tone="neutral" dotted>
                published {fmtDate(version.published_at)}
              </Badge>
            ) : null}
          </>
        }
        actions={
          <div className="flex gap-2">
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
                className="btn btn-sm gap-1.5"
                disabled={dirtyEntries.length === 0 || saveMut.isPending}
                data-testid="forecast-detail-save"
                onClick={() => {
                  setActionSuccess(null);
                  setActionError(null);
                  saveMut.mutate(dirtyEntries);
                }}
              >
                <Save className="h-3 w-3" strokeWidth={2} />
                {saveMut.isPending
                  ? "Saving…"
                  : dirtyEntries.length > 0
                    ? `Save ${dirtyEntries.length} change${dirtyEntries.length === 1 ? "" : "s"}`
                    : "Save"}
              </button>
            ) : null}
            {isEditable ? (
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                data-testid="forecast-detail-publish"
                disabled={publishMut.isPending}
                onClick={() => {
                  setActionSuccess(null);
                  if (dirtyEntries.length > 0) {
                    setActionError("You have unsaved changes. Save them before publishing.");
                    return;
                  }
                  if (items.length === 0) {
                    setActionError("This forecast has no lines. Add at least one item before publishing.");
                    return;
                  }
                  setActionError(null);
                  publishMut.mutate();
                }}
              >
                <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                {publishMut.isPending ? "Publishing…" : "Publish"}
              </button>
            ) : null}
          </div>
        }
      />

      {actionSuccess ? (
        <div
          className="mb-3 flex items-center gap-2 rounded border border-success/30 bg-success-subtle/40 px-4 py-2 text-xs text-success-fg"
          data-testid="forecast-action-success"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {actionSuccess}
        </div>
      ) : null}

      {actionError ? (
        <div
          className="mb-3 flex items-center gap-2 rounded border border-danger/30 bg-danger-subtle/40 px-4 py-2 text-xs text-danger-fg"
          data-testid="forecast-action-error"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {actionError}
        </div>
      ) : null}

      {isPublished ? (
        <div
          className="mb-3 rounded border border-info/30 bg-info-softer px-4 py-2 text-xs text-info-fg"
          data-testid="forecast-published-notice"
        >
          This version is published and read-only. To update demand, create a new forecast draft.
        </div>
      ) : null}

      <SectionCard
        eyebrow="Lines"
        title={`${items.length} item${items.length === 1 ? "" : "s"} × ${buckets.length} bucket${buckets.length === 1 ? "" : "s"}`}
        description={
          isEditable
            ? "Edit qty cells. Frozen buckets (within the freeze window) are read-only; break-glass override UI is not in this release."
            : "Read-only view."
        }
        contentClassName="p-0"
      >
        {items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="No items yet."
              description={
                isEditable
                  ? "Use the add-item control below to start populating this draft."
                  : "This version has no forecast lines."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse text-sm"
              data-testid="forecast-lines-table"
            >
              <thead>
                <tr className="border-b border-border/70 bg-bg-subtle/60">
                  <th className="sticky left-0 z-[1] min-w-[220px] bg-bg-subtle/80 px-4 py-2.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
                    Item
                  </th>
                  {buckets.map((b) => {
                    const frozen = isBucketFrozen(b);
                    return (
                      <th
                        key={b}
                        className={cn(
                          "px-2 py-2.5 text-right font-mono text-3xs font-semibold uppercase tracking-sops",
                          frozen ? "text-fg-faint" : "text-fg-subtle",
                        )}
                        data-testid="forecast-lines-bucket-header"
                        data-bucket={b}
                        data-frozen={frozen ? "1" : "0"}
                        title={frozen ? `${b} — frozen (within ${FREEZE_HORIZON_WEEKS}w window)` : b}
                      >
                        {fmtBucket(b, version.cadence)}
                        {frozen ? <div className="mt-0.5 text-3xs font-normal normal-case tracking-normal opacity-60">freeze</div> : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {items.map((itemId) => (
                  <tr
                    key={itemId}
                    className={cn(
                      "border-b border-border/40",
                      addedItemIds.has(itemId) && "bg-accent-soft/10",
                    )}
                    data-testid="forecast-lines-row"
                    data-item-id={itemId}
                  >
                    <td className="sticky left-0 z-[1] bg-bg-raised px-4 py-1.5 text-xs">
                      <div className="font-medium text-fg leading-tight">
                        {itemsById.get(itemId)?.item_name ?? itemId}
                      </div>
                      <div className="mt-0.5 font-mono text-3xs text-fg-faint">
                        {itemId}
                      </div>
                    </td>
                    {buckets.map((b) => {
                      const k = cellKey(itemId, b);
                      const orig = originalByKey.get(k) ?? "";
                      const local = localCells[k];
                      const displayValue = local !== undefined ? local : orig;
                      const frozen = isBucketFrozen(b);
                      const readonly = !isEditable || frozen;
                      return (
                        <td
                          key={b}
                          className="p-0"
                          data-testid="forecast-lines-cell"
                          data-item-id={itemId}
                          data-bucket={b}
                          data-frozen={frozen ? "1" : "0"}
                        >
                          {readonly ? (
                            <span
                              className={cn(
                                "block min-w-[80px] px-2 py-2 text-right font-mono text-xs tabular-nums",
                                frozen && "text-fg-faint",
                              )}
                            >
                              {displayValue === "" ? "—" : displayValue}
                            </span>
                          ) : (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={displayValue}
                              onChange={(e) => {
                                const v = e.target.value;
                                setLocalCells((prev) => ({ ...prev, [k]: v }));
                              }}
                              className="h-9 w-full min-w-[80px] border-0 bg-transparent px-2 text-right font-mono text-xs tabular-nums outline-none focus:bg-accent-soft focus:text-accent"
                              data-testid="forecast-lines-input"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isEditable ? (
          <div className="border-t border-border/40 px-4 py-3">
            <div className="mb-1.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Add item to forecast
            </div>
            <div className="flex items-center gap-2">
              <select
                value={addItemInput}
                onChange={(e) => setAddItemInput(e.target.value)}
                disabled={itemsQuery.isLoading}
                className="min-w-0 flex-1 rounded border border-border/60 bg-bg-subtle px-2 py-1.5 text-xs text-fg disabled:opacity-50"
                data-testid="forecast-add-item-select"
              >
                <option value="">
                  {itemsQuery.isLoading
                    ? "Loading items…"
                    : "— select item to add —"}
                </option>
                {(itemsQuery.data?.rows ?? [])
                  .filter((r) => !itemsInForecast.has(r.item_id))
                  .sort((a, b) => a.item_name.localeCompare(b.item_name))
                  .map((r) => (
                    <option key={r.item_id} value={r.item_id}>
                      {r.item_name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!addItemInput || itemsQuery.isLoading}
                className="btn btn-sm shrink-0"
                data-testid="forecast-add-item-btn"
                onClick={() => {
                  if (!addItemInput) return;
                  setAddedItemIds((prev) => {
                    const next = new Set(prev);
                    next.add(addItemInput);
                    return next;
                  });
                  setAddItemInput("");
                }}
              >
                + Add
              </button>
            </div>
            {addedItemIds.size > 0 ? (
              <p
                className="mt-1.5 text-3xs text-fg-muted"
                data-testid="forecast-added-hint"
              >
                {addedItemIds.size} item
                {addedItemIds.size !== 1 ? "s" : ""} added — fill quantities
                in the grid above, then click Save.
              </p>
            ) : null}
            {buckets.length === 0 ? (
              <p className="mt-1.5 text-3xs text-warning-fg">
                No period columns yet — period buckets are derived from the
                draft&apos;s horizon. Check that horizon_start_at and
                horizon_weeks are set.
              </p>
            ) : null}
          </div>
        ) : null}
      </SectionCard>
    </>
  );
}
