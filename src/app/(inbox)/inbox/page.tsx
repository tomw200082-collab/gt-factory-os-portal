"use client";

// ---------------------------------------------------------------------------
// /inbox — unified triage surface (Tranche B §D of
// portal-full-production-refactor).
//
// 100-iteration UX/UI sweep (Tom 2026-05-06): comprehensive polish across
// visual hierarchy, density, bulk actions, filter bar, empty/loading states,
// action button copy, keyboard navigation, accessibility, performance,
// micro-interactions, and per-user preferences. See commit body for the full
// numbered list.
//
// Source streams (unchanged contract):
//   1. Pending Waste/Adjustment approvals   (features/inbox/client.ts)
//   2. Pending Physical Count approvals
//   3. Pending planning-run recommendation approvals
//   4. Non-approval exceptions
// ---------------------------------------------------------------------------

import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Filter,
  Flame,
  Info,
  Keyboard,
  Layers,
  Pin,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { NotesBox } from "@/components/fields/NotesBox";
import { useSession } from "@/lib/auth/session-provider";
import { cn } from "@/lib/cn";
import { ScrollFade } from "@/components/ui/ScrollFade";

import {
  fetchExceptions,
  fetchPendingPhysicalCountApprovals,
  fetchPendingInventoryMovementApprovals,
  fetchPendingPlanningRecApprovals,
  fetchPendingWasteApprovals,
  mergeInboxRows,
  applyInboxView,
} from "@/features/inbox/client";
import {
  CreditNeededFactCard,
  extractCreditNeededPayload,
} from "@/features/inbox/credit-card";
import { ApprovalInlineCard } from "@/features/inbox/approval-inline-card";
import { RecommendationInlineCard } from "@/features/inbox/recommendation-inline-card";
import {
  acknowledgeException,
  bulkResolveExceptions,
  newIdempotencyKey,
  resolveException,
} from "@/features/inbox/actions";
import {
  INBOX_SORTS,
  INBOX_VIEWS,
  type InboxFilter,
  type InboxRow,
  type InboxSeverity,
  type InboxSort,
  type InboxView,
} from "@/features/inbox/types";
import {
  categoryFriendly,
  PINNED_CATEGORIES,
  rowFamily,
  rowLane,
  searchBag,
  SEV_DOT,
  severityIconStroke,
} from "@/features/inbox/meta";
import {
  clearPrefs,
  densityChipGapClass,
  densityRowPaddingClass,
  DENSITY_LABELS,
  readPrefs,
  writePrefs,
  type InboxDensity,
} from "@/features/inbox/preferences";

// ---------------------------------------------------------------------------
// Category-aware button labels. Behavior is unchanged — only the labels
// change. The ResolvePanel placeholder/cta is also category-aware.
//
// Per memory feedback_action_buttons_match_guidance.md: button labels MUST
// match the "מה לעשות" guidance for each category, never the generic
// "Fix this / Acknowledge / Resolve" trio.
// ---------------------------------------------------------------------------
type CategoryButtonLabels = {
  deepLink?: string;
  acknowledge?: string;
  resolve?: string;
  /** Optional category-specific "confirm resolve" button label inside the panel. */
  resolveConfirm?: string;
  /** Optional placeholder for the resolution-notes textarea. */
  notesPlaceholder?: string;
};

const CATEGORY_BUTTON_LABELS: Record<string, CategoryButtonLabels> = {
  // Decision categories — body says "אשר X / דחה / ראיתי"
  lionwheel_credit_needed: {
    deepLink: "אשר זיכוי",
    acknowledge: "ראיתי",
    resolve: "דחה",
    resolveConfirm: "אשר דחיה",
    notesPlaceholder: "סיבה לדחיית הזיכוי (אופציונלי)…",
  },
  count_large_variance: {
    deepLink: "אשר ספירה",
    acknowledge: "ראיתי",
    resolve: "דחה",
    resolveConfirm: "אשר דחיה",
    notesPlaceholder: "סיבה לדחיית הספירה (אופציונלי)…",
  },
  positive_adjustment: {
    deepLink: "אשר התאמה",
    acknowledge: "ראיתי",
    resolve: "דחה",
    resolveConfirm: "אשר דחיה",
    notesPlaceholder: "סיבה לדחיית ההתאמה (אופציונלי)…",
  },
  loss_above_threshold: {
    deepLink: "אשר פחת",
    acknowledge: "ראיתי",
    resolve: "דחה",
    resolveConfirm: "אשר דחיה",
    notesPlaceholder: "סיבה לדחיית הפחת (אופציונלי)…",
  },
  po_line_over_receipt: {
    deepLink: "אשר עודף",
    acknowledge: "ראיתי",
    resolve: "דחה",
    resolveConfirm: "אשר דחיה",
    notesPlaceholder: "סיבה לדחיית העודף (אופציונלי)…",
  },
  // Decision category for inventory-movement approvals. Approvals are
  // actioned on the dedicated review page (not inline); only `deepLink` is
  // consumed here for the "Fix this" link label.
  inventory_movement_pending: {
    deepLink: "Review movement",
  },
  shopify_variant_not_found: {
    deepLink: "פתור פער",
    acknowledge: "ראיתי",
    resolve: "סגור",
    notesPlaceholder: "הערה לסגירה (אופציונלי)…",
  },

  // To-Do categories
  shopify_unmapped_item: {
    deepLink: "מפה לחנות",
    acknowledge: "ראיתי",
    resolve: "סגור",
  },
  lionwheel_unknown_sku: {
    deepLink: "מפה SKU",
    acknowledge: "ראיתי",
    resolve: "סגור",
  },
  gi_unmapped_supplier: {
    deepLink: "מפה ספק",
    acknowledge: "ראיתי",
    resolve: "סגור",
  },
  gi_expense_review: {
    deepLink: "בדוק חשבונית",
    acknowledge: "ראיתי",
    resolve: "סגור",
  },

  // Warning categories
  gi_stale: { deepLink: "בדוק חיבור", acknowledge: "ראיתי" },
  lionwheel_stale: { deepLink: "בדוק חיבור", acknowledge: "ראיתי" },
  shopify_stale: { deepLink: "בדוק חיבור", acknowledge: "ראיתי" },
  forecast_stale: { deepLink: "עדכן תחזית", acknowledge: "ראיתי" },
  rebuild_stale: { deepLink: "בדוק jobs", acknowledge: "ראיתי" },
  export_stale: { deepLink: "בדוק jobs", acknowledge: "ראיתי" },
  supplier_price_anomaly: { deepLink: "בדוק מחירים", acknowledge: "ראיתי" },
  gi_price_activation_failed: { deepLink: "בדוק jobs", acknowledge: "ראיתי" },
  gi_api_failure: { deepLink: "בדוק חיבור", acknowledge: "ראיתי" },
  gi_auth_failure: { deepLink: "חדש אימות", acknowledge: "ראיתי" },
  gi_rate_limit_stuck: { deepLink: "בדוק jobs", acknowledge: "ראיתי" },
  gi_mirror_insert_failed: { deepLink: "בדוק jobs", acknowledge: "ראיתי" },
  lionwheel_auth_expired: { deepLink: "חדש אימות", acknowledge: "ראיתי" },
  lionwheel_auth_failure: { deepLink: "חדש אימות", acknowledge: "ראיתי" },
  lionwheel_rate_limit_stuck: { deepLink: "בדוק jobs", acknowledge: "ראיתי" },
  lionwheel_schema_drift: { deepLink: "בדוק", acknowledge: "ראיתי" },
  lw_pick_enrich_failed: { deepLink: "בדוק", acknowledge: "ראיתי" },
  shopify_auth_failure: { deepLink: "חדש אימות", acknowledge: "ראיתי" },
  shopify_rate_limit_stuck: { deepLink: "בדוק jobs", acknowledge: "ראיתי" },
  shopify_api_version_drift: { deepLink: "בדוק", acknowledge: "ראיתי" },
  shopify_drift: { deepLink: "בדוק", acknowledge: "ראיתי" },
  shopify_network_failure: { acknowledge: "ראיתי", resolve: "סגור" },
  alias_revoked_with_dependencies: {
    deepLink: "בדוק aliases",
    acknowledge: "ראיתי",
  },

  // Info categories
  lionwheel_capped_window_gap: { acknowledge: "ראיתי", resolve: "סגור" },
  gi_non_ils_currency: { acknowledge: "ראיתי", resolve: "סגור" },
  lw_pick_data_missing: { acknowledge: "ראיתי", resolve: "סגור" },
  lionwheel_payload_invalid_sku: { acknowledge: "ראיתי", resolve: "סגור" },
  lionwheel_payload_invalid_picked_quantity: {
    acknowledge: "ראיתי",
    resolve: "סגור",
  },
  lionwheel_order_note: { acknowledge: "ראיתי", resolve: "סגור" },
  bom_version_published: { acknowledge: "ראיתי", resolve: "סגור" },
};

