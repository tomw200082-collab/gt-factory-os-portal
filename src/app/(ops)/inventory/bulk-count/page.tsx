"use client";

// ---------------------------------------------------------------------------
// Bulk Count — count the whole factory, area by area.
//
// Sub-page of /inventory for mass physical counting of every finished good
// and raw material / packaging component. Built for the real factory walk:
// the floor is arranged by area (packaging components, raw ingredients,
// syrups & alcohol, teas, matcha, tea leaves, …) and the curated Groups v1
// vocabulary mirrors those areas, so the page sections + filters follow the
// same physical order the operator walks.
//
// Core mechanics:
//   - Rows come from GET /api/stock (FG + RM_PKG) — names, codes, UOMs,
//     curated group keys, last-movement, never-counted. The blind-count
//     invariant applies: NO on-hand quantity is ever read or rendered here.
//   - Each row submits through the existing physical-count pipeline:
//     GET /api/physical-count/open (snapshot) → POST /api/physical-count.
//     Small variance auto-posts; large variance is held for planner
//     approval, exactly like /stock/physical-count.
//   - Enter submits the row and moves focus to the next uncounted row, so a
//     full shelf can be counted without touching the mouse.
//   - "Counted" tick marks persist per calendar day in localStorage so a
//     refresh mid-walk doesn't lose the session (posted counts are already
//     safe in the ledger regardless).
//
// Filtering / classification:
//   - Type tabs: All / FG / RM / PKG with live counts.
//   - Curated group chips (Hebrew operator labels, factory display order)
//     for both vocabularies, multi-select — "show me just these shelves".
//   - "By product line" filter for components (used_by_product_groups).
//   - Search (`/` to focus), Remaining / Counted view, Never-counted and
//     Stale (>14d) quick filters, in-section sort (name / code / oldest
//     movement first).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session-provider";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { GroupFilterBar } from "@/components/filters/GroupFilterBar";
import {
  NO_GROUP,
  groupKeyLabel,
  groupsByKey,
  useGroups,
  type GroupLike,
} from "@/lib/taxonomy/groups";
import { friendlyCountError } from "@/lib/copy/physical-count-errors";
import { cn } from "@/lib/cn";
import {
  EMPTY_FILTERS,
  STALE_DAYS,
  anyFilterActive,
  buildSections,
  isStale,
  parseStored,
  progressOf,
  rowMatches,
  storageKey,
  toBulkRow,
  type BulkCountRow,
  type BulkFilters,
  type BulkItemType,
  type BulkSection,
  type BulkSortKey,
  type BulkStockRow,
  type CountedEntry,
  type CountedMap,
} from "./_lib/bulk-count";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

interface PhysicalCountOpenResponse {
  snapshot_id: string;
  item_type: BulkItemType;
  item_id: string;
  item_display_name: string;
  unit_default: string;
  opened_at: string;
  idempotent_open: boolean;
}

