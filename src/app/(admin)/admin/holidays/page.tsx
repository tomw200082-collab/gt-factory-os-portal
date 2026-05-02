"use client";

// ---------------------------------------------------------------------------
// /admin/holidays — Israel holiday calendar admin (LIVE).
//
// Replaces the prior "coming soon" EmptyState placeholder. Closes overnight
// audit P0-H. Authorized under per-form Mode B(AdminHolidays) on signal #25
// RUNTIME_READY(AdminHolidays) (executor-w1 2026-05-01T22:48:23Z, evidence
// Projects/gt-factory-os/docs/admin_holidays_crud_checkpoint.md).
//
// Backend contract (consumed verbatim, no invention):
//   GET    /api/v1/queries/admin/holidays                      planner+admin
//   POST   /api/v1/mutations/admin/holidays                    admin only
//   PATCH  /api/v1/mutations/admin/holidays/:holiday_date      admin only
//   DELETE /api/v1/mutations/admin/holidays/:holiday_date      admin only
//   POST   /api/v1/mutations/admin/holidays/bulk-import/preview admin only
//   POST   /api/v1/mutations/admin/holidays/bulk-import/commit  admin only
//
// W1 conflict reason codes (locked):
//   IDEMPOTENCY_KEY_REUSED, DUPLICATE_HOLIDAY_DATE, HOLIDAY_NOT_FOUND,
//   PRIMARY_KEY_IMMUTABLE, MISSING_REASON, HOLIDAY_ALREADY_ARCHIVED,
//   BREAK_GLASS_ACTIVE.
//
// Tom-Tax warning (per checkpoint §10 GAP-AHC-1 residual): archiving sets
// archived_at on the row but consumer queries (fn_compute_daily_fg_projection,
// v_daily_inventory_flow, v_planning_demand open-order pickup-bucketing,
// forecast disaggregation) do NOT yet filter `WHERE archived_at IS NULL`.
// A future W1 cycle (cycle 8) lands the consumer-side filter migration.
// Until then, archived holidays continue to act as non-working days inside
// the planning engine — even though the admin sees them as "Archived" here.
// Functional impact today is zero (no rows are archived in the live DB at
// signal #25 emission time). The banner reminds admins of this caveat.
//
// English-only, LTR-only per Tom's portal-wide standard locked 2026-05-01.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { useSession } from "@/lib/auth/session-provider";

// ---------------------------------------------------------------------------
// Types — verbatim mirror of api/src/admin/holidays/schemas.ts (no invention).
// ---------------------------------------------------------------------------

const HOLIDAY_TYPES = ["full_holiday", "erev_chag", "chol_hamoed"] as const;
type HolidayType = (typeof HOLIDAY_TYPES)[number];

interface HolidayRow {
  holiday_date: string;
  holiday_name: string;
  holiday_name_he: string;
  type: HolidayType;
  blocks_pickup: boolean;
  blocks_supply: boolean;
  notes: string | null;
  archived_at: string | null;
}

interface ListHolidaysResponse {
  rows: HolidayRow[];
  total: number;
  as_of: string;
}

interface BulkImportRow {
  holiday_date: string;
  holiday_name: string;
  holiday_name_he: string;
  type: HolidayType;
  blocks_pickup: boolean;
  blocks_supply: boolean;
  notes: string | null;
}

interface BulkImportPreviewResponse {
  to_create: BulkImportRow[];
  to_update: { date: string; before: HolidayRow; after: BulkImportRow }[];
  to_skip: BulkImportRow[];
  to_reject: { row: unknown; reason: string }[];
  as_of: string;
}

interface BulkImportCommitResponse {
  created_count: number;
  updated_count: number;
  skipped_count: number;
  rejected_count: number;
  affected_dates: string[];
  idempotent_replay: boolean;
  submission_id: string;
}

interface ConflictBody {
  reason_code?: string;
  detail?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Display helpers — no IDs in primary UI per memory feedback_names_not_ids.
// ---------------------------------------------------------------------------

const TYPE_LABEL: Record<HolidayType, string> = {
  full_holiday: "Full holiday",
  erev_chag: "Erev Chag",
  chol_hamoed: "Chol HaMoed",
};

const REASON_LABEL: Record<string, string> = {
  IDEMPOTENCY_KEY_REUSED: "This idempotency key has already been used.",
  DUPLICATE_HOLIDAY_DATE: "A holiday already exists for this date.",
  HOLIDAY_NOT_FOUND: "Holiday not found. It may have been deleted.",
  PRIMARY_KEY_IMMUTABLE:
    "Holiday date cannot be edited. Archive this row and create a new one instead.",
  MISSING_REASON: "Reason is required to archive a holiday.",
  HOLIDAY_ALREADY_ARCHIVED: "This holiday has already been archived.",
  BREAK_GLASS_ACTIVE:
    "System is in break-glass read-only mode. Try again later.",
};

function explainConflict(body: ConflictBody | null, fallback: string): string {
  if (!body) return fallback;
  if (body.reason_code && REASON_LABEL[body.reason_code]) {
    return REASON_LABEL[body.reason_code];
  }
  if (body.detail) return body.detail;
  if (body.error) return body.error;
  return fallback;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as ConflictBody;
      if (body?.error) detail = `${detail}: ${body.error}`;
      else if (body?.detail) detail = `${detail}: ${body.detail}`;
    } catch {
      // ignore — body not JSON
    }
    throw new Error(`Could not load holidays (${detail}).`);
  }
  return (await res.json()) as T;
}