function buttonLabelsFor(category: string | null | undefined): CategoryButtonLabels {
  if (!category) return {};
  return CATEGORY_BUTTON_LABELS[category] ?? {};
}

// ---------------------------------------------------------------------------
// Query keys.
// ---------------------------------------------------------------------------
const QK_WASTE = ["inbox", "source", "approvals", "waste"] as const;
const QK_PC = ["inbox", "source", "approvals", "physical_count"] as const;
const QK_IM = ["inbox", "source", "approvals", "inventory_movement"] as const;
const QK_REC = ["inbox", "source", "approvals", "recommendations"] as const;
const QK_EXC = ["inbox", "source", "exceptions"] as const;
const QK_ALL = ["inbox", "all_rows"] as const;

// ---------------------------------------------------------------------------
// URL filter ↔ InboxFilter translation.
// ---------------------------------------------------------------------------
function readFilterFromSearchParams(
  sp: URLSearchParams | null,
): InboxFilter {
  const view = sp?.get("view") ?? "all";
  const sort = sp?.get("sort") ?? "severity_then_age";
  const safeView: InboxView = (INBOX_VIEWS as readonly string[]).includes(view)
    ? (view as InboxView)
    : "all";
  const safeSort: InboxSort = (INBOX_SORTS as readonly string[]).includes(sort)
    ? (sort as InboxSort)
    : "severity_then_age";
  return { view: safeView, sort: safeSort };
}

// ---------------------------------------------------------------------------
// Severity visual config (UI-only projection of the backend enum).
//
// Calm-direction pass (Tom 2026-05-16): severity reads from the thin left
// edge bar and the dot/icon only. No full-row colour washes — the working
// inbox stays quiet so the summary line is the single focal point per row.
// ---------------------------------------------------------------------------
const SEVERITY_CONFIG: Record<
  InboxSeverity,
  {
    tone: "danger" | "warning" | "info";
    icon: typeof AlertCircle;
    label: string;
    accentBar: string;
  }
> = {
  critical: {
    tone: "danger",
    icon: AlertCircle,
    label: "Critical",
    accentBar: "bg-danger",
  },
  warning: {
    tone: "warning",
    icon: AlertTriangle,
    label: "Warning",
    accentBar: "bg-warning",
  },
  info: {
    tone: "info",
    icon: Info,
    label: "Info",
    accentBar: "bg-info",
  },
};

const TYPE_LABELS: Record<string, string> = {
  "approval:waste": "Waste approval",
  "approval:physical_count": "Count approval",
  "approval:inventory_movement": "Movement approval",
  "approval:purchase_recommendation": "Purchase rec",
  "approval:production_recommendation": "Production rec",
};

function typeLabel(type: InboxRow["type"]): string {
  if (TYPE_LABELS[type]) return TYPE_LABELS[type];
  if (type.startsWith("exception:")) return "Exception";
  return type;
}