async function fetchStock(itemType: "FG" | "RM_PKG"): Promise<BulkStockRow[]> {
  const res = await fetch(`/api/stock?item_type=${itemType}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`STOCK_FETCH_${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.rows ?? []);
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `bc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function relativeLabel(iso: string | null): string {
  if (!iso) return "no movement yet";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "moved today";
  if (days === 1) return "moved yesterday";
  if (days < 30) return `moved ${days}d ago`;
  const months = Math.floor(days / 30);
  return `moved ${months} mo ago`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Per-row submission state
// ---------------------------------------------------------------------------

type RowPhase = "saving" | undefined;

// ---------------------------------------------------------------------------
// Type badge — same visual language as /stock/physical-count
// ---------------------------------------------------------------------------

function TypeChip({ type }: { type: BulkItemType }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-sops",
        type === "FG"
          ? "bg-info-softer text-info-fg"
          : type === "PKG"
            ? "bg-warning-softer text-warning-fg"
            : "bg-bg-subtle text-fg-muted",
      )}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Count row
// ---------------------------------------------------------------------------

function CountRow({
  row,
  counted,
  phase,
  error,
  canReview,
  onSubmit,
  onRecount,
  registerInput,
}: {
  row: BulkCountRow;
  counted: CountedEntry | undefined;
  phase: RowPhase;
  error: string | undefined;
  /** True when the session role may open the planner approval surface. */
  canReview: boolean;
  onSubmit: (row: BulkCountRow, qty: string) => void;
  onRecount: (rowKey: string) => void;
  registerInput: (rowKey: string, el: HTMLInputElement | null) => void;
}) {
  const [qty, setQty] = useState("");
  // Zero-count guard: a count of 0 is legitimate but high-impact (it can
  // zero an item's stock), so it takes one extra deliberate confirmation.
  const [confirmZero, setConfirmZero] = useState(false);
  const saving = phase === "saving";
  const qtyNum = Number(qty);
  const qtyValid = qty.trim() !== "" && Number.isFinite(qtyNum) && qtyNum >= 0;
  const isZero = qtyValid && qtyNum === 0;
  // A rejected count means "recount this item" — the entry controls return.
  const rejected = counted?.status === "rejected";
  const showEntry = !counted || rejected;

  function trySubmit() {
    if (!qtyValid || saving) return;
    if (isZero && !confirmZero) {
      setConfirmZero(true);
      return;
    }
    setConfirmZero(false);
    onSubmit(row, qty);
  }

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/40 px-3 py-2.5 transition-colors sm:px-4",
        counted && !rejected ? "bg-success-softer/30" : "hover:bg-bg-subtle/40",
      )}
      data-testid={`bulk-count-row-${row.item_type}-${row.item_id}`}
    >
      {/* Identity */}
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-2.5">
        <TypeChip type={row.item_type} />
        <div className="min-w-0">
          <div
            className="truncate text-sm font-medium text-fg"
            dir="auto"
            title={row.name}
          >
            {row.name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-fg-subtle">
            <span className="truncate font-mono">{row.item_id}</span>
            {row.never_counted ? (
              <span className="italic text-warning-fg">never counted</span>
            ) : (
              <span
                className={cn(isStale(row.last_event_at) && "text-warning-fg")}
              >
                {relativeLabel(row.last_event_at)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Count entry / result */}
      {!showEntry && counted ? (
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1",
              counted.status === "posted"
                ? "bg-success-softer text-success-fg ring-success/30"
                : "bg-warning-softer text-warning-fg ring-warning/40",
            )}
          >
            {counted.status === "posted" ? (
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.75" />
                <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            )}
            {counted.qty} {counted.unit}
            <span className="font-normal opacity-75">· {timeLabel(counted.at)}</span>
          </span>
          {counted.status === "pending" ? (
            canReview && counted.submission_id ? (
              <Link
                href={`/inbox/approvals/physical-count/${encodeURIComponent(counted.submission_id)}`}
                className="text-2xs font-medium text-warning-fg underline hover:no-underline"
                title="Variance exceeded the threshold — stock will not change until a planner approves."
              >
                Review approval
              </Link>
            ) : (
              <span
                className="text-2xs text-fg-muted"
                title="Variance exceeded the threshold — stock will not change until a planner approves. The badge updates here once it is decided."
              >
                Awaiting planner approval
              </span>
            )
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm text-fg-muted"
            onClick={() => onRecount(row.key)}
            disabled={saving}
            data-testid="bulk-count-recount"
          >
            Recount
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            ref={(el) => registerInput(row.key, el)}
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            placeholder="0"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              setConfirmZero(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                trySubmit();
              }
            }}
            disabled={saving}
            className="input h-10 w-24 text-right text-base font-semibold tabular-nums"
            aria-label={`Counted quantity for ${row.name}`}
            data-testid="bulk-count-qty"
          />
          {/* Unit is locked to the item master's counting unit — submitting in
              any other unit is refused server-side (UNIT_INCOMPATIBLE). */}
          <span
            className="w-12 shrink-0 text-center text-xs font-semibold uppercase text-fg-muted"
            title="Counting unit — set on the item master"
          >
            {row.default_uom}
          </span>
          {confirmZero ? (
            <>
              <button
                type="button"
                className="btn btn-danger btn-sm h-10"
                onClick={trySubmit}
                disabled={saving}
                aria-label={`Confirm zero count for ${row.name}`}
                data-testid="bulk-count-confirm-zero"
              >
                Confirm 0
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm h-10"
                onClick={() => setConfirmZero(false)}
                disabled={saving}
              >
                Change
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm h-10"
              onClick={trySubmit}
              disabled={!qtyValid || saving}
              aria-label={`Save count for ${row.name}`}
              data-testid="bulk-count-save"
            >
              {saving ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              ) : (
                "Save"
              )}
            </button>
          )}
        </div>
      )}

      {confirmZero ? (
        <div
          className="basis-full text-2xs text-danger-fg"
          role="alert"
          data-testid="bulk-count-zero-warning"
        >
          Zero means no stock on hand for this item. Confirm to save the zero count.
        </div>
      ) : null}

      {rejected && counted ? (
        <div
          className="basis-full text-2xs text-danger-fg"
          data-testid="bulk-count-rejected-note"
        >
          Previous count ({counted.qty} {counted.unit} at {timeLabel(counted.at)}) was
          rejected by the planner — stock was not changed. Count this item again.
        </div>
      ) : null}

      {error ? (
        <div
          className="basis-full text-2xs text-danger-fg"
          role="alert"
          data-testid="bulk-count-row-error"
        >
          {error}
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BulkCountPage() {
  const { session } = useSession();
  // Planner approval surface is planner/admin-gated (middleware + layout);
  // operators get a non-linked status label instead of a dead-end link.
  const canReview = session.role === "planner" || session.role === "admin";

  // --- data -----------------------------------------------------------------
  const fgQuery = useQuery({
    queryKey: ["stock", "FG"],
    queryFn: () => fetchStock("FG"),
    staleTime: 60_000,
  });
  const rmQuery = useQuery({
    queryKey: ["stock", "RM_PKG"],
    queryFn: () => fetchStock("RM_PKG"),
    staleTime: 60_000,
  });
  const { data: groupsData } = useGroups();

  const rows = useMemo<BulkCountRow[]>(() => {
    const all = [...(fgQuery.data ?? []), ...(rmQuery.data ?? [])];
    const out: BulkCountRow[] = [];
    for (const r of all) {
      const b = toBulkRow(r);
      if (b) out.push(b);
    }
    return out;
  }, [fgQuery.data, rmQuery.data]);

  const productGroupsByKey = useMemo(
    () => groupsByKey(groupsData?.product_groups),
    [groupsData],
  );
  const materialGroupsByKey = useMemo(
    () => groupsByKey(groupsData?.material_groups),
    [groupsData],
  );

  // --- counted-this-session state (persisted per day) ------------------------
  const [counted, setCounted] = useState<CountedMap>({});
  const storageKeyRef = useRef(storageKey());
  useEffect(() => {
    try {
      setCounted(parseStored(window.localStorage.getItem(storageKeyRef.current)));
    } catch {
      // localStorage unavailable (private mode) — session still works in-memory.
    }
  }, []);
  const persistCounted = useCallback((next: CountedMap) => {
    setCounted(next);
    try {
      window.localStorage.setItem(storageKeyRef.current, JSON.stringify(next));
    } catch {
      // best-effort persistence only
    }
  }, []);

  // --- filters ----------------------------------------------------------------
  const [filters, setFilters] = useState<BulkFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<BulkSortKey>("name");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        document.activeElement?.tagName !== "SELECT"
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const patch = useCallback(
    (p: Partial<BulkFilters>) => setFilters((f) => ({ ...f, ...p })),
    [],
  );

  // --- derived rows / sections -------------------------------------------------
  const visibleRows = useMemo(
    () => rows.filter((r) => rowMatches(r, filters, counted)),
    [rows, filters, counted],
  );

  // Section order: the curated display_order IS the factory walk order.
  // Product-group sections walk first, then material groups, NO_GROUP last
  // within each vocabulary.
  const orderOf = useCallback(
    (sectionKey: string): number => {
      const [vocab, ...rest] = sectionKey.split(":");
      const key = rest.join(":");
      const base = vocab === "pg" ? 0 : 100_000;
      if (key === NO_GROUP) return base + 99_999;
      const g =
        vocab === "pg" ? productGroupsByKey.get(key) : materialGroupsByKey.get(key);
      const order = (g as { display_order?: number } | undefined)?.display_order;
      return base + (order ?? 99_998);
    },
    [productGroupsByKey, materialGroupsByKey],
  );

  const sections = useMemo<BulkSection[]>(
    () => buildSections(visibleRows, orderOf, sort),
    [visibleRows, orderOf, sort],
  );

  const sectionLabel = useCallback(
    (s: BulkSection): string =>
      groupKeyLabel(
        s.group_key,
        s.vocab === "pg" ? productGroupsByKey : materialGroupsByKey,
      ),
    [productGroupsByKey, materialGroupsByKey],
  );

  // --- chip data -----------------------------------------------------------------
  // Counts respect the type tab + search (not the group selection itself) so
  // chip numbers answer "how many items are on this shelf in the current view".
  const chipBase = useMemo(() => {
    const f: BulkFilters = { ...filters, productGroups: [], materialGroups: [] };
    return rows.filter((r) => rowMatches(r, f, counted));
  }, [rows, filters, counted]);

  const pgCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of chipBase) if (r.vocab === "pg") c[r.group_key] = (c[r.group_key] ?? 0) + 1;
    return c;
  }, [chipBase]);
  const mgCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of chipBase) if (r.vocab === "mg") c[r.group_key] = (c[r.group_key] ?? 0) + 1;
    return c;
  }, [chipBase]);

  const pgChips = useMemo(
    () =>
      (groupsData?.product_groups ?? []).filter((g) => (pgCounts[g.key] ?? 0) > 0) as GroupLike[],
    [groupsData, pgCounts],
  );
  const mgChips = useMemo(
    () =>
      (groupsData?.material_groups ?? []).filter((g) => (mgCounts[g.key] ?? 0) > 0) as GroupLike[],
    [groupsData, mgCounts],
  );

  // "By product line" — product groups consumed by visible components.
  const usedByCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of chipBase) {
      if (r.vocab !== "mg") continue;
      for (const k of r.used_by) c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [chipBase]);
  const usedByChips = useMemo(
    () =>
      (groupsData?.product_groups ?? []).filter(
        (g) => (usedByCounts[g.key] ?? 0) > 0,
      ) as GroupLike[],
    [groupsData, usedByCounts],
  );

  // --- type tab counts -------------------------------------------------------------
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { FG: 0, RM: 0, PKG: 0 };
    for (const r of rows) c[r.item_type] += 1;
    return c;
  }, [rows]);

  // --- progress ----------------------------------------------------------------------
  const overall = useMemo(() => progressOf(rows, counted), [rows, counted]);
  const visible = useMemo(() => progressOf(visibleRows, counted), [visibleRows, counted]);
  const pct = overall.total > 0 ? Math.round((overall.done / overall.total) * 100) : 0;

  // --- per-row submission --------------------------------------------------------------
  const [rowPhase, setRowPhase] = useState<Record<string, RowPhase>>({});
  const [rowError, setRowError] = useState<Record<string, string | undefined>>({});
  const inputRefs = useRef(new Map<string, HTMLInputElement | null>());
  const registerInput = useCallback((rowKey: string, el: HTMLInputElement | null) => {
    inputRefs.current.set(rowKey, el);
  }, []);

  const focusNextUncounted = useCallback(
    (afterKey: string, nextCounted: CountedMap) => {
      const flat: BulkCountRow[] = [];
      for (const s of sections) if (!collapsed.has(s.key)) flat.push(...s.rows);
      const idx = flat.findIndex((r) => r.key === afterKey);
      for (let i = idx + 1; i < flat.length; i += 1) {
        const entry = nextCounted[flat[i].key];
        // Rejected counts need a recount — they stay in the focus queue.
        if (entry && entry.status !== "rejected") continue;
        const el = inputRefs.current.get(flat[i].key);
        if (el) {
          el.focus();
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          return;
        }
      }
    },
    [sections, collapsed],
  );

  const submitRow = useCallback(
    async (row: BulkCountRow, qtyStr: string) => {
      const qty = Number(qtyStr);
      if (!Number.isFinite(qty) || qty < 0) {
        setRowError((e) => ({ ...e, [row.key]: "Quantity must be a non-negative number." }));
        return;
      }
      setRowError((e) => ({ ...e, [row.key]: undefined }));
      setRowPhase((p) => ({ ...p, [row.key]: "saving" }));
      // Tracks a snapshot that was opened but not consumed by a successful
      // submit. Released in finally so a failed submit never leaves the item
      // frozen on the server until the reaper job catches it.
      let unconsumedSnapshotId: string | null = null;
      try {
        // 1. Open (or idempotently resume) the blind-count snapshot.
        const q = new URLSearchParams({ item_type: row.item_type, item_id: row.item_id });
        const openRes = await fetch(`/api/physical-count/open?${q.toString()}`, {
          headers: { Accept: "application/json" },
        });
        const openBody = (await openRes.json().catch(() => null)) as
          | PhysicalCountOpenResponse
          | null;
        if (!openRes.ok || !openBody?.snapshot_id) {
          setRowError((e) => ({
            ...e,
            [row.key]: `Could not start the count. ${friendlyCountError(openBody, openRes.status)}`,
          }));
          return;
        }
        unconsumedSnapshotId = openBody.snapshot_id;
        // 2. Submit the counted quantity — always in the snapshot's unit
        //    (the item master's counting unit), never a client-side choice,
        //    so UNIT_INCOMPATIBLE conflicts cannot happen.
        const unit = openBody.unit_default;
        const res = await fetch("/api/physical-count", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            idempotency_key: newIdempotencyKey(),
            snapshot_id: openBody.snapshot_id,
            event_at: new Date().toISOString(),
            counted_quantity: qty,
            unit,
            notes: null,
          }),
        });
        const body = (await res.json().catch(() => null)) as
          | {
              status?: string;
              submission_id?: string;
              computed_delta?: string;
            }
          | null;
        if (body?.status === "posted" || body?.status === "pending") {
          unconsumedSnapshotId = null; // consumed — nothing to release
          const entry: CountedEntry = {
            qty,
            unit,
            status: body.status,
            at: new Date().toISOString(),
            ...(body.submission_id ? { submission_id: body.submission_id } : {}),
            ...(body.computed_delta ? { delta: body.computed_delta } : {}),
          };
          const next = { ...counted, [row.key]: entry };
          persistCounted(next);
          focusNextUncounted(row.key, next);
        } else {
          setRowError((e) => ({
            ...e,
            [row.key]: `${friendlyCountError(body, res.status)} The count was not saved.`,
          }));
        }
      } catch (err) {
        setRowError((e) => ({
          ...e,
          [row.key]:
            err instanceof Error
              ? `Network error — the count was not saved. (${err.message})`
              : "Network error — the count was not saved.",
        }));
      } finally {
        if (unconsumedSnapshotId) {
          // Fire-and-forget release; if it fails, a retry reuses the still-open
          // snapshot idempotently and the server reaper expires it eventually.
          void fetch(
            `/api/physical-count/${encodeURIComponent(unconsumedSnapshotId)}/cancel`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: JSON.stringify({ idempotency_key: newIdempotencyKey() }),
            },
          ).catch(() => {});
        }
        setRowPhase((p) => ({ ...p, [row.key]: undefined }));
      }
    },
    [counted, persistCounted, focusNextUncounted],
  );

  // FLOW-104 — close the feedback loop on held counts: on load and on tab
  // focus, silently re-check every pending submission and flip its local tick
  // to posted / rejected once the planner has decided.
  const refreshPendingRef = useRef<() => void>(() => {});
  refreshPendingRef.current = () => {
    const pend = Object.entries(counted).filter(
      ([, e]) => e.status === "pending" && e.submission_id,
    );
    if (pend.length === 0) return;
    void Promise.all(
      pend.map(async ([key, e]) => {
        try {
          const res = await fetch(
            `/api/physical-count/${encodeURIComponent(e.submission_id ?? "")}`,
            { headers: { Accept: "application/json" } },
          );
          if (!res.ok) return null;
          const d = (await res.json().catch(() => null)) as { status?: string } | null;
          if (d?.status === "posted" || d?.status === "rejected") {
            const updated: CountedEntry = { ...e, status: d.status };
            return [key, updated] as [string, CountedEntry];
          }
          return null;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      const updates = results.filter((r): r is [string, CountedEntry] => r !== null);
      if (updates.length === 0) return;
      persistCounted({ ...counted, ...Object.fromEntries(updates) });
    });
  };
  useEffect(() => {
    // Small delay so the localStorage restore effect has populated `counted`.
    const t = setTimeout(() => refreshPendingRef.current(), 800);
    const onFocus = () => refreshPendingRef.current();
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(t);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Re-open a row for recounting: clears the LOCAL tick only. The previous
  // count stays in the ledger / approval queue; a new submission posts a new
  // count event on top.
  const recountRow = useCallback(
    (rowKey: string) => {
      const next = { ...counted };
      delete next[rowKey];
      persistCounted(next);
    },
    [counted, persistCounted],
  );

  function toggleSection(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const loading = fgQuery.isLoading || rmQuery.isLoading;
  const loadError = fgQuery.error || rmQuery.error;
  const pendingCount = useMemo(
    () => Object.values(counted).filter((e) => e.status === "pending").length,
    [counted],
  );

  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-5">
      <WorkflowHeader
        size="section"
        eyebrow="Stock"
        title="Bulk Count"
        backHref="/inventory"
        backLabel="Inventory"
        description="Walk the factory and count everything, area by area. Pick an area below, type what you see, press Enter — the cursor jumps to the next item."
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/60 bg-bg-raised/60 px-3 py-2 text-2xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M2.5 2.5l15 15M8.34 8.34A2.5 2.5 0 0013.66 11.66M6.25 6.25C4.7 7.26 3.5 8.5 2.5 10c1.5 2.5 4.5 5 7.5 5a7.4 7.4 0 003.25-.75M10 5c.84 0 1.65.14 2.41.4C14.1 6.2 15.6 7.9 17.5 10c-.5.83-1.1 1.6-1.75 2.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Blind count
          </span>
          <span>
            Expected quantities are hidden on purpose — count what you see. Small
            variance posts immediately; large variance is held for planner approval.
          </span>
        </div>
      </WorkflowHeader>

      {/* ===== Sticky progress bar ===== */}
      <div
        className="sticky top-0 z-20 -mx-1 rounded-lg border border-border/60 bg-bg/95 px-3 py-2.5 shadow-sm backdrop-blur-md sm:px-4"
        data-testid="bulk-count-progress"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-sm font-semibold tabular-nums text-fg">
            {overall.done} / {overall.total} counted today
          </span>
          <div
            className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-bg-subtle"
            role="progressbar"
            aria-valuenow={overall.done}
            aria-valuemin={0}
            aria-valuemax={overall.total}
            aria-label="Count progress"
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                pct >= 100 ? "bg-success" : "bg-accent",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-2xs tabular-nums text-fg-muted">{pct}%</span>
          {pendingCount > 0 ? (
            <span className="rounded-full bg-warning-softer px-2 py-0.5 text-2xs font-medium text-warning-fg ring-1 ring-warning/30">
              {pendingCount} awaiting approval
            </span>
          ) : null}
          {visible.total !== overall.total ? (
            <span className="text-2xs text-fg-subtle">
              In view: {visible.done}/{visible.total}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-3xs leading-snug text-fg-subtle">
          Progress ticks are saved on this device only — switching devices
          mid-walk resets the ticks, but every submitted count is already safe
          in the system.
        </p>
      </div>

      {/* ===== Filters ===== */}
      <div className="space-y-3 rounded-lg border border-border/60 bg-bg-subtle/25 p-3 sm:p-4">
        {/* Type tabs + search + sort */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-md bg-bg-subtle/60 p-0.5"
            role="tablist"
            aria-label="Item type"
          >
            {(
              [
                ["", `All (${rows.length})`],
                ["FG", `Finished Goods (${typeCounts.FG})`],
                ["RM", `Raw Materials (${typeCounts.RM})`],
                ["PKG", `Packaging (${typeCounts.PKG})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value || "all"}
                type="button"
                role="tab"
                aria-selected={filters.type === value}
                onClick={() => patch({ type: value as BulkFilters["type"], usedBy: value === "FG" ? "" : filters.usedBy })}
                className={cn(
                  "rounded px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  filters.type === value
                    ? "bg-bg text-fg shadow-sm"
                    : "text-fg-muted hover:text-fg",
                )}
                data-testid={`bulk-count-type-${value || "all"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative min-w-44 flex-1 sm:max-w-xs">
            <input
              ref={searchRef}
              type="search"
              value={filters.search}
              onChange={(e) => patch({ search: e.target.value })}
              placeholder="Search name or code… ( / )"
              className="input h-9 w-full pl-8 text-sm"
              aria-label="Search items"
              data-testid="bulk-count-search"
            />
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-fg-subtle" aria-hidden>
              ⌕
            </span>
          </div>

          <label className="flex items-center gap-1.5 text-2xs text-fg-muted">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as BulkSortKey)}
              className="input h-9 px-2 text-xs"
              aria-label="Sort rows within each area"
            >
              <option value="name">Name A→Z</option>
              <option value="sku">Code</option>
              <option value="oldest">Longest since movement</option>
            </select>
          </label>
        </div>

        {/* Area chips — the factory walk */}
        {(filters.type === "" || filters.type === "FG") && pgChips.length > 0 ? (
          <GroupFilterBar
            label="Product areas"
            groups={pgChips}
            counts={pgCounts}
            selected={filters.productGroups}
            onToggle={(key) =>
              patch({
                productGroups: filters.productGroups.includes(key)
                  ? filters.productGroups.filter((k) => k !== key)
                  : [...filters.productGroups, key],
              })
            }
            onClear={() => patch({ productGroups: [] })}
            allowNoGroup={(pgCounts[NO_GROUP] ?? 0) > 0}
            testId="bulk-count-pg-filter"
            ariaLabel="Product area filters"
          />
        ) : null}
        {filters.type !== "FG" && mgChips.length > 0 ? (
          <GroupFilterBar
            label="Material areas"
            groups={mgChips}
            counts={mgCounts}
            selected={filters.materialGroups}
            onToggle={(key) =>
              patch({
                materialGroups: filters.materialGroups.includes(key)
                  ? filters.materialGroups.filter((k) => k !== key)
                  : [...filters.materialGroups, key],
              })
            }
            onClear={() => patch({ materialGroups: [] })}
            allowNoGroup={(mgCounts[NO_GROUP] ?? 0) > 0}
            testId="bulk-count-mg-filter"
            ariaLabel="Material area filters"
          />
        ) : null}
        {filters.type !== "FG" && usedByChips.length > 0 ? (
          <GroupFilterBar
            label="By product line"
            groups={usedByChips}
            counts={usedByCounts}
            selected={filters.usedBy ? [filters.usedBy] : []}
            onToggle={(key) => patch({ usedBy: filters.usedBy === key ? "" : key })}
            onClear={() => patch({ usedBy: "" })}
            testId="bulk-count-usedby-filter"
            ariaLabel="Filter components by the product line that consumes them"
          />
        ) : null}

        {/* Quick view toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["", "Everything"],
              ["remaining", "Remaining"],
              ["counted", "Counted"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value || "everything"}
              type="button"
              aria-pressed={filters.view === value}
              onClick={() => patch({ view: value as BulkFilters["view"] })}
              className={cn(
                "rounded-full px-2.5 py-1 text-2xs font-medium ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                filters.view === value
                  ? "bg-accent-softer text-accent-fg ring-accent/30"
                  : "bg-bg-subtle text-fg-muted ring-border hover:text-fg",
              )}
              data-testid={`bulk-count-view-${value || "everything"}`}
            >
              {label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <button
            type="button"
            aria-pressed={filters.neverCountedOnly}
            onClick={() => patch({ neverCountedOnly: !filters.neverCountedOnly })}
            className={cn(
              "rounded-full px-2.5 py-1 text-2xs font-medium ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              filters.neverCountedOnly
                ? "bg-warning-softer text-warning-fg ring-warning/40"
                : "bg-bg-subtle text-fg-muted ring-border hover:text-fg",
            )}
            data-testid="bulk-count-nevercounted"
          >
            ∅ Never counted
          </button>
          <button
            type="button"
            aria-pressed={filters.staleOnly}
            onClick={() => patch({ staleOnly: !filters.staleOnly })}
            className={cn(
              "rounded-full px-2.5 py-1 text-2xs font-medium ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
              filters.staleOnly
                ? "bg-warning-softer text-warning-fg ring-warning/40"
                : "bg-bg-subtle text-fg-muted ring-border hover:text-fg",
            )}
            title={`Last movement ${STALE_DAYS}+ days ago`}
            data-testid="bulk-count-stale"
          >
            ⏱ Stale ({STALE_DAYS}d+)
          </button>
          {anyFilterActive(filters) ? (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="ml-1 text-2xs font-medium text-accent-fg underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              data-testid="bulk-count-clear-filters"
            >
              Clear all filters
            </button>
          ) : null}
          <span className="ml-auto text-2xs tabular-nums text-fg-subtle" aria-live="polite">
            Showing {visibleRows.length.toLocaleString()} of {rows.length.toLocaleString()}
          </span>
        </div>
      </div>

      {/* ===== Body ===== */}
      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg border border-border/40 px-4 py-3">
              <div className="h-4 w-10 rounded-full bg-bg-subtle" />
              <div className="h-4 flex-1 rounded bg-bg-subtle" />
              <div className="h-8 w-24 rounded bg-bg-subtle" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-danger/40 bg-danger-softer p-4 text-sm text-danger-fg" role="alert">
          <div className="font-semibold">Could not load the item list</div>
          <div className="mt-1 text-xs">{(loadError as Error).message}</div>
          <button
            type="button"
            onClick={() => {
              void fgQuery.refetch();
              void rmQuery.refetch();
            }}
            className="mt-2 text-xs font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-bg-subtle/30 px-6 py-12 text-center" data-testid="bulk-count-empty">
          <div className="text-3xl" aria-hidden>
            {filters.view === "remaining" && rows.length > 0 && overall.done === overall.total ? "🎉" : "⌕"}
          </div>
          <div className="mt-2 text-sm font-semibold text-fg">
            {filters.view === "remaining" && rows.length > 0 && overall.done === overall.total
              ? "Everything is counted — the walk is done."
              : "No items match the current filters."}
          </div>
          {anyFilterActive(filters) ? (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="mt-3 text-xs font-medium text-accent-fg underline hover:no-underline"
            >
              Reset filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section) => {
            const prog = progressOf(section.rows, counted);
            const done = prog.done === prog.total && prog.total > 0;
            const isCollapsed = collapsed.has(section.key);
            return (
              <section
                key={section.key}
                className="overflow-hidden rounded-lg border border-border/60"
                data-testid={`bulk-count-section-${section.key}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(section.key)}
                  aria-expanded={!isCollapsed}
                  className={cn(
                    // Sticky only from sm up — on phones the wrapping progress
                    // bar has a variable height, so pinned section headers
                    // could overlap it (FLOW-116).
                    "flex w-full items-center gap-2.5 border-b border-border/50 px-3 py-2.5 text-left backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:sticky sm:top-12 sm:z-10 sm:px-4",
                    done ? "bg-success-softer/80" : "bg-bg-raised/95 hover:bg-bg-subtle/80",
                  )}
                >
                  <svg
                    className={cn("h-3.5 w-3.5 shrink-0 text-fg-muted transition-transform", !isCollapsed && "rotate-90")}
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-fg" dir="auto">
                    {sectionLabel(section)}
                  </span>
                  <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-2xs text-fg-muted ring-1 ring-border">
                    {section.vocab === "pg" ? "FG" : "RM/PKG"}
                  </span>
                  {done ? (
                    <span className="inline-flex items-center gap-1 text-2xs font-semibold text-success-fg">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Done
                    </span>
                  ) : (
                    <span className="text-2xs tabular-nums text-fg-muted">
                      {prog.done}/{prog.total}
                    </span>
                  )}
                </button>
                {!isCollapsed ? (
                  <ul className="divide-y-0 bg-bg">
                    {section.rows.map((row) => (
                      <CountRow
                        key={row.key}
                        row={row}
                        counted={counted[row.key]}
                        phase={rowPhase[row.key]}
                        error={rowError[row.key]}
                        canReview={canReview}
                        onSubmit={(r, q) => void submitRow(r, q)}
                        onRecount={recountRow}
                        registerInput={registerInput}
                      />
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}

          <p className="px-1 text-2xs leading-relaxed text-fg-subtle">
            Every saved row replaces the stock balance anchor for that item (or
            holds for planner approval on large variance) — identical to{" "}
            <Link href="/stock/physical-count" className="underline hover:no-underline">
              the single-item count form
            </Link>
            . Current balances update on{" "}
            <Link href="/inventory" className="underline hover:no-underline">
              Inventory
            </Link>
            . &quot;Recount&quot; only clears the local tick so you can submit a
            corrected count; previous submissions stay on the audit trail.
            Tick marks reset automatically each day.
          </p>
        </div>
      )}
    </div>
  );
}