async function postJson<TReq, TRes>(
  url: string,
  body: TReq,
  method: "POST" | "PATCH" | "DELETE" = "POST",
): Promise<TRes> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const conflict = parsed as ConflictBody | null;
    const fallback = `HTTP ${res.status}`;
    const message = explainConflict(conflict, fallback);
    const err = new Error(message) as Error & {
      status?: number;
      reason_code?: string;
    };
    err.status = res.status;
    if (conflict?.reason_code) err.reason_code = conflict.reason_code;
    throw err;
  }
  return parsed as TRes;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminHolidaysPage(): JSX.Element {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const isAdmin = session.role === "admin";
  const isPlanner = session.role === "planner";
  const canRead = isAdmin || isPlanner;
  const canWrite = isAdmin;

  // Filter state
  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = useState<number | null>(currentYear);
  const [typeFilter, setTypeFilter] = useState<HolidayType | "">("");
  const [includeArchived, setIncludeArchived] = useState(false);

  // Modal state
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<HolidayRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<HolidayRow | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);

  // Banner state
  const [banner, setBanner] = useState<
    | { kind: "success" | "error"; message: string; detail?: string }
    | null
  >(null);

  // ---- Query ----------------------------------------------------------------

  const listQuery = useQuery<ListHolidaysResponse>({
    queryKey: ["admin", "holidays", { year, typeFilter, includeArchived }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (year !== null) params.set("year", String(year));
      if (typeFilter) params.set("type", typeFilter);
      if (includeArchived) params.set("include_archived", "true");
      const qs = params.toString();
      return fetchJson<ListHolidaysResponse>(
        `/api/admin/holidays${qs ? `?${qs}` : ""}`,
      );
    },
    enabled: canRead,
    refetchOnWindowFocus: false,
  });

  // ---- Year list — derived from data + the current year for empty start ----

  const yearOptions = useMemo<number[]>(() => {
    const years = new Set<number>();
    years.add(currentYear);
    for (const row of listQuery.data?.rows ?? []) {
      const y = parseInt(row.holiday_date.slice(0, 4), 10);
      if (!Number.isNaN(y)) years.add(y);
    }
    return [...years].sort((a, b) => a - b);
  }, [listQuery.data, currentYear]);

  // Total + active counts
  const total = listQuery.data?.total ?? 0;
  const archivedCount = useMemo(
    () =>
      (listQuery.data?.rows ?? []).filter((r) => r.archived_at !== null).length,
    [listQuery.data],
  );

  // ---- Mutations ------------------------------------------------------------

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "holidays"] });

  const onMutationSuccess = (msg: string) => {
    setBanner({ kind: "success", message: msg });
    void invalidateList();
  };
  const onMutationError = (label: string, err: Error) => {
    setBanner({
      kind: "error",
      message: `${label} failed.`,
      detail: err.message,
    });
  };

  // ---- Render ---------------------------------------------------------------

  if (!canRead) {
    return (
      <div className="card mx-auto mt-8 max-w-lg p-6 text-center">
        <div className="text-sm font-semibold text-fg">
          Holidays admin surface
        </div>
        <div className="mt-2 text-xs text-fg-muted">
          This page is restricted to planners and admins. Current role:{" "}
          <span className="font-mono text-fg">{session.role}</span>.
        </div>
      </div>
    );
  }

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin"
        title="Holidays (Israel)"
        description="Israel holiday calendar consumed by the daily inventory flow projection and planning working-day math. The 75-row baseline is Hebcal-derived for 2026–2028; admins can add custom factory closures or edit defaults below."
        meta={
          <>
            <Badge tone="neutral" dotted>
              {total} {total === 1 ? "row" : "rows"}
            </Badge>
            {includeArchived && archivedCount > 0 ? (
              <Badge tone="warning" dotted>
                {archivedCount} archived
              </Badge>
            ) : null}
            {!canWrite ? (
              <Badge tone="info" dotted>
                read-only · planner
              </Badge>
            ) : null}
          </>
        }
        actions={
          canWrite ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowBulkImport(true)}
              >
                <Upload className="h-4 w-4" strokeWidth={2} />
                <span>Bulk import</span>
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                <span>Add holiday</span>
              </button>
            </>
          ) : null
        }
      />

      {/* -- Tom-Tax warning per checkpoint §10 GAP-AHC-1 residual ---------- */}
      <SectionCard tone="warning" density="compact">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg"
            strokeWidth={2}
          />
          <div className="text-xs text-fg">
            <div className="font-semibold text-fg-strong">
              Archived holidays are not yet excluded from planning runs.
            </div>
            <div className="mt-0.5 leading-relaxed text-fg-muted">
              Soft-deleting a holiday hides it from this list, but the planning
              engine and inventory-flow projection still treat it as a
              non-working day until W1 cycle 8 ships the consumer-side filter
              migration (GAP-AHC-1). Functional impact today is zero — no rows
              are archived yet. If you need to restore a date as a working day
              before cycle 8 lands, edit the row instead of archiving it.
            </div>
          </div>
        </div>
      </SectionCard>

      {/* -- Banner --------------------------------------------------------- */}
      {banner ? (
        <div
          className={
            banner.kind === "success"
              ? "rounded-md border border-success/40 bg-success-softer p-4 text-sm text-success-fg"
              : "rounded-md border border-danger/40 bg-danger-softer p-4 text-sm text-danger-fg"
          }
          role={banner.kind === "error" ? "alert" : "status"}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">{banner.message}</div>
              {banner.detail ? (
                <div className="mt-1 text-xs opacity-80">{banner.detail}</div>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm h-7 w-7 justify-center p-0"
              aria-label="Dismiss"
              onClick={() => setBanner(null)}
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : null}

      {/* -- Filters -------------------------------------------------------- */}
      <SectionCard
        eyebrow="Filters"
        title="Filter and search"
        density="compact"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Year
            </span>
            <select
              className="input"
              value={year === null ? "" : String(year)}
              onChange={(e) => {
                const v = e.target.value;
                setYear(v === "" ? null : parseInt(v, 10));
              }}
            >
              <option value="">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Type
            </span>
            <select
              className="input"
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter((e.target.value as HolidayType | "") || "")
              }
            >
              <option value="">All types</option>
              {HOLIDAY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 sm:col-span-1">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              aria-label="Include archived holidays"
            />
            <span className="text-xs text-fg">Include archived</span>
          </label>
          <div className="flex items-end justify-end">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void listQuery.refetch()}
              disabled={listQuery.isFetching}
            >
              <RefreshCw
                className={
                  listQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"
                }
                strokeWidth={2}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </SectionCard>

      {/* -- List ----------------------------------------------------------- */}
      <SectionCard
        eyebrow="Calendar"
        title="Holiday rows"
        description={
          listQuery.data
            ? `Last loaded: ${new Date(listQuery.data.as_of).toLocaleString()}`
            : "Loading…"
        }
        contentClassName="p-0"
      >
        {listQuery.isLoading ? (
          <SkeletonTable />
        ) : listQuery.isError ? (
          <div className="p-5">
            <ErrorState
              title="Could not load holidays"
              description={
                (listQuery.error as Error | undefined)?.message ?? "Unknown error."
              }
              action={
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void listQuery.refetch()}
                >
                  Retry
                </button>
              }
            />
          </div>
        ) : (listQuery.data?.rows ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={
                <CalendarDays
                  className="h-5 w-5 text-fg-faint"
                  strokeWidth={1.5}
                />
              }
              title="No holidays defined for the selected period"
              description="Adjust the filters above, or click Add holiday to create a new entry."
              action={
                canWrite ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowAdd(true)}
                  >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    <span>Add holiday</span>
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <HolidayTable
            rows={listQuery.data!.rows}
            canWrite={canWrite}
            onEdit={(row) => setEditTarget(row)}
            onArchive={(row) => setArchiveTarget(row)}
          />
        )}
      </SectionCard>

      {/* -- Modals --------------------------------------------------------- */}
      {showAdd && canWrite ? (
        <AddHolidayModal
          onClose={() => setShowAdd(false)}
          onSuccess={(date) => {
            setShowAdd(false);
            onMutationSuccess(`Holiday ${date} created.`);
          }}
          onError={(err) => onMutationError("Create", err)}
        />
      ) : null}

      {editTarget && canWrite ? (
        <EditHolidayModal
          row={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={(date) => {
            setEditTarget(null);
            onMutationSuccess(`Holiday ${date} updated.`);
          }}
          onError={(err) => onMutationError("Edit", err)}
        />
      ) : null}

      {archiveTarget && canWrite ? (
        <ArchiveHolidayModal
          row={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onSuccess={(date) => {
            setArchiveTarget(null);
            onMutationSuccess(`Holiday ${date} archived.`);
          }}
          onError={(err) => onMutationError("Archive", err)}
        />
      ) : null}

      {showBulkImport && canWrite ? (
        <BulkImportModal
          onClose={() => setShowBulkImport(false)}
          onSuccess={(result) => {
            setShowBulkImport(false);
            const replay = result.idempotent_replay
              ? " (idempotent replay)"
              : "";
            onMutationSuccess(
              `Bulk import committed${replay}: ${result.created_count} created, ${result.updated_count} updated, ${result.skipped_count} skipped.`,
            );
          }}
          onError={(err) => onMutationError("Bulk import", err)}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// SkeletonTable
// ---------------------------------------------------------------------------

function SkeletonTable(): JSX.Element {
  return (
    <div className="space-y-2 p-5" aria-busy="true" aria-live="polite">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 border-b border-border/30 pb-2"
        >
          <div className="h-4 w-24 shrink-0 rounded bg-bg-subtle" />
          <div className="h-4 flex-1 rounded bg-bg-subtle" />
          <div className="h-4 w-20 shrink-0 rounded bg-bg-subtle" />
          <div className="h-4 w-16 shrink-0 rounded bg-bg-subtle" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HolidayTable — desktop table + mobile card stream.
// ---------------------------------------------------------------------------

function HolidayTable({
  rows,
  canWrite,
  onEdit,
  onArchive,
}: {
  rows: HolidayRow[];
  canWrite: boolean;
  onEdit: (row: HolidayRow) => void;
  onArchive: (row: HolidayRow) => void;
}): JSX.Element {
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        a.holiday_date.localeCompare(b.holiday_date) ||
        a.holiday_name.localeCompare(b.holiday_name),
      ),
    [rows],
  );

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-bg-subtle/60">
              <Th>Date</Th>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Pickup</Th>
              <Th>Supply</Th>
              <Th>Notes</Th>
              <Th>Status</Th>
              {canWrite ? <Th align="right">Actions</Th> : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const archived = row.archived_at !== null;
              return (
                <tr
                  key={row.holiday_date}
                  className={
                    archived
                      ? "border-b border-border/40 bg-bg-subtle/40 last:border-b-0"
                      : "border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
                  }
                >
                  <td className="px-3 py-2 font-mono text-xs text-fg">
                    {row.holiday_date}
                  </td>
                  <td className="px-3 py-2 text-xs text-fg">
                    <div className="font-medium">{row.holiday_name}</div>
                    {row.holiday_name_he ? (
                      <div className="text-fg-muted" lang="he">
                        {row.holiday_name_he}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-fg">
                    {TYPE_LABEL[row.type]}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={row.blocks_pickup ? "warning" : "neutral"}>
                      {row.blocks_pickup ? "Blocks" : "Allows"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={row.blocks_supply ? "warning" : "neutral"}>
                      {row.blocks_supply ? "Blocks" : "Allows"}
                    </Badge>
                  </td>
                  <td
                    className="max-w-[260px] truncate px-3 py-2 text-xs text-fg-muted"
                    title={row.notes ?? undefined}
                  >
                    {row.notes ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {archived ? (
                      <Badge tone="warning">Archived</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </td>
                  {canWrite ? (
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm h-7 px-2"
                          onClick={() => onEdit(row)}
                          aria-label={`Edit ${row.holiday_date}`}
                          disabled={archived}
                          title={
                            archived
                              ? "Archived rows cannot be edited"
                              : "Edit metadata"
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm h-7 px-2"
                          onClick={() => onArchive(row)}
                          aria-label={`Archive ${row.holiday_date}`}
                          disabled={archived}
                          title={
                            archived ? "Already archived" : "Archive holiday"
                          }
                        >
                          <Archive className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card stream */}
      <div className="space-y-2 p-3 sm:hidden">
        {sorted.map((row) => {
          const archived = row.archived_at !== null;
          return (
            <div
              key={row.holiday_date}
              className={
                archived
                  ? "rounded border border-border/60 bg-bg-subtle/40 p-3"
                  : "rounded border border-border/70 bg-bg-raised p-3"
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold text-fg-strong">
                    {row.holiday_date}
                  </div>
                  <div className="mt-0.5 text-sm text-fg">
                    {row.holiday_name}
                  </div>
                  {row.holiday_name_he ? (
                    <div className="text-xs text-fg-muted" lang="he">
                      {row.holiday_name_he}
                    </div>
                  ) : null}
                </div>
                {archived ? (
                  <Badge tone="warning">Archived</Badge>
                ) : (
                  <Badge tone="success">Active</Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="neutral">{TYPE_LABEL[row.type]}</Badge>
                <Badge tone={row.blocks_pickup ? "warning" : "neutral"}>
                  {row.blocks_pickup ? "Blocks pickup" : "Allows pickup"}
                </Badge>
                <Badge tone={row.blocks_supply ? "warning" : "neutral"}>
                  {row.blocks_supply ? "Blocks supply" : "Allows supply"}
                </Badge>
              </div>
              {row.notes ? (
                <div className="mt-2 text-xs text-fg-muted">{row.notes}</div>
              ) : null}
              {canWrite ? (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm flex-1 justify-center"
                    onClick={() => onEdit(row)}
                    disabled={archived}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm flex-1 justify-center"
                    onClick={() => onArchive(row)}
                    disabled={archived}
                  >
                    <Archive className="h-3.5 w-3.5" strokeWidth={2} />
                    <span>Archive</span>
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}): JSX.Element {
  return (
    <th
      className={
        align === "right"
          ? "px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
          : "px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
      }
    >
      {children}
    </th>
  );
}

// ---------------------------------------------------------------------------
// Modal shell — minimal centered dialog (Radix Dialog is overkill for these
// simple admin forms; mobile @ 390px renders bottom-up sheet via items-end).
// ---------------------------------------------------------------------------

function ModalShell({
  title,
  description,
  onClose,
  children,
  footer,
  busy,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  busy?: boolean;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
      onClick={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-lg border border-border/70 bg-bg-raised shadow-xl sm:rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="modal-title"
              className="text-base font-semibold tracking-tightish text-fg-strong"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm h-8 w-8 shrink-0 justify-center p-0"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <div className="border-t border-border/70 bg-bg-subtle/60 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add holiday modal
// ---------------------------------------------------------------------------

interface FormState {
  holiday_date: string;
  holiday_name: string;
  holiday_name_he: string;
  type: HolidayType;
  blocks_pickup: boolean;
  blocks_supply: boolean;
  notes: string;
  allow_past: boolean;
}

const TODAY_ISO = (): string => {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function AddHolidayModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  onSuccess: (date: string) => void;
  onError: (err: Error) => void;
}): JSX.Element {
  const [form, setForm] = useState<FormState>({
    holiday_date: TODAY_ISO(),
    holiday_name: "",
    holiday_name_he: "",
    type: "full_holiday",
    blocks_pickup: true,
    blocks_supply: true,
    notes: "",
    allow_past: false,
  });

  const mutation = useMutation<{ holiday_date: string }, Error, FormState>({
    mutationFn: async (state) => {
      const body = {
        holiday_date: state.holiday_date,
        holiday_name: state.holiday_name.trim(),
        holiday_name_he: state.holiday_name_he.trim(),
        type: state.type,
        blocks_pickup: state.blocks_pickup,
        blocks_supply: state.blocks_supply,
        notes: state.notes.trim() === "" ? null : state.notes.trim(),
      };
      return postJson<typeof body, { holiday_date: string }>(
        "/api/admin/holidays",
        body,
      );
    },
    onSuccess: (resp) => onSuccess(resp.holiday_date ?? form.holiday_date),
    onError,
  });

  const today = TODAY_ISO();
  const isPast = form.holiday_date < today;
  const pastBlocked = isPast && !form.allow_past;

  const isValid =
    /^\d{4}-\d{2}-\d{2}$/.test(form.holiday_date) &&
    form.holiday_name.trim().length > 0 &&
    form.holiday_name_he.trim().length > 0 &&
    !pastBlocked;

  // Default flag rules per type (W4 spec §4.2 + inventory-flow contract §7.2).
  const onTypeChange = (next: HolidayType) => {
    setForm((prev) => ({
      ...prev,
      type: next,
      blocks_pickup: next === "full_holiday" ? true : false,
      blocks_supply: next === "full_holiday" ? true : false,
    }));
  };

  return (
    <ModalShell
      title="Add holiday"
      description="Records a new entry in the Israel holiday calendar. Defaults follow Hebcal rules; admins can override pickup and supply per row."
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isValid || mutation.isPending}
            onClick={() => mutation.mutate(form)}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                <span>Saving…</span>
              </>
            ) : (
              <span>Save holiday</span>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Date" hint="Format YYYY-MM-DD. Defaults to today.">
          <input
            type="date"
            className="input"
            value={form.holiday_date}
            onChange={(e) =>
              setForm((p) => ({ ...p, holiday_date: e.target.value }))
            }
          />
          {isPast ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={form.allow_past}
                onChange={(e) =>
                  setForm((p) => ({ ...p, allow_past: e.target.checked }))
                }
              />
              <span>
                Confirm: I want to record a past date (backfill / audit replay).
              </span>
            </label>
          ) : null}
        </Field>

        <Field label="Name (English)">
          <input
            type="text"
            className="input"
            value={form.holiday_name}
            onChange={(e) =>
              setForm((p) => ({ ...p, holiday_name: e.target.value }))
            }
            placeholder="e.g. Tom factory closure"
            maxLength={256}
          />
        </Field>

        <Field label="Name (Hebrew)">
          <input
            type="text"
            className="input"
            value={form.holiday_name_he}
            onChange={(e) =>
              setForm((p) => ({ ...p, holiday_name_he: e.target.value }))
            }
            placeholder="Hebrew display name"
            lang="he"
            maxLength={256}
          />
        </Field>

        <Field label="Type">
          <select
            className="input"
            value={form.type}
            onChange={(e) => onTypeChange(e.target.value as HolidayType)}
          >
            {HOLIDAY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded border border-border/70 bg-bg-subtle/30 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={form.blocks_pickup}
              onChange={(e) =>
                setForm((p) => ({ ...p, blocks_pickup: e.target.checked }))
              }
            />
            <span>Blocks pickup</span>
          </label>
          <label className="flex items-center gap-2 rounded border border-border/70 bg-bg-subtle/30 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={form.blocks_supply}
              onChange={(e) =>
                setForm((p) => ({ ...p, blocks_supply: e.target.checked }))
              }
            />
            <span>Blocks supply</span>
          </label>
        </div>

        <Field label="Notes" hint="Optional. Up to 2048 characters.">
          <textarea
            className="input min-h-[80px]"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            maxLength={2048}
            rows={3}
          />
        </Field>

        {mutation.isError ? (
          <div className="rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg">
            {(mutation.error as Error).message}
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Edit holiday modal — PK immutable per AHC-5; conflict warning surfaces if
// a stale client tries to PATCH holiday_date (W1 returns 422 PRIMARY_KEY_IMMUTABLE).
// ---------------------------------------------------------------------------

function EditHolidayModal({
  row,
  onClose,
  onSuccess,
  onError,
}: {
  row: HolidayRow;
  onClose: () => void;
  onSuccess: (date: string) => void;
  onError: (err: Error) => void;
}): JSX.Element {
  const [form, setForm] = useState({
    holiday_name: row.holiday_name,
    holiday_name_he: row.holiday_name_he,
    type: row.type,
    blocks_pickup: row.blocks_pickup,
    blocks_supply: row.blocks_supply,
    notes: row.notes ?? "",
  });

  const mutation = useMutation<unknown, Error, typeof form>({
    mutationFn: async (state) => {
      const body = {
        holiday_name: state.holiday_name.trim(),
        holiday_name_he: state.holiday_name_he.trim(),
        type: state.type,
        blocks_pickup: state.blocks_pickup,
        blocks_supply: state.blocks_supply,
        notes: state.notes.trim() === "" ? null : state.notes.trim(),
      };
      return postJson(
        `/api/admin/holidays/${encodeURIComponent(row.holiday_date)}`,
        body,
        "PATCH",
      );
    },
    onSuccess: () => onSuccess(row.holiday_date),
    onError,
  });

  const isValid =
    form.holiday_name.trim().length > 0 &&
    form.holiday_name_he.trim().length > 0;

  return (
    <ModalShell
      title={`Edit holiday — ${row.holiday_date}`}
      description="The date is immutable. To change the date, archive this row and create a new one. All other fields are editable."
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isValid || mutation.isPending}
            onClick={() => mutation.mutate(form)}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                <span>Saving…</span>
              </>
            ) : (
              <span>Save changes</span>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded border border-border/70 bg-bg-subtle/40 p-3 text-xs text-fg-muted">
          <div>
            <span className="font-semibold text-fg">Date:</span>{" "}
            <span className="font-mono">{row.holiday_date}</span> (locked)
          </div>
        </div>

        <Field label="Name (English)">
          <input
            type="text"
            className="input"
            value={form.holiday_name}
            onChange={(e) =>
              setForm((p) => ({ ...p, holiday_name: e.target.value }))
            }
            maxLength={256}
          />
        </Field>

        <Field label="Name (Hebrew)">
          <input
            type="text"
            className="input"
            value={form.holiday_name_he}
            onChange={(e) =>
              setForm((p) => ({ ...p, holiday_name_he: e.target.value }))
            }
            lang="he"
            maxLength={256}
          />
        </Field>

        <Field label="Type">
          <select
            className="input"
            value={form.type}
            onChange={(e) =>
              setForm((p) => ({ ...p, type: e.target.value as HolidayType }))
            }
          >
            {HOLIDAY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-fg-muted">
            Changing the type does not auto-update pickup or supply flags.
          </p>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded border border-border/70 bg-bg-subtle/30 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={form.blocks_pickup}
              onChange={(e) =>
                setForm((p) => ({ ...p, blocks_pickup: e.target.checked }))
              }
            />
            <span>Blocks pickup</span>
          </label>
          <label className="flex items-center gap-2 rounded border border-border/70 bg-bg-subtle/30 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={form.blocks_supply}
              onChange={(e) =>
                setForm((p) => ({ ...p, blocks_supply: e.target.checked }))
              }
            />
            <span>Blocks supply</span>
          </label>
        </div>

        <Field label="Notes">
          <textarea
            className="input min-h-[80px]"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            maxLength={2048}
            rows={3}
          />
        </Field>

        {mutation.isError ? (
          <div className="rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg">
            {(mutation.error as Error).message}
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Archive holiday modal (soft-delete).
// W1 DELETE schema: { reason (REQUIRED, min 1, max 2048), idempotency_key? }.
// ---------------------------------------------------------------------------

function ArchiveHolidayModal({
  row,
  onClose,
  onSuccess,
  onError,
}: {
  row: HolidayRow;
  onClose: () => void;
  onSuccess: (date: string) => void;
  onError: (err: Error) => void;
}): JSX.Element {
  const [reason, setReason] = useState("");

  const mutation = useMutation<unknown, Error, { reason: string }>({
    mutationFn: async ({ reason: r }) => {
      return postJson(
        `/api/admin/holidays/${encodeURIComponent(row.holiday_date)}`,
        { reason: r },
        "DELETE",
      );
    },
    onSuccess: () => onSuccess(row.holiday_date),
    onError,
  });

  const isValid = reason.trim().length > 0;

  return (
    <ModalShell
      title={`Archive holiday — ${row.holiday_date}`}
      description="Archiving sets archived_at and hides this row from the default list. Historical planning runs are unaffected; future runs continue to treat the date as a non-working day until the W1 cycle 8 consumer-side filter ships (GAP-AHC-1)."
      onClose={onClose}
      busy={mutation.isPending}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!isValid || mutation.isPending}
            onClick={() => mutation.mutate({ reason: reason.trim() })}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                <span>Archiving…</span>
              </>
            ) : (
              <span>Archive holiday</span>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded border border-border/70 bg-bg-subtle/40 p-3 text-xs text-fg">
          <div className="font-semibold">{row.holiday_name}</div>
          {row.holiday_name_he ? (
            <div className="text-fg-muted" lang="he">
              {row.holiday_name_he}
            </div>
          ) : null}
          <div className="mt-1 font-mono text-fg-muted">{row.holiday_date}</div>
        </div>

        <Field label="Reason" hint="Required. Captured in the audit log.">
          <textarea
            className="input min-h-[80px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Created by mistake; covered by adjacent row 2027-04-12."
            maxLength={2048}
            rows={3}
          />
        </Field>

        {mutation.isError ? (
          <div className="rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg">
            {(mutation.error as Error).message}
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Bulk import modal — preview + commit.
// CSV header expected: holiday_date,holiday_name,holiday_name_he,type,blocks_pickup,blocks_supply,notes
// JSON: array of objects with the same field names.
// ---------------------------------------------------------------------------

function BulkImportModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  onSuccess: (result: BulkImportCommitResponse) => void;
  onError: (err: Error) => void;
}): JSX.Element {
  const [raw, setRaw] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BulkImportPreviewResponse | null>(
    null,
  );
  const [mode, setMode] = useState<"upsert" | "skip-existing">("upsert");
  const [idempotencyKey] = useState<string>(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `bulk-${Date.now()}`,
  );

  const parseRows = (input: string): BulkImportRow[] => {
    const trimmed = input.trim();
    if (trimmed.length === 0) return [];
    if (trimmed.startsWith("[")) {
      const arr = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(arr)) {
        throw new Error("JSON must be an array of objects.");
      }
      return arr.map((r, i) => coerceRow(r, i));
    }
    // CSV
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) {
      throw new Error(
        "CSV needs a header row and at least one data row. Header: holiday_date,holiday_name,holiday_name_he,type,blocks_pickup,blocks_supply,notes",
      );
    }
    const header = lines[0].split(",").map((s) => s.trim());
    const required = [
      "holiday_date",
      "holiday_name",
      "holiday_name_he",
      "type",
      "blocks_pickup",
      "blocks_supply",
    ];
    for (const r of required) {
      if (!header.includes(r)) {
        throw new Error(`CSV header is missing column: ${r}`);
      }
    }
    return lines.slice(1).map((line, i) => {
      const cells = line.split(",").map((s) => s.trim());
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => {
        obj[h] = cells[idx] ?? "";
      });
      return coerceRow(obj, i + 1);
    });
  };

  const coerceRow = (raw: unknown, index: number): BulkImportRow => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`Row ${index + 1}: not an object`);
    }
    const o = raw as Record<string, unknown>;
    const date = String(o.holiday_date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(
        `Row ${index + 1}: holiday_date must be YYYY-MM-DD (got "${date}")`,
      );
    }
    const type = String(o.type ?? "").trim();
    if (!HOLIDAY_TYPES.includes(type as HolidayType)) {
      throw new Error(
        `Row ${index + 1}: type must be one of ${HOLIDAY_TYPES.join(", ")} (got "${type}")`,
      );
    }
    const toBool = (v: unknown): boolean => {
      if (typeof v === "boolean") return v;
      const s = String(v ?? "").trim().toLowerCase();
      if (s === "true" || s === "1" || s === "yes") return true;
      if (s === "false" || s === "0" || s === "no" || s === "") return false;
      throw new Error(
        `Row ${index + 1}: blocks_* must be true/false (got "${v}")`,
      );
    };
    return {
      holiday_date: date,
      holiday_name: String(o.holiday_name ?? "").trim(),
      holiday_name_he: String(o.holiday_name_he ?? "").trim(),
      type: type as HolidayType,
      blocks_pickup: toBool(o.blocks_pickup),
      blocks_supply: toBool(o.blocks_supply),
      notes:
        o.notes === null || o.notes === undefined || String(o.notes).trim() === ""
          ? null
          : String(o.notes).trim(),
    };
  };

  const previewMutation = useMutation<
    BulkImportPreviewResponse,
    Error,
    BulkImportRow[]
  >({
    mutationFn: async (rows) => {
      return postJson<{ rows: BulkImportRow[] }, BulkImportPreviewResponse>(
        "/api/admin/holidays/bulk-import/preview",
        { rows },
      );
    },
    onSuccess: (resp) => setPreview(resp),
    onError,
  });

  const commitMutation = useMutation<
    BulkImportCommitResponse,
    Error,
    BulkImportRow[]
  >({
    mutationFn: async (rows) => {
      return postJson<
        {
          rows: BulkImportRow[];
          mode: "upsert" | "skip-existing";
          idempotency_key: string;
        },
        BulkImportCommitResponse
      >("/api/admin/holidays/bulk-import/commit", {
        rows,
        mode,
        idempotency_key: idempotencyKey,
      });
    },
    onSuccess: (resp) => onSuccess(resp),
    onError,
  });

  const onPreview = () => {
    setParseError(null);
    setPreview(null);
    try {
      const rows = parseRows(raw);
      if (rows.length === 0) {
        setParseError("No rows to import.");
        return;
      }
      previewMutation.mutate(rows);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  };

  const onCommit = () => {
    if (!preview) return;
    setParseError(null);
    try {
      const rows = parseRows(raw);
      commitMutation.mutate(rows);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    }
  };

  const busy = previewMutation.isPending || commitMutation.isPending;

  return (
    <ModalShell
      title="Bulk import holidays"
      description="Paste CSV or JSON below. Preview shows the diff against the live DB; commit applies it. Idempotency key is generated per session."
      onClose={onClose}
      busy={busy}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-fg-muted">
            <label className="inline-flex items-center gap-2">
              <span>Mode:</span>
              <select
                className="input h-7 py-0 text-xs"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as "upsert" | "skip-existing")
                }
                disabled={busy}
              >
                <option value="upsert">upsert (update existing)</option>
                <option value="skip-existing">skip-existing (new only)</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            {!preview ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onPreview}
                disabled={busy || raw.trim().length === 0}
              >
                {previewMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                    <span>Previewing…</span>
                  </>
                ) : (
                  <span>Preview</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onCommit}
                disabled={busy}
              >
                {commitMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                    <span>Committing…</span>
                  </>
                ) : (
                  <span>
                    Commit (
                    {preview.to_create.length +
                      preview.to_update.length +
                      preview.to_skip.length}{" "}
                    rows)
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Field
          label="Paste CSV or JSON"
          hint="CSV header: holiday_date,holiday_name,holiday_name_he,type,blocks_pickup,blocks_supply,notes"
        >
          <textarea
            className="input min-h-[160px] font-mono text-xs"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setPreview(null);
            }}
            placeholder='holiday_date,holiday_name,holiday_name_he,type,blocks_pickup,blocks_supply,notes&#10;2027-12-31,New Year Eve,(Hebrew display name here),full_holiday,true,true,Tom factory closure'
            disabled={busy}
            rows={8}
          />
        </Field>

        {parseError ? (
          <div className="rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg">
            {parseError}
          </div>
        ) : null}

        {preview ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Stat label="Create" value={preview.to_create.length} tone="success" />
              <Stat label="Update" value={preview.to_update.length} tone="info" />
              <Stat label="Skip" value={preview.to_skip.length} tone="neutral" />
              <Stat label="Reject" value={preview.to_reject.length} tone="danger" />
            </div>

            {preview.to_reject.length > 0 ? (
              <div className="rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg">
                <div className="font-semibold">Rejected rows:</div>
                <ul className="mt-1 list-disc pl-5">
                  {preview.to_reject.map((r, i) => (
                    <li key={i}>{r.reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <details className="text-xs">
              <summary className="cursor-pointer text-fg-muted">
                Show preview detail
              </summary>
              <div className="mt-2 space-y-2">
                {preview.to_create.length > 0 ? (
                  <PreviewList
                    label="To create"
                    items={preview.to_create.map((r) => r.holiday_date)}
                  />
                ) : null}
                {preview.to_update.length > 0 ? (
                  <PreviewList
                    label="To update"
                    items={preview.to_update.map((u) => u.date)}
                  />
                ) : null}
                {preview.to_skip.length > 0 ? (
                  <PreviewList
                    label="To skip (no changes)"
                    items={preview.to_skip.map((r) => r.holiday_date)}
                  />
                ) : null}
              </div>
            </details>
          </div>
        ) : null}

        {previewMutation.isError ? (
          <div className="rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg">
            {(previewMutation.error as Error).message}
          </div>
        ) : null}
        {commitMutation.isError ? (
          <div className="rounded border border-danger/40 bg-danger-softer p-3 text-xs text-danger-fg">
            {(commitMutation.error as Error).message}
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "info" | "neutral" | "danger";
}): JSX.Element {
  const cls: Record<typeof tone, string> = {
    success: "border-success/40 bg-success-softer text-success-fg",
    info: "border-info/40 bg-info-softer text-info-fg",
    neutral: "border-border/70 bg-bg-subtle text-fg",
    danger: "border-danger/40 bg-danger-softer text-danger-fg",
  };
  return (
    <div className={`rounded border p-2 text-center ${cls[tone]}`}>
      <div className="font-mono text-base font-semibold">{value}</div>
      <div className="text-3xs uppercase tracking-sops">{label}</div>
    </div>
  );
}

function PreviewList({
  label,
  items,
}: {
  label: string;
  items: string[];
}): JSX.Element {
  return (
    <div>
      <div className="font-semibold text-fg-muted">
        {label} ({items.length})
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.slice(0, 50).map((d) => (
          <span
            key={d}
            className="rounded border border-border/70 bg-bg-subtle px-1.5 py-0.5 font-mono text-3xs text-fg"
          >
            {d}
          </span>
        ))}
        {items.length > 50 ? (
          <span className="text-3xs text-fg-muted">
            … +{items.length - 50} more
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field — labeled control wrapper.
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1 block text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {label}
      </span>
      {children}
      {hint ? <p className="mt-1 text-xs text-fg-muted">{hint}</p> : null}
    </label>
  );
}