const VIEW_LABELS: Record<InboxView, string> = {
  all: "All",
  approvals: "Approvals",
  exceptions: "Exceptions",
  stock: "Stock",
  planning: "Planning",
  integrations: "Integrations",
  data_quality: "Data Quality",
  mine: "Mine",
};

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ageHumanized(iso: string, now: Date): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const deltaMs = now.getTime() - ts;
  const mins = Math.max(0, Math.round(deltaMs / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function isRowStuck(row: InboxRow, now: Date): boolean {
  const ts = new Date(row.created_at).getTime();
  if (!Number.isFinite(ts)) return false;
  return row.severity === "critical" && now.getTime() - ts > 72 * 3600_000;
}

function isRowFresh(row: InboxRow, now: Date): boolean {
  const ts = new Date(row.created_at).getTime();
  if (!Number.isFinite(ts)) return false;
  return now.getTime() - ts < 60_000;
}

// ---------------------------------------------------------------------------
// ResolvePanel — inline form for resolving an exception. Notes optional;
// auto-focus textarea; ESC cancels.
// ---------------------------------------------------------------------------
function ResolvePanel({
  onConfirm,
  onCancel,
  busy,
  category,
  isDestructive,
}: {
  onConfirm: (notes: string) => void;
  onCancel: () => void;
  busy: boolean;
  category: string;
  isDestructive: boolean;
}) {
  const [notes, setNotes] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const labels = buttonLabelsFor(category);

  useEffect(() => {
    // Tom 2026-05-06 §57: auto-focus the textarea when the panel opens.
    taRef.current?.focus();
  }, []);

  useEffect(() => {
    // Tom 2026-05-06 §58: ESC cancels the panel without submitting.
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, onCancel]);

  const canSubmit = notes.length <= 2000 && !busy;
  const confirmLabel = labels.resolveConfirm
    ?? (isDestructive ? "Confirm reject" : "Confirm resolve");
  const placeholder =
    labels.notesPlaceholder
    ?? (isDestructive
      ? "Reason for rejecting (optional)…"
      : "Optional — leave blank to resolve without a note.");

  return (
    <div
      className={cn(
        "mt-3 rounded-md border p-3",
        isDestructive
          ? "border-danger/40 bg-danger-softer/60"
          : "border-warning/40 bg-warning-softer",
      )}
      role="region"
      aria-label="Resolution form"
    >
      <div
        className={cn(
          "text-3xs font-semibold uppercase tracking-sops",
          isDestructive ? "text-danger" : "text-warning-fg",
        )}
      >
        {isDestructive ? "Rejection notes (optional)" : "Resolution notes (optional)"}
      </div>
      <NotesBox
        ref={taRef}
        data-testid="inbox-resolve-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={placeholder}
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className={cn(
            "btn btn-sm",
            isDestructive ? "btn-danger" : "btn-primary",
          )}
          data-testid="inbox-resolve-confirm"
          disabled={!canSubmit}
          onClick={() => onConfirm(notes)}
        >
          {busy ? "Submitting…" : confirmLabel}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          data-testid="inbox-resolve-cancel"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <span className="ml-auto text-3xs text-fg-subtle">
          ESC to cancel · ⌘⏎ to confirm
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk action bar — sticky when scrolled past the page header. Shows category
// breakdown when multiple selected.
// ---------------------------------------------------------------------------
function BulkActionBar({
  selectedCount,
  visibleSelectableCount,
  selectionBreakdown,
  allVisibleSelected,
  onSelectAllVisible,
  onClearSelection,
  onBulkResolve,
  busy,
}: {
  selectedCount: number;
  visibleSelectableCount: number;
  selectionBreakdown: string;
  allVisibleSelected: boolean;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onBulkResolve: () => void;
  busy: boolean;
}) {
  if (selectedCount === 0 && visibleSelectableCount === 0) return null;
  return (
    <div
      className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-accent/40 bg-accent-soft/95 px-5 py-2 text-xs backdrop-blur"
      role="toolbar"
      aria-label="Bulk actions"
      data-testid="inbox-bulk-bar"
    >
      {/* Tranche 051 (FLOW-019): max-md:min-h-[32px] lifts the touch target to
          ≥32px on phones; md+ rendering unchanged. */}
      <label
        className="inline-flex items-center gap-2 font-semibold text-accent max-md:min-h-[32px]"
        data-testid="inbox-bulk-select-all"
      >
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer accent-accent"
          checked={allVisibleSelected && visibleSelectableCount > 0}
          onChange={onSelectAllVisible}
          aria-label="Select all visible resolvable rows"
          disabled={visibleSelectableCount === 0 || busy}
        />
        {allVisibleSelected
          ? `All ${visibleSelectableCount} visible selected`
          : `Select all ${visibleSelectableCount} visible`}
      </label>
      {selectedCount > 0 ? (
        <span
          className="font-mono text-3xs uppercase tracking-sops text-accent/80"
          title={selectionBreakdown}
        >
          {selectedCount} selected
          {selectionBreakdown ? ` · ${selectionBreakdown}` : ""}
        </span>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {selectedCount > 0 ? (
          <button
            type="button"
            className="btn btn-sm max-md:min-h-[32px]"
            data-testid="inbox-bulk-clear"
            onClick={onClearSelection}
            disabled={busy}
          >
            Clear
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-sm btn-primary gap-1.5 max-md:min-h-[32px]"
          data-testid="inbox-bulk-resolve"
          onClick={onBulkResolve}
          disabled={selectedCount === 0 || busy}
          title="⌘⏎ to resolve all selected"
        >
          <CheckCircle2 className="h-3 w-3" strokeWidth={2.25} />
          {busy ? "Resolving…" : `Resolve ${selectedCount}`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page.
// ---------------------------------------------------------------------------
export default function InboxListPage() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  // -------------------------------------------------------------------------
  // Per-user prefs (localStorage). URL still wins on first mount; pref is
  // fallback. Subsequent changes are written back to BOTH.
  // -------------------------------------------------------------------------
  const [prefs, setPrefsState] = useState(() => readPrefs());
  const setPrefs = useCallback((patch: Parameters<typeof writePrefs>[0]) => {
    writePrefs(patch);
    setPrefsState((p) => ({ ...p, ...patch }));
  }, []);

  const filter = useMemo<InboxFilter>(() => {
    const sp = searchParams;
    const urlView = sp?.get("view");
    const urlSort = sp?.get("sort");
    if (urlView || urlSort) return readFilterFromSearchParams(sp);
    // Tom 2026-05-06 §41-42: fall back to prefs when URL is empty.
    return {
      view: prefs.view ?? "all",
      sort: prefs.sort ?? "severity_then_age",
    };
  }, [searchParams, prefs.view, prefs.sort]);

  const canAct = session.role === "planner" || session.role === "admin";
  const density: InboxDensity = prefs.density;

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Tom 2026-05-06 §94: recently-dismissed pill for one-tap undo.
  type RecentAction = {
    id: string;
    summary: string;
    kind: "ack" | "resolve";
    at: number;
  };
  const [recentActions, setRecentActions] = useState<RecentAction[]>([]);
  const RECENT_TTL_MS = 10_000;

  // Selection.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelected = useCallback((id: string, isOn: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isOn) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // Search box.
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    // Debounce 150ms — keeps typing snappy.
    const t = window.setTimeout(() => setSearchTerm(searchInput.trim().toLowerCase()), 150);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Stable "now" — refreshed every 60s for live age strings (§77).
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Keyboard-focused row index (for j/k nav).
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);

  // -------------------------------------------------------------------------
  // Source fetchers (parallel).
  // -------------------------------------------------------------------------
  const sources = useQueries({
    queries: [
      {
        queryKey: QK_WASTE,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchPendingWasteApprovals(signal),
        staleTime: 30_000,
      },
      {
        queryKey: QK_PC,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchPendingPhysicalCountApprovals(signal),
        staleTime: 30_000,
      },
      {
        queryKey: QK_IM,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchPendingInventoryMovementApprovals(signal),
        staleTime: 30_000,
      },
      {
        queryKey: QK_REC,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchPendingPlanningRecApprovals(signal),
        staleTime: 30_000,
      },
      {
        queryKey: QK_EXC,
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchExceptions(signal),
        staleTime: 30_000,
      },
    ],
  });

  const [wasteQ, pcQ, imQ, recQ, excQ] = sources;

  const anyLoading =
    wasteQ.isLoading || pcQ.isLoading || imQ.isLoading || recQ.isLoading || excQ.isLoading;
  const anyFetching =
    wasteQ.isFetching || pcQ.isFetching || imQ.isFetching || recQ.isFetching || excQ.isFetching;

  // ponytail: keep in sync with the 5 source queries below (waste/pc/im/rec/exc)
  const TOTAL_SOURCES = 5;
  const sourceErrors: Array<{ label: string; queryKey: readonly string[] }> = [];
  if (wasteQ.isError) sourceErrors.push({ label: "Waste / adjustment approvals", queryKey: QK_WASTE });
  if (pcQ.isError) sourceErrors.push({ label: "Physical count approvals", queryKey: QK_PC });
  if (imQ.isError) sourceErrors.push({ label: "Inventory movement approvals", queryKey: QK_IM });
  if (recQ.isError) sourceErrors.push({ label: "Planning recommendation approvals", queryKey: QK_REC });
  if (excQ.isError) sourceErrors.push({ label: "Exceptions", queryKey: QK_EXC });

  const lastRefreshedAt = useMemo<number>(() => {
    return Math.max(
      wasteQ.dataUpdatedAt ?? 0,
      pcQ.dataUpdatedAt ?? 0,
      imQ.dataUpdatedAt ?? 0,
      recQ.dataUpdatedAt ?? 0,
      excQ.dataUpdatedAt ?? 0,
    );
  }, [wasteQ.dataUpdatedAt, pcQ.dataUpdatedAt, imQ.dataUpdatedAt, recQ.dataUpdatedAt, excQ.dataUpdatedAt]);

  // -------------------------------------------------------------------------
  // Merge + filter.
  // -------------------------------------------------------------------------
  const allRows = useMemo(
    () =>
      mergeInboxRows(
        [
          wasteQ.data ?? [],
          pcQ.data ?? [],
          imQ.data ?? [],
          recQ.data ?? [],
          excQ.data ?? [],
        ],
        filter,
      ),
    [wasteQ.data, pcQ.data, imQ.data, recQ.data, excQ.data, filter],
  );

  useQuery<InboxRow[]>({
    queryKey: QK_ALL,
    queryFn: () => allRows,
    enabled: !anyLoading,
  });
  useEffect(() => {
    if (anyLoading) return;
    queryClient.setQueryData<InboxRow[]>(QK_ALL, allRows);
  }, [allRows, anyLoading, queryClient]);

  const viewedRows = useMemo(
    () => applyInboxView(allRows, filter.view, session.user_id || null),
    [allRows, filter.view, session.user_id],
  );

  // Search filter (after view).
  const visibleRows = useMemo(() => {
    if (!searchTerm) {
      // Tom 2026-05-06 §95: pinned categories float to top within their
      // severity bucket when sort is severity_then_age.
      if (filter.sort === "severity_then_age") {
        return [...viewedRows].sort((a, b) => {
          const ap = PINNED_CATEGORIES.has(a.category) ? 1 : 0;
          const bp = PINNED_CATEGORIES.has(b.category) ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return 0;
        });
      }
      return viewedRows;
    }
    return viewedRows.filter((r) => searchBag(r).includes(searchTerm));
  }, [viewedRows, searchTerm, filter.sort]);

  // -------------------------------------------------------------------------
  // Actionable / muted partition (Tom 2026-05-16).
  //
  // On the default "all" view the working inbox shows ONLY rows the operator
  // can act on — decisions, to-dos, and approvals. Integration / sync / auth
  // warnings and informational diagnostic records are folded into a collapsed
  // "System & diagnostics" section so the inbox is free of noise the operator
  // cannot resolve. Explicit views (Integrations, Exceptions, Data Quality …)
  // and active searches bypass the split — drilling into a category or
  // searching is an explicit request to see everything.
  // -------------------------------------------------------------------------
  const splitActive = filter.view === "all" && searchTerm === "";

  const { mainRows, mutedRows } = useMemo(() => {
    if (!splitActive) {
      return { mainRows: visibleRows, mutedRows: [] as InboxRow[] };
    }
    const main: InboxRow[] = [];
    const muted: InboxRow[] = [];
    for (const r of visibleRows) {
      if (rowLane(r) === "actionable") main.push(r);
      else muted.push(r);
    }
    return { mainRows: main, mutedRows: muted };
  }, [visibleRows, splitActive]);

  // Critical count for the page header.
  const criticalCount = useMemo(
    () => allRows.filter((r) => r.severity === "critical").length,
    [allRows],
  );

  // -------------------------------------------------------------------------
  // Tranche 059 (DASH-T6): honor a deep-linked ?id=<exception_id>.
  // /exceptions?id= has forwarded the param here since Tranche 041, but the
  // inbox dropped it — the dashboard's Critical-Today CTA landed the operator
  // on a generic list. When the rows arrive, focus + scroll the matching row
  // once per id (re-runs harmlessly until the row is present).
  // -------------------------------------------------------------------------
  const deepLinkId = searchParams?.get("id") ?? null;
  const consumedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkId || consumedDeepLinkRef.current === deepLinkId) return;
    const idx = mainRows.findIndex((r) => r.id === deepLinkId);
    if (idx < 0) return; // rows still loading, or id lives in the muted lane
    consumedDeepLinkRef.current = deepLinkId;
    setFocusedIdx(idx);
    requestAnimationFrame(() => {
      const reduce =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document
        .querySelector(`[data-row-id="${CSS.escape(deepLinkId)}"]`)
        ?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    });
  }, [deepLinkId, mainRows]);

  const visibleSelectableIds = useMemo(() => {
    const out: string[] = [];
    for (const r of mainRows) {
      if (r.type.startsWith("approval:")) continue;
      if (!r.inline_actions.includes("resolve")) continue;
      out.push(r.id);
    }
    return out;
  }, [mainRows]);

  const allVisibleSelected = useMemo(() => {
    if (visibleSelectableIds.length === 0) return false;
    for (const id of visibleSelectableIds) {
      if (!selected.has(id)) return false;
    }
    return true;
  }, [visibleSelectableIds, selected]);

  // Selection breakdown — used in the bulk bar tooltip + confirm dialog.
  const selectionBreakdown = useMemo(() => {
    if (selected.size === 0) return "";
    const counts = new Map<string, number>();
    for (const r of allRows) {
      if (selected.has(r.id)) {
        counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
      }
    }
    const parts = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat, n]) => `${n}× ${categoryFriendly(cat)}`);
    if (counts.size > 3) parts.push(`+${counts.size - 3} more`);
    return parts.join(" · ");
  }, [selected, allRows]);

  const onSelectAllVisible = useCallback(() => {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of visibleSelectableIds) next.delete(id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of visibleSelectableIds) next.add(id);
        return next;
      });
    }
  }, [allVisibleSelected, visibleSelectableIds]);

  // Per-view counts (skip filtered view; show counts for ALL rows).
  const viewCounts = useMemo(() => {
    const userId = session.user_id || null;
    const counts: Record<InboxView, number> = {
      all: 0,
      approvals: 0,
      exceptions: 0,
      stock: 0,
      planning: 0,
      integrations: 0,
      data_quality: 0,
      mine: 0,
    };
    for (const v of INBOX_VIEWS) {
      counts[v] = applyInboxView(allRows, v, userId).length;
    }
    return counts;
  }, [allRows, session.user_id]);

  // -------------------------------------------------------------------------
  // URL-backed filter writers (debounced — Tom 2026-05-06 §73).
  // -------------------------------------------------------------------------
  const urlWriteTimerRef = useRef<number | null>(null);
  const updateUrl = useCallback(
    (next: InboxFilter) => {
      if (urlWriteTimerRef.current !== null) {
        window.clearTimeout(urlWriteTimerRef.current);
      }
      urlWriteTimerRef.current = window.setTimeout(() => {
        const sp = new URLSearchParams(searchParams?.toString() ?? "");
        sp.set("view", next.view);
        sp.set("sort", next.sort);
        router.replace(`/inbox?${sp.toString()}`);
      }, 150);
    },
    [router, searchParams],
  );

  const setView = useCallback(
    (view: InboxView) => {
      setSelected(new Set());
      setSearchInput(""); // §44
      setPrefs({ view });
      updateUrl({ ...filter, view });
    },
    [filter, updateUrl, setPrefs],
  );

  const setSort = useCallback(
    (sort: InboxSort) => {
      setPrefs({ sort });
      updateUrl({ ...filter, sort });
    },
    [filter, updateUrl, setPrefs],
  );

  const setDensity = useCallback(
    (d: InboxDensity) => {
      setPrefs({ density: d });
    },
    [setPrefs],
  );

  const systemSectionOpen = prefs.systemSectionOpen === true;
  const toggleSystemSection = useCallback(() => {
    setPrefs({ systemSectionOpen: !(prefs.systemSectionOpen === true) });
  }, [prefs.systemSectionOpen, setPrefs]);

  // -------------------------------------------------------------------------
  // Mutations.
  // -------------------------------------------------------------------------
  const invalidateExceptions = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: QK_EXC });
    void queryClient.invalidateQueries({ queryKey: QK_WASTE });
    void queryClient.invalidateQueries({ queryKey: QK_PC });
    void queryClient.invalidateQueries({ queryKey: QK_IM });
  }, [queryClient]);

  const refetchAll = useCallback(() => {
    setActionSuccess(null);
    setActionError(null);
    void wasteQ.refetch();
    void pcQ.refetch();
    void imQ.refetch();
    void recQ.refetch();
    void excQ.refetch();
  }, [wasteQ, pcQ, imQ, recQ, excQ]);

  const recordRecentAction = useCallback(
    (row: InboxRow, kind: "ack" | "resolve") => {
      setRecentActions((prev) => [
        { id: row.id, summary: row.summary, kind, at: Date.now() },
        ...prev,
      ].slice(0, 5));
    },
    [],
  );

  // Auto-expire recent actions.
  useEffect(() => {
    if (recentActions.length === 0) return;
    const expireAt = recentActions[0]!.at + RECENT_TTL_MS;
    const ms = Math.max(250, expireAt - Date.now());
    const t = window.setTimeout(() => {
      setRecentActions((prev) => prev.filter((r) => Date.now() - r.at < RECENT_TTL_MS));
    }, ms);
    return () => window.clearTimeout(t);
  }, [recentActions]);

  const ackMutation = useMutation({
    mutationFn: (id: string) => acknowledgeException(id, newIdempotencyKey()),
    onSuccess: (res, id) => {
      if (res.ok) {
        setActionSuccess("Acknowledged.");
        setActionError(null);
        const row = allRows.find((r) => r.id === id);
        if (row) recordRecentAction(row, "ack");
        invalidateExceptions();
      } else {
        setActionError(res.detail ? `Acknowledge failed — ${res.detail}` : "Acknowledge failed. Try again.");
        setActionSuccess(null);
      }
      return id;
    },
    onError: (err: unknown) => {
      console.error("[Inbox] acknowledge error:", err);
      setActionError("Acknowledge failed. Check your connection and try again.");
      setActionSuccess(null);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      resolveException(id, notes, newIdempotencyKey()),
    onSuccess: (res, vars) => {
      if (res.ok) {
        setActionSuccess("Resolved.");
        setActionError(null);
        setResolvingId(null);
        const row = allRows.find((r) => r.id === vars.id);
        if (row) recordRecentAction(row, "resolve");
        invalidateExceptions();
      } else {
        setActionError(res.detail ? `Resolve failed — ${res.detail}` : "Resolve failed. Try again.");
        setActionSuccess(null);
      }
    },
    onError: (err: unknown) => {
      console.error("[Inbox] resolve error:", err);
      setActionError("Resolve failed. Check your connection and try again.");
      setActionSuccess(null);
    },
  });

  const bulkResolveMutation = useMutation({
    mutationFn: ({ ids }: { ids: string[] }) =>
      bulkResolveExceptions(ids, undefined, newIdempotencyKey()),
    onSuccess: (res) => {
      if (res.ok) {
        const { resolved, idempotent_replay, conflict, not_found, total } = res.data;
        const parts: string[] = [];
        if (resolved > 0) parts.push(`${resolved} resolved`);
        if (idempotent_replay > 0) parts.push(`${idempotent_replay} already resolved`);
        if (conflict > 0) parts.push(`${conflict} conflict`);
        if (not_found > 0) parts.push(`${not_found} not found`);
        const summary = parts.length > 0 ? parts.join(" · ") : `${total} processed`;
        setActionSuccess(`Bulk resolve: ${summary}.`);
        setActionError(null);
        clearSelection();
        invalidateExceptions();
      } else {
        setActionError(res.detail ? `Bulk resolve failed — ${res.detail}` : "Bulk resolve failed. Try again.");
        setActionSuccess(null);
      }
    },
    onError: (err: unknown) => {
      console.error("[Inbox] bulk resolve error:", err);
      setActionError("Bulk resolve failed. Check your connection and try again.");
      setActionSuccess(null);
    },
  });

  const onBulkResolve = useCallback(() => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const breakdown = selectionBreakdown ? `\n\n${selectionBreakdown}` : "";
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Resolve ${ids.length} exception${ids.length === 1 ? "" : "s"}?${breakdown}\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }
    setActionSuccess(null);
    setActionError(null);
    bulkResolveMutation.mutate({ ids });
  }, [selected, selectionBreakdown, bulkResolveMutation]);

  // Shared row renderer — used by both the working inbox list and the
  // collapsed System & diagnostics section. `focusIdx` is the j/k keyboard
  // index for main-list rows; muted rows pass null (not keyboard-traversed).
  const renderInboxRow = useCallback(
    (row: InboxRow, focusIdx: number | null): ReactNode => (
      <InboxRowCard
        key={row.id}
        row={row}
        now={now}
        density={density}
        isFocused={focusIdx !== null && focusedIdx === focusIdx}
        onFocusRow={() => {
          if (focusIdx !== null) setFocusedIdx(focusIdx);
        }}
        canAct={canAct}
        isResolvingThis={resolvingId === row.id}
        isSelected={selected.has(row.id)}
        onToggleSelected={toggleSelected}
        onStartResolve={(id) => {
          setActionSuccess(null);
          setActionError(null);
          setResolvingId(id);
        }}
        onCancelResolve={() => setResolvingId(null)}
        onConfirmResolve={(id, notes) => resolveMutation.mutate({ id, notes })}
        onAcknowledge={(id) => {
          setActionSuccess(null);
          setActionError(null);
          ackMutation.mutate(id);
        }}
        ackBusy={ackMutation.isPending && ackMutation.variables === row.id}
        resolveBusy={
          resolveMutation.isPending && resolveMutation.variables?.id === row.id
        }
      />
    ),
    [
      now,
      density,
      focusedIdx,
      canAct,
      resolvingId,
      selected,
      toggleSelected,
      resolveMutation,
      ackMutation,
    ],
  );

  // -------------------------------------------------------------------------
  // Keyboard navigation (§66-72). Skipped while a textarea/input is focused.
  // -------------------------------------------------------------------------
  useEffect(() => {
    function isEditing(): boolean {
      const ae = document.activeElement;
      if (!ae) return false;
      const tag = ae.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || (ae as HTMLElement).isContentEditable;
    }
    function handler(e: KeyboardEvent) {
      // ⌘A select all visible (only when not editing).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !isEditing()) {
        if (visibleSelectableIds.length === 0) return;
        e.preventDefault();
        onSelectAllVisible();
        return;
      }
      // ⌘⏎ bulk resolve.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isEditing()) {
        if (selected.size === 0) return;
        e.preventDefault();
        onBulkResolve();
        return;
      }
      if (isEditing()) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min((mainRows.length || 1) - 1, i + 1));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(0, i - 1));
        return;
      }
      const focused = focusedIdx >= 0 ? mainRows[focusedIdx] : null;
      if (!focused) return;
      if (e.key === "x") {
        if (focused.type.startsWith("approval:")) return;
        if (!focused.inline_actions.includes("resolve")) return;
        e.preventDefault();
        toggleSelected(focused.id, !selected.has(focused.id));
        return;
      }
      if (e.key === "Enter") {
        if (focused.deep_link && focused.deep_link !== "/inbox") {
          e.preventDefault();
          router.push(focused.deep_link);
        }
        return;
      }
      if (e.key === "r") {
        if (canAct && !focused.type.startsWith("approval:") && focused.inline_actions.includes("resolve")) {
          e.preventDefault();
          setResolvingId(focused.id);
        }
        return;
      }
      if (e.key === "a") {
        if (canAct && !focused.type.startsWith("approval:") && focused.inline_actions.includes("acknowledge")) {
          e.preventDefault();
          ackMutation.mutate(focused.id);
        }
        return;
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    mainRows,
    visibleSelectableIds,
    focusedIdx,
    selected,
    canAct,
    onSelectAllVisible,
    onBulkResolve,
    toggleSelected,
    ackMutation,
    router,
  ]);

  // Reset focused index when the main-list row count shrinks below it.
  useEffect(() => {
    if (focusedIdx >= mainRows.length) {
      setFocusedIdx(Math.max(0, mainRows.length - 1));
    }
  }, [mainRows.length, focusedIdx]);

  // Slow-load nudge (§50).
  const [showSlowNudge, setShowSlowNudge] = useState(false);
  useEffect(() => {
    if (!anyLoading) {
      setShowSlowNudge(false);
      return;
    }
    const t = window.setTimeout(() => setShowSlowNudge(true), 5000);
    return () => window.clearTimeout(t);
  }, [anyLoading]);

  // -------------------------------------------------------------------------
  // View-tab visibility — hide zero-count views by default unless prefs.
  // -------------------------------------------------------------------------
  const visibleViewTabs = useMemo<readonly InboxView[]>(() => {
    if (prefs.showZeroCounts) return INBOX_VIEWS;
    // Always show All + Approvals + Exceptions + Mine, plus any view with count>0.
    const baseline = new Set<InboxView>(["all", "approvals", "exceptions", "mine"]);
    return INBOX_VIEWS.filter((v) => baseline.has(v) || viewCounts[v] > 0);
  }, [prefs.showZeroCounts, viewCounts]);

  // -------------------------------------------------------------------------
  // Render.
  // -------------------------------------------------------------------------
  const lastRefreshedHuman = lastRefreshedAt > 0 ? ageHumanized(new Date(lastRefreshedAt).toISOString(), now) : null;

  return (
    <>
      <WorkflowHeader
        eyebrow="Inbox"
        title="Inbox"
        description="Everything waiting on you — approvals and exceptions, in one place. System noise stays tucked away."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            {criticalCount > 0 ? (
              <Badge tone="danger" variant="solid">
                {criticalCount} critical
              </Badge>
            ) : null}
            <Badge tone="neutral" dotted>
              {splitActive
                ? `${mainRows.length} to action`
                : `${visibleRows.length} of ${allRows.length} row${allRows.length === 1 ? "" : "s"}`}
            </Badge>
            {lastRefreshedHuman ? (
              <span
                className="text-3xs font-medium text-fg-subtle"
                title={lastRefreshedAt ? new Date(lastRefreshedAt).toLocaleString() : undefined}
              >
                Refreshed {lastRefreshedHuman}
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-xs gap-1.5"
              onClick={refetchAll}
              disabled={anyFetching}
              aria-label="Refresh inbox"
              title="Refresh"
            >
              <RefreshCw
                className={cn("h-3 w-3", anyFetching && "animate-spin")}
                strokeWidth={2.25}
              />
              Refresh
            </button>
          </div>
        }
      />

      <SectionCard contentClassName="p-0" className="reveal">
        {/* ---- Filter bar ----------------------------------------------- */}
        <div
          className="flex flex-wrap items-center gap-3 border-b border-border/60 px-5 py-3"
          data-testid="inbox-filter-bar"
        >
          {/* Tranche 051 (FLOW-019): below sm the view-chip row scrolls
              horizontally with a right-edge fade affordance instead of
              wrapping; sm+ unchanged. */}
          <ScrollFade
            className="min-w-0 max-w-full"
            contentClassName="flex flex-wrap items-center gap-1.5 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:pb-0.5"
          >
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle max-sm:shrink-0">
              View
            </span>
            {visibleViewTabs.map((v) => {
              const active = filter.view === v;
              const count = viewCounts[v];
              return (
                <button
                  key={v}
                  type="button"
                  data-testid={`inbox-filter-view-${v}`}
                  aria-pressed={active}
                  aria-current={active ? "true" : undefined}
                  onClick={() => setView(v)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-3xs font-semibold uppercase tracking-sops transition-all duration-150",
                    "max-sm:min-h-[32px] max-sm:shrink-0 max-sm:whitespace-nowrap",
                    active
                      ? "border-accent/60 bg-accent-soft text-accent ring-1 ring-accent/30"
                      : "border-border/70 bg-bg-raised text-fg-muted hover:border-border-strong hover:bg-bg-subtle hover:text-fg",
                  )}
                >
                  {VIEW_LABELS[v]}
                  {!anyLoading && count > 0 ? (
                    <span
                      className={cn(
                        "ml-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[0.6rem] font-bold tabular-nums",
                        active
                          ? "bg-accent text-accent-fg"
                          : "bg-bg-subtle text-fg-strong ring-1 ring-border/60",
                      )}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                </button>
              );
            })}
            {visibleViewTabs.length < INBOX_VIEWS.length ? (
              <button
                type="button"
                onClick={() => setPrefs({ showZeroCounts: !prefs.showZeroCounts })}
                className="inline-flex items-center gap-1 rounded-sm border border-dashed border-border/60 bg-transparent px-2 py-1 text-3xs font-medium text-fg-subtle hover:border-border-strong hover:text-fg max-sm:min-h-[32px] max-sm:shrink-0 max-sm:whitespace-nowrap"
                title={prefs.showZeroCounts ? "Hide empty views" : "Show empty views"}
              >
                <Filter className="h-3 w-3" strokeWidth={2} />
                {prefs.showZeroCounts ? "Hide empty" : "Show all"}
              </button>
            ) : null}
          </ScrollFade>

          <div className="flex flex-1 items-center gap-2 sm:flex-none sm:basis-[260px]">
            <label className="relative flex w-full items-center">
              <Search
                className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-fg-subtle"
                strokeWidth={2}
              />
              <input
                type="search"
                className="input h-8 w-full pl-7 pr-7 text-xs"
                placeholder="Search summary, item, category…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                data-testid="inbox-search"
                aria-label="Search inbox"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="absolute right-1.5 inline-flex h-5 w-5 items-center justify-center rounded text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" strokeWidth={2.25} />
                </button>
              ) : null}
            </label>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div
              className="inline-flex items-center rounded-sm border border-border/70 bg-bg-raised text-3xs font-semibold uppercase tracking-sops"
              role="radiogroup"
              aria-label="Sort"
            >
              <button
                type="button"
                role="radio"
                aria-checked={filter.sort === "severity_then_age"}
                data-testid="inbox-filter-sort-severity_then_age"
                onClick={() => setSort("severity_then_age")}
                title="Sort by severity, then age"
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 transition-colors",
                  filter.sort === "severity_then_age"
                    ? "bg-accent-soft text-accent"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                <Flame className="h-3 w-3" strokeWidth={2.25} />
                Severity
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={filter.sort === "age_only"}
                data-testid="inbox-filter-sort-age_only"
                onClick={() => setSort("age_only")}
                title="Sort by newest first"
                className={cn(
                  "inline-flex items-center gap-1 border-l border-border/70 px-2 py-1 transition-colors",
                  filter.sort === "age_only"
                    ? "bg-accent-soft text-accent"
                    : "text-fg-muted hover:text-fg",
                )}
              >
                <Clock className="h-3 w-3" strokeWidth={2.25} />
                Newest
              </button>
            </div>

            <div
              className="inline-flex items-center rounded-sm border border-border/70 bg-bg-raised text-3xs font-semibold uppercase tracking-sops"
              role="radiogroup"
              aria-label="Density"
              title="Row density"
            >
              {(["comfortable", "cozy", "compact"] as InboxDensity[]).map((d, i) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={density === d}
                  onClick={() => setDensity(d)}
                  className={cn(
                    "px-2 py-1 transition-colors",
                    i > 0 && "border-l border-border/70",
                    density === d
                      ? "bg-accent-soft text-accent"
                      : "text-fg-muted hover:text-fg",
                  )}
                >
                  {DENSITY_LABELS[d].slice(0, 3)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ---- Source-error banner ------------------------------------- */}
        {sourceErrors.length > 0 ? (
          <div
            className="border-b border-danger/40 bg-danger-softer px-5 py-2 text-xs text-danger-fg"
            data-testid="inbox-source-errors"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex-1">
                <div className="font-semibold">
                  Some sources failed to load ({sourceErrors.length}/{TOTAL_SOURCES}):
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {sourceErrors.map((e) => (
                    <li key={e.label}>{e.label}</li>
                  ))}
                </ul>
                <div className="mt-1 text-danger-fg/80">
                  Rows from failed sources are not shown.
                </div>
              </div>
              <button
                type="button"
                onClick={refetchAll}
                className="btn btn-xs"
              >
                <RefreshCw className="h-3 w-3" strokeWidth={2.25} />
                Retry
              </button>
            </div>
          </div>
        ) : null}

        {/* ---- Action toasts ------------------------------------------- */}
        {actionSuccess ? (
          <div
            className="flex items-center gap-2 border-b border-success/30 bg-success-subtle/40 px-5 py-2 text-xs text-success-fg"
            data-testid="inbox-action-success"
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>{actionSuccess}</span>
            <button
              type="button"
              onClick={() => setActionSuccess(null)}
              className="ml-auto text-success-fg/60 hover:text-success-fg"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" strokeWidth={2.25} />
            </button>
          </div>
        ) : null}
        {actionError ? (
          <div
            className="flex items-center gap-2 border-b border-danger/30 bg-danger-softer px-5 py-2 text-xs text-danger-fg"
            data-testid="inbox-action-error"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="ml-auto text-danger-fg/60 hover:text-danger-fg"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" strokeWidth={2.25} />
            </button>
          </div>
        ) : null}

        {/* ---- Recently dismissed pill (§94) --------------------------- */}
        {recentActions.length > 0 ? (
          <div
            className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-bg-subtle/50 px-5 py-1.5 text-3xs text-fg-muted"
            data-testid="inbox-recent-actions"
          >
            <Sparkles className="h-3 w-3" strokeWidth={2} />
            <span className="font-semibold uppercase tracking-sops">
              {recentActions.length} dismissed in the last few seconds
            </span>
            <span className="truncate">
              {recentActions[0]!.summary.slice(0, 60)}
              {recentActions[0]!.summary.length > 60 ? "…" : ""}
            </span>
          </div>
        ) : null}

        {/* ---- Bulk action bar (sticky) -------------------------------- */}
        <BulkActionBar
          selectedCount={selected.size}
          visibleSelectableCount={visibleSelectableIds.length}
          selectionBreakdown={selectionBreakdown}
          allVisibleSelected={allVisibleSelected}
          onSelectAllVisible={onSelectAllVisible}
          onClearSelection={clearSelection}
          onBulkResolve={onBulkResolve}
          busy={bulkResolveMutation.isPending}
        />

        {/* ---- List, skeleton, or empty -------------------------------- */}
        {anyLoading ? (
          <LoadingSkeleton density={density} showSlowNudge={showSlowNudge} />
        ) : (
          <>
            {mainRows.length === 0 ? (
              <InboxEmptyState
                view={filter.view}
                search={searchTerm}
                allRowsCount={allRows.length}
                viewedRowsCount={viewedRows.length}
                mutedCount={mutedRows.length}
                allSourcesFailed={sourceErrors.length === TOTAL_SOURCES}
                onClearSearch={() => setSearchInput("")}
                onSwitchToAll={() => setView("all")}
              />
            ) : (
              <ul
                className="fc-list-stagger divide-y divide-border/60"
                data-testid="inbox-list"
                role="list"
              >
                {mainRows.map((row, idx) => renderInboxRow(row, idx))}
              </ul>
            )}
            {mutedRows.length > 0 ? (
              <SystemDiagnosticsSection
                rows={mutedRows}
                open={systemSectionOpen}
                onToggle={toggleSystemSection}
                renderRow={renderInboxRow}
              />
            ) : null}
          </>
        )}

        {/* ---- Footer with reset prefs --------------------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-5 py-2 text-3xs text-fg-subtle">
          <div className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Keyboard className="h-3 w-3" strokeWidth={2} />
              <span className="font-mono">j/k</span> nav ·
              <span className="font-mono">x</span> select ·
              <span className="font-mono">r</span> resolve ·
              <span className="font-mono">a</span> ack ·
              <span className="font-mono">⌘⏎</span> bulk
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              clearPrefs();
              setPrefsState(readPrefs());
            }}
            className="font-medium text-fg-subtle hover:text-fg-muted"
            title="Clear saved view/sort/density"
          >
            Reset preferences
          </button>
        </div>
      </SectionCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// LoadingSkeleton — matches the new row layout (severity dot + chips +
// summary + button placeholder). 5 rows hint at density better than 3.
// ---------------------------------------------------------------------------
function LoadingSkeleton({
  density,
  showSlowNudge,
}: {
  density: InboxDensity;
  showSlowNudge: boolean;
}) {
  return (
    <div
      className="flex flex-col divide-y divide-border/60"
      data-testid="inbox-loading"
      aria-busy="true"
      aria-live="polite"
    >
      {showSlowNudge ? (
        <div className="border-b border-info/30 bg-info-softer px-5 py-2 text-xs text-info-fg">
          Still loading… check your connection.
        </div>
      ) : null}
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn(
            "flex items-start gap-4",
            densityRowPaddingClass(density),
          )}
          style={{ opacity: 1 - i * 0.07 }}
        >
          <div className="mt-1.5 h-4 w-4 shrink-0 animate-pulse rounded bg-bg-subtle" />
          <div className="mt-0.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-bg-subtle" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-3 w-16 animate-pulse rounded bg-bg-subtle" />
              <div className="h-3 w-24 animate-pulse rounded bg-bg-subtle" />
              <div className="ml-auto h-3 w-12 animate-pulse rounded bg-bg-subtle" />
            </div>
            <div className="h-4 w-2/3 animate-pulse rounded bg-bg-subtle" />
            <div className="flex gap-2">
              <div className="h-6 w-20 animate-pulse rounded bg-bg-subtle" />
              <div className="h-6 w-16 animate-pulse rounded bg-bg-subtle" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InboxEmptyState — tailored copy + actions per view / search state.
// ---------------------------------------------------------------------------
function InboxEmptyState({
  view,
  search,
  allRowsCount,
  viewedRowsCount,
  mutedCount,
  allSourcesFailed,
  onClearSearch,
  onSwitchToAll,
}: {
  view: InboxView;
  search: string;
  allRowsCount: number;
  viewedRowsCount: number;
  mutedCount: number;
  allSourcesFailed: boolean;
  onClearSearch: () => void;
  onSwitchToAll: () => void;
}) {
  let title: string;
  let description: ReactNode;
  let action: ReactNode = null;

  if (search && viewedRowsCount > 0) {
    title = "No matches for that search.";
    description = (
      <>
        <span className="font-mono text-fg">&ldquo;{search}&rdquo;</span> didn&apos;t
        match any row in this view. Try a different term or clear the search.
      </>
    );
    action = (
      <button type="button" onClick={onClearSearch} className="btn btn-sm">
        <X className="h-3 w-3" strokeWidth={2.25} />
        Clear search
      </button>
    );
  } else if (view === "mine") {
    title = "Nothing assigned to you.";
    description = (
      <>
        Items you&apos;re responsible for will appear here.{" "}
        {allRowsCount > 0 ? "View All to see the team queue." : "All clear."}
      </>
    );
    if (allRowsCount > 0) {
      action = (
        <button type="button" onClick={onSwitchToAll} className="btn btn-sm">
          <ArrowLeft className="h-3 w-3 rtl:rotate-180" strokeWidth={2.25} />
          View All ({allRowsCount})
        </button>
      );
    }
  } else if (view === "all") {
    if (mutedCount > 0) {
      title = "You're all caught up.";
      description = `No decisions or to-dos need you right now. ${mutedCount} background ${
        mutedCount === 1 ? "notice is" : "notices are"
      } tucked into System & diagnostics below — open it only if you want to look.`;
    } else if (allSourcesFailed) {
      title = "Couldn't load your inbox.";
      description =
        "Every source failed to load — pending approvals may be hidden. Use Retry above.";
    } else {
      title = "Nothing in your inbox.";
      description = "All approvals and exceptions are clear. Nice work.";
    }
  } else {
    title = `No ${VIEW_LABELS[view].toLowerCase()} items.`;
    description =
      allRowsCount > 0
        ? `View All to see items from other categories (${allRowsCount} total).`
        : "All clear across every view.";
    if (allRowsCount > 0) {
      action = (
        <button type="button" onClick={onSwitchToAll} className="btn btn-sm">
          <ArrowLeft className="h-3 w-3 rtl:rotate-180" strokeWidth={2.25} />
          View All
        </button>
      );
    }
  }

  return (
    <div
      className="reveal flex flex-col items-center justify-center gap-4 px-5 py-16 text-center"
      data-testid="inbox-empty"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-subtle/40 text-success ring-1 ring-success/15">
        <CheckCircle2 className="h-7 w-7" strokeWidth={1.75} />
      </div>
      <div className="text-base font-semibold tracking-tightish text-fg-strong">
        {title}
      </div>
      <div className="max-w-md text-sm leading-relaxed text-fg-muted">
        {description}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InboxRowCard — the single row representation. Replaces the prior
// InboxRowItem with a denser, richer layout that responds to severity,
// density, focus, selection, and pinned-category state.
// ---------------------------------------------------------------------------
function InboxRowCard({
  row,
  now,
  density,
  isFocused,
  onFocusRow,
  canAct,
  isResolvingThis,
  isSelected,
  onToggleSelected,
  onStartResolve,
  onCancelResolve,
  onConfirmResolve,
  onAcknowledge,
  ackBusy,
  resolveBusy,
}: {
  row: InboxRow;
  now: Date;
  density: InboxDensity;
  isFocused: boolean;
  onFocusRow: () => void;
  canAct: boolean;
  isResolvingThis: boolean;
  isSelected: boolean;
  onToggleSelected: (id: string, isOn: boolean) => void;
  onStartResolve: (id: string) => void;
  onCancelResolve: () => void;
  onConfirmResolve: (id: string, notes: string) => void;
  onAcknowledge: (id: string) => void;
  ackBusy: boolean;
  resolveBusy: boolean;
}): ReactNode {
  const sev = SEVERITY_CONFIG[row.severity];
  const Icon = sev.icon;
  const family = rowFamily(row);
  const isApproval = family === "approval";
  const canAck =
    canAct && !isApproval && row.inline_actions.includes("acknowledge");
  const canResolve =
    canAct && !isApproval && row.inline_actions.includes("resolve");
  const showSelectCheckbox = canResolve;
  const isPinned = PINNED_CATEGORIES.has(row.category);
  const stuck = isRowStuck(row, now);
  const fresh = isRowFresh(row, now);

  const isCreditNeeded = row.category === "lionwheel_credit_needed";
  const creditPayload = isCreditNeeded
    ? extractCreditNeededPayload(row.raw)
    : null;

  const isInlineApproval =
    isApproval &&
    (row.type === "approval:waste" || row.type === "approval:physical_count");
  const isRecApproval =
    isApproval &&
    (row.type === "approval:production_recommendation" ||
      row.type === "approval:purchase_recommendation");
  // Inline panels render only on non-compact density. Recommendation
  // approve/dismiss is additionally gated to planner/admin (canAct), matching
  // the Inbox audience for approvals.
  const showWastePCInline = isInlineApproval && density !== "compact";
  const showRecInline = isRecApproval && canAct && density !== "compact";
  const hasInlinePanel = showWastePCInline || showRecInline;

  const labels = buttonLabelsFor(row.category);
  const isResolveDestructive = labels.resolve === "דחה";
  const friendlyCategory = categoryFriendly(row.category);

  return (
    <li
      className={cn(
        "group relative transition-colors duration-150",
        densityRowPaddingClass(density),
        isFocused && "bg-bg-subtle/60 ring-1 ring-inset ring-accent/40",
        isSelected && "bg-accent-soft/40",
        stuck && "bg-danger-softer/15",
        fresh && "ring-1 ring-inset ring-success/30",
        "hover:bg-bg-subtle/50",
      )}
      data-testid="inbox-row"
      data-row-id={row.id}
      data-row-type={row.type}
      data-row-category={row.category}
      data-row-family={family}
      data-row-severity={row.severity}
      data-row-pinned={isPinned ? "true" : undefined}
      data-row-stuck={stuck ? "true" : undefined}
      onClick={onFocusRow}
      onKeyDown={(e) => {
        if (e.key === "Tab") return; // let Tab navigate normally
      }}
      tabIndex={-1}
      role="listitem"
    >
      {/* Severity left edge — slightly thicker for critical (§2). */}
      <div
        className={cn(
          "absolute inset-y-0 left-0",
          row.severity === "critical" ? "w-[4px]" : "w-[3px]",
          sev.accentBar,
          stuck && "animate-pulse",
        )}
        aria-hidden
      />

      <div className={cn("flex items-start", densityChipGapClass(density))}>
        {/* Tranche 051 (FLOW-019): on <md the clickable label grows to a
            32×32 hit area via negative margins, so the visible checkbox
            position and the row layout are pixel-identical to md+. */}
        {showSelectCheckbox ? (
          <label
            className="mt-1.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center max-md:-mx-1.5 max-md:-mb-1.5 max-md:mt-0 max-md:h-8 max-md:w-8"
            data-testid="inbox-row-select"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-accent"
              checked={isSelected}
              onChange={(e) => onToggleSelected(row.id, e.currentTarget.checked)}
              aria-label={`Select row ${row.summary}`}
            />
          </label>
        ) : (
          <div className="mt-1.5 h-5 w-5 shrink-0" aria-hidden />
        )}

        {/* Severity dot — replaces the icon-in-box (§1). On comfortable
            density we keep the icon container for stronger visual anchor. */}
        {density === "comfortable" ? (
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded border",
              sev.tone === "danger" &&
                "border-danger/40 bg-danger-softer text-danger",
              sev.tone === "warning" &&
                "border-warning/40 bg-warning-softer text-warning",
              sev.tone === "info" && "border-info/40 bg-info-softer text-info",
            )}
            aria-label={`Severity ${sev.label}`}
            role="img"
          >
            <Icon className="h-4 w-4" strokeWidth={severityIconStroke(row.severity)} />
          </div>
        ) : (
          <div className="mt-2 flex h-3 shrink-0 items-center" aria-hidden>
            <span
              className={cn(
                "block h-2.5 w-2.5 rounded-full ring-2 ring-bg",
                SEV_DOT[row.severity],
              )}
              role="img"
              aria-label={`Severity ${sev.label}`}
              title={sev.label}
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* Quiet meta line — severity is carried by the dot/edge bar, so no
              severity text chip here. Category is the one identifying chip;
              everything else recedes. */}
          <div className="flex flex-wrap items-center gap-2">
            {!row.type.startsWith("exception:") ? (
              <span
                className="chip-ghost"
                data-testid="inbox-row-type"
                title={row.type}
              >
                {typeLabel(row.type)}
              </span>
            ) : null}
            <span
              className={cn(
                "chip max-w-[18rem] truncate",
                isPinned && "border-accent/50 text-accent",
              )}
              data-testid="inbox-row-category"
              title={row.category}
            >
              {isPinned ? <Pin className="h-2.5 w-2.5" strokeWidth={2.5} /> : null}
              {friendlyCategory}
            </span>
            {stuck ? (
              <span
                className="inline-flex items-center rounded-full border border-danger/30 bg-danger-softer px-2 py-0.5 text-3xs font-semibold text-danger"
                title="Critical and waiting more than 72h"
              >
                Stuck
              </span>
            ) : null}
            {fresh ? (
              <span
                className="inline-flex items-center rounded-full border border-success/40 bg-success-subtle px-2 py-0.5 text-3xs font-semibold text-success"
                title="Just arrived"
              >
                New
              </span>
            ) : null}
            <span
              className={cn(
                "ml-auto shrink-0 font-mono text-3xs lowercase",
                stuck ? "text-danger" : "text-fg-subtle",
              )}
              title={formatTimestamp(row.created_at)}
            >
              {ageHumanized(row.created_at, now)}
            </span>
          </div>

          {/* The summary is the one thing the operator reads — give it room
              and a single, consistent weight. */}
          <div
            className={cn(
              "mt-1.5 font-semibold leading-snug tracking-tightish text-fg-strong",
              density === "compact" ? "text-sm" : "text-base",
            )}
            data-testid="inbox-row-summary"
          >
            {row.summary}
          </div>

          {isCreditNeeded && creditPayload && density !== "compact" ? (
            <div
              className="mt-3"
              data-testid="inbox-row-credit-card"
              onClick={(e) => e.stopPropagation()}
            >
              <CreditNeededFactCard payload={creditPayload} now={now} />
            </div>
          ) : null}

          {showWastePCInline ? (
            <div onClick={(e) => e.stopPropagation()}>
              <ApprovalInlineCard row={row} now={now} />
            </div>
          ) : null}

          {showRecInline ? (
            <div onClick={(e) => e.stopPropagation()}>
              <RecommendationInlineCard row={row} />
            </div>
          ) : null}

          <div
            className={cn(
              "mt-3 flex flex-wrap items-center",
              densityChipGapClass(density),
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {isApproval ? (
              hasInlinePanel ? (
                <Link
                  href={row.deep_link}
                  className="btn btn-sm gap-1 text-fg-muted max-md:min-h-[32px]"
                  data-testid="inbox-row-review-full"
                >
                  פרטים מלאים
                  <ArrowLeft className="h-3 w-3 rtl:rotate-180" strokeWidth={2.25} />
                </Link>
              ) : (
                <Link
                  href={row.deep_link}
                  className="btn btn-sm btn-primary gap-1.5 max-md:min-h-[32px]"
                  data-testid="inbox-row-review"
                >
                  Review
                  <ArrowLeft className="h-3 w-3 rtl:rotate-180" strokeWidth={2.25} />
                </Link>
              )
            ) : !isApproval && row.deep_link !== "/inbox" ? (
              <Link
                href={row.deep_link}
                className={cn(
                  "btn btn-sm gap-1.5 max-md:min-h-[32px]",
                  labels.deepLink && /אשר|פתור|מפה|חדש|עדכן/.test(labels.deepLink)
                    ? "btn-primary"
                    : "",
                )}
                data-testid="inbox-row-fix-link"
              >
                {labels.deepLink ?? "Fix this"}
                <ArrowLeft className="h-3 w-3 rtl:rotate-180" strokeWidth={2.25} />
              </Link>
            ) : null}
            {!isApproval && row.item_id ? (
              <Link
                href={`/admin/masters/items/${encodeURIComponent(row.item_id)}`}
                className="btn btn-sm gap-1.5 max-md:min-h-[32px]"
                data-testid="inbox-row-item-link"
                title={`Open item master for ${row.item_id}`}
              >
                <span className="text-3xs font-mono opacity-70">item:</span>
                {row.item_id}
              </Link>
            ) : null}
            {!isApproval && row.component_id && row.component_id !== row.item_id ? (
              <Link
                href={`/admin/masters/items/${encodeURIComponent(row.component_id)}`}
                className="btn btn-sm gap-1.5 max-md:min-h-[32px]"
                data-testid="inbox-row-component-link"
                title={`Open item master for ${row.component_id}`}
              >
                <span className="text-3xs font-mono opacity-70">comp:</span>
                {row.component_id}
              </Link>
            ) : null}
            {canAck ? (
              <button
                type="button"
                className="btn btn-sm gap-1.5 max-md:min-h-[32px]"
                data-testid="inbox-row-acknowledge"
                disabled={ackBusy}
                onClick={() => onAcknowledge(row.id)}
                title="Press 'a' to acknowledge"
              >
                <CheckCircle2 className="h-3 w-3" strokeWidth={2.25} />
                {ackBusy ? "Submitting…" : labels.acknowledge ?? "Acknowledge"}
              </button>
            ) : null}
            {canResolve && !isResolvingThis ? (
              <button
                type="button"
                className={cn(
                  "btn btn-sm gap-1.5 max-md:min-h-[32px]",
                  isResolveDestructive
                    ? "border-danger/40 text-danger hover:bg-danger-softer"
                    : "btn-primary",
                )}
                data-testid="inbox-row-resolve"
                onClick={() => onStartResolve(row.id)}
                title="Press 'r' to open the resolve panel"
              >
                {labels.resolve ?? "Resolve"}
              </button>
            ) : null}
          </div>

          {isResolvingThis ? (
            <div onClick={(e) => e.stopPropagation()}>
              <ResolvePanel
                busy={resolveBusy}
                onCancel={onCancelResolve}
                onConfirm={(notes) => onConfirmResolve(row.id, notes)}
                category={row.category}
                isDestructive={isResolveDestructive}
              />
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// SystemDiagnosticsSection — the collapsed home for non-actionable rows.
//
// Everything the operator cannot decide on (integration / sync / auth
// warnings and informational diagnostics) lives here instead of the working
// inbox. Collapsed by default; the expanded/collapsed state is a per-user
// preference. Inside, rows are split into two labelled sub-groups so the
// noise stays scannable. Nothing is deleted or hidden from the system — the
// rows are still on the page, one click away, and still fully resolvable.
// ---------------------------------------------------------------------------
function SystemDiagnosticsSection({
  rows,
  open,
  onToggle,
  renderRow,
}: {
  rows: InboxRow[];
  open: boolean;
  onToggle: () => void;
  renderRow: (row: InboxRow, focusIdx: number | null) => ReactNode;
}): ReactNode {
  const health: InboxRow[] = [];
  const diagnostics: InboxRow[] = [];
  for (const r of rows) {
    if (rowLane(r) === "system_health") health.push(r);
    else diagnostics.push(r);
  }
  const criticalCount = rows.filter((r) => r.severity === "critical").length;

  return (
    <section
      className="border-t border-border/60 bg-bg-subtle/25"
      data-testid="inbox-system-section"
      aria-label="System and diagnostics"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        data-testid="inbox-system-toggle"
        className="flex w-full items-center gap-2.5 px-5 py-3 text-left transition-colors hover:bg-bg-subtle/70"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-200",
            !open && "-rotate-90 rtl:rotate-90",
          )}
          strokeWidth={2.25}
        />
        <Layers className="h-4 w-4 shrink-0 text-fg-muted" strokeWidth={2} />
        <span className="text-sm font-semibold text-fg-strong">
          System &amp; diagnostics
        </span>
        <span
          className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-bg-subtle px-1.5 text-3xs font-bold tabular-nums text-fg-strong ring-1 ring-border/60"
          data-testid="inbox-system-count"
        >
          {rows.length > 99 ? "99+" : rows.length}
        </span>
        {criticalCount > 0 ? (
          <span
            className="inline-flex items-center gap-1 rounded-sm bg-danger-softer px-1.5 py-0.5 text-3xs font-bold uppercase tracking-sops text-danger"
            title={`${criticalCount} critical notice${criticalCount === 1 ? "" : "s"} in this section`}
          >
            <AlertCircle className="h-3 w-3" strokeWidth={2.5} />
            {criticalCount} critical
          </span>
        ) : null}
        <span className="ml-auto truncate text-3xs text-fg-subtle">
          {open
            ? "Background notices — collapse to hide"
            : `${health.length} sync · ${diagnostics.length} info — nothing for you to do`}
        </span>
      </button>

      {open ? (
        <div data-testid="inbox-system-body">
          <SystemSubGroup
            label="Integration & sync health"
            hint="Connectivity, auth, and sync warnings. Usually self-recovers or is an admin/IT concern."
            icon={AlertTriangle}
            rows={health}
            renderRow={renderRow}
          />
          <SystemSubGroup
            label="Informational"
            hint="Diagnostic and audit-only records. Logged for traceability — nothing to resolve."
            icon={Info}
            rows={diagnostics}
            renderRow={renderRow}
          />
        </div>
      ) : null}
    </section>
  );
}

function SystemSubGroup({
  label,
  hint,
  icon: Icon,
  rows,
  renderRow,
}: {
  label: string;
  hint: string;
  icon: typeof Info;
  rows: InboxRow[];
  renderRow: (row: InboxRow, focusIdx: number | null) => ReactNode;
}): ReactNode {
  if (rows.length === 0) return null;
  return (
    <div data-testid="inbox-system-subgroup">
      <div className="flex items-center gap-2 border-b border-border/40 bg-bg-subtle/55 px-5 py-1.5">
        <Icon className="h-3 w-3 shrink-0 text-fg-subtle" strokeWidth={2} />
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-muted">
          {label}
        </span>
        <span className="font-mono text-3xs text-fg-subtle">{rows.length}</span>
        <span className="ml-2 hidden truncate text-3xs text-fg-subtle md:inline">
          {hint}
        </span>
      </div>
      <ul className="divide-y divide-border/40" role="list">
        {rows.map((r) => renderRow(r, null))}
      </ul>
    </div>
  );
}
