"use client";

// ---------------------------------------------------------------------------
// ActionList — the default view of the unified procurement page.
//
// Tranche 132 (procurement-triage-decision-grade) rebuilt this list around the
// planner's three real decisions:
//
//   להעביר לביצוע  — rows whose last safe order day is today or past, with the
//                    expected shortage quantified ("גם בהזמנה היום: פער ~N ימים").
//   לדחות          — rows with a concrete future last-safe-order date, shown.
//   לספור מחדש    — a per-row flag when the on-hand behind the recommendation
//                    was never physically counted (or counted long ago), linking
//                    straight to the counting surface.
//
// Classification comes from the v2 decision engine (real shortage math over
// each line's coverage_trace, with a date/tier fallback for old sessions).
// The engine's structural warnings (open PO with no delivery date, overdue
// "zombie" supply) surface INLINE on the exact affected row — the global
// banner stack is gone (a compact IntegrityStrip above the list carries the
// session-level story).
//
// Noise rules: the SQL tier badge is gone (the bucket header already says it),
// a "מוצע" status badge is not rendered (it is the default state), and
// confidence chips appear only when something is actually off.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  PackageOpen,
  Search,
} from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatIls } from "@/lib/utils/format-money";
import { cn } from "@/lib/cn";
import type {
  PoStatus,
  PurchaseSessionPo,
  PurchaseSessionWarning,
} from "../../purchase-session/_lib/types";
import {
  assessLine,
  daysHe,
  fmtDateHe,
  groupByDecision,
  todayISO,
  type ClassifiedPo,
  type DecisionBucket,
} from "../_lib/decision";
import {
  buildCoverageReasoning,
  parseCoverageTrace,
} from "../_lib/coverage-trace";
import {
  buildInboundIssueMap,
  inboundIssueLabel,
  inboundIssueTooltip,
  type InboundIssue,
} from "../_lib/session-warnings";

// Tranche 047 — fallback link when no onOpen handler is supplied. The
// classic per-PO session URL is a redirect stub back to
// /planning/procurement since Tranche 045, so link there directly.
const FALLBACK_OPEN_HREF = "/planning/procurement";

// The counting surface a "לספור קודם" chip hands off to.
const COUNT_HREF = "/stock/physical-count";

const STATUS_LABEL: Record<PoStatus, string> = {
  proposed: "מוצע",
  approved: "אושר — מוכן לשליחה",
  placed: "הועבר לביצוע",
  skipped: "דולג / בוטל",
};
const STATUS_TONE: Record<PoStatus, BadgeTone> = {
  proposed: "neutral",
  approved: "info",
  placed: "success",
  skipped: "muted",
};

interface SectionMeta {
  key: DecisionBucket;
  title: string;
  hint: string;
  tone: BadgeTone;
  icon: typeof Clock;
}

const SECTIONS: SectionMeta[] = [
  {
    key: "must_today",
    title: "חייב לצאת היום",
    hint: "דחייה נוספת יוצרת או מעמיקה חוסר בפועל",
    tone: "danger",
    icon: AlertTriangle,
  },
  {
    key: "can_wait",
    title: "יכול לחכות",
    hint: "לכל הזמנה מוצג עד מתי אפשר להמתין בבטחה",
    tone: "warning",
    icon: Clock,
  },
  {
    key: "handled",
    title: "טופל",
    hint: "הוזמן, דולג או בוטל",
    tone: "success",
    icon: CheckCircle2,
  },
];

function activeLineCount(po: PurchaseSessionPo): number {
  return po.lines.filter((l) => !l.is_dropped).length;
}

function fmtCovNum(n: number | null): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

// Compact one-line "why this quantity" caption for the row expansion — decodes
// the per-line coverage_trace (demand / on-hand / projected-at-need) so the scan
// view explains each line without opening focus mode.
function CoverageCaption({ trace }: { trace: unknown }): JSX.Element | null {
  const r = buildCoverageReasoning(parseCoverageTrace(trace));
  if (!r || !r.hasSignal) return null;
  const tone =
    r.severity === "stockout"
      ? "text-danger-fg"
      : r.severity === "below_safety"
        ? "text-warning-fg"
        : "text-fg-faint";
  const head =
    r.severity === "stockout"
      ? "צפוי לאזול"
      : r.severity === "below_safety"
        ? "מתחת לרצפת הביטחון"
        : "כיסוי מספק";
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 text-3xs text-fg-faint"
      data-testid="procurement-line-coverage"
    >
      <span className={cn("font-semibold", tone)}>{head}</span>
      {r.demand != null && (
        <span>
          ביקוש{" "}
          <span className="tabular-nums text-fg-muted">
            {fmtCovNum(r.demand)}
          </span>
        </span>
      )}
      {r.onHand != null && (
        <span>
          במלאי{" "}
          <span className="tabular-nums text-fg-muted">
            {fmtCovNum(r.onHand)}
          </span>
        </span>
      )}
      {r.projectedAtNeed != null && (
        <span>
          צפי{" "}
          <span
            className={cn(
              "tabular-nums",
              r.wouldRunOut
                ? "text-danger-fg font-semibold"
                : "text-fg-muted",
            )}
          >
            {fmtCovNum(r.projectedAtNeed)}
          </span>
        </span>
      )}
      {r.leadTimeDays != null && (
        <span>
          אספקה{" "}
          <span className="tabular-nums text-fg-muted">
            {r.leadTimeDays} ימ׳
          </span>
        </span>
      )}
    </div>
  );
}

// Per-line trust caption (trace_version 3+): count age + defaulted lead time.
// Quiet — renders nothing when there is nothing to flag.
function LineTrustCaption({
  line,
  today,
}: {
  line: PurchaseSessionPo["lines"][number];
  today: string;
}): JSX.Element | null {
  const risk = assessLine(line, today);
  if (!risk) return null;
  const flags: string[] = [];
  if (risk.countAgeDays !== undefined && risk.recount) {
    flags.push(
      risk.countAgeDays == null
        ? "המלאי לא נספר מעולם"
        : `ספירה אחרונה לפני ${risk.countAgeDays} ימ׳`,
    );
  }
  if (risk.ltSource === "global_default") {
    flags.push("זמן אספקה: ברירת מחדל (14 ימ׳)");
  }
  if (risk.missingPrice) {
    flags.push("מחיר חסר — העלות מוצגת 0");
  }
  if (flags.length === 0) return null;
  return (
    <div className="text-3xs text-warning-fg/90">{flags.join(" · ")}</div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function ProcurementRow({
  classified,
  inbound,
  today,
  onOpen,
}: {
  classified: ClassifiedPo<PurchaseSessionPo>;
  inbound: InboundIssue[];
  today: string;
  onOpen?: (po: PurchaseSessionPo) => void;
}): JSX.Element {
  const { po, bucket, whyNow, shortageDays, recount, waitUntil } = classified;
  const [expanded, setExpanded] = useState(false);
  const lineCount = activeLineCount(po);
  const actionable = bucket !== "handled";
  const hasShortage = shortageDays > 0;

  const whyTone =
    bucket === "handled"
      ? "text-fg-faint"
      : hasShortage
        ? "text-danger-fg font-medium"
        : bucket === "must_today"
          ? "text-warning-fg font-medium"
          : "text-fg-muted";

  return (
    <div
      className={cn(
        "rounded-md border bg-bg-subtle/30 transition-colors",
        hasShortage
          ? "border-danger/40"
          : "border-border/60 hover:border-border",
      )}
      data-testid={`procurement-row-${po.session_po_id}`}
    >
      <div className="flex flex-wrap items-start gap-3 p-4 sm:flex-nowrap">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 -m-2 p-2 text-fg-muted transition-colors hover:text-fg"
          aria-label={expanded ? "כווץ שורות" : "הצג שורות"}
          aria-expanded={expanded}
          data-testid={`procurement-row-toggle-${po.session_po_id}`}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden />
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-semibold text-fg">
              {po.supplier_snapshot}
            </span>
            {hasShortage && (
              <Badge tone="danger" size="xs" dot animated>
                חוסר צפוי ~{daysHe(shortageDays)}
              </Badge>
            )}
            {po.status !== "proposed" && (
              <Badge tone={STATUS_TONE[po.status]} size="xs">
                {STATUS_LABEL[po.status]}
              </Badge>
            )}
            <span className="ms-auto shrink-0 font-mono text-sm font-semibold tabular-nums text-fg">
              {formatIls(po.total_cost)}
            </span>
          </div>

          <div
            className={cn("text-xs", whyTone)}
            data-testid={`procurement-whynow-${po.session_po_id}`}
          >
            {whyNow}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-3xs text-fg-faint">
            <span className="tabular-nums">
              {lineCount} פריט{lineCount === 1 ? "" : "ים"}
            </span>
            {bucket === "can_wait" && waitUntil && (
              <span className="tabular-nums">
                · להזמין עד {fmtDateHe(waitUntil)}
              </span>
            )}
            {inbound.length > 0 && (
              <Badge
                tone="warning"
                size="xs"
                dot
                tooltip={inboundIssueTooltip(inbound)}
              >
                {inboundIssueLabel(inbound)}
              </Badge>
            )}
            {actionable && recount && (
              <Link
                href={COUNT_HREF}
                className="inline-flex"
                data-testid={`procurement-recount-${po.session_po_id}`}
              >
                <Badge
                  tone="info"
                  size="xs"
                  icon={<ClipboardList className="h-3 w-3" />}
                  tooltip={`ההמלצה נשענת על מלאי שלא אומת (${recount.label}${recount.worstAgeDays != null ? ` — נספר לפני ${recount.worstAgeDays} ימים` : " — לא נספר מעולם"}). ספירה קצרה לפני ההזמנה תמנע קנייה מיותרת. לחיצה פותחת את מסך הספירה.`}
                >
                  לספור קודם
                  {recount.worstAgeDays != null
                    ? ` · ${recount.worstAgeDays} ימ׳`
                    : " · לא נספר"}
                </Badge>
              </Link>
            )}
          </div>
        </div>

        {actionable &&
          (onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(po)}
              className="btn btn-accent btn-sm w-full shrink-0 sm:w-auto"
              data-testid={`procurement-open-${po.session_po_id}`}
            >
              פתח במיקוד ←
            </button>
          ) : (
            <Link
              href={FALLBACK_OPEN_HREF}
              className="btn btn-accent btn-sm w-full shrink-0 sm:w-auto"
              data-testid={`procurement-open-${po.session_po_id}`}
            >
              פתח ←
            </Link>
          ))}
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-border/60 px-4 py-3">
          {lineCount === 0 ? (
            <div className="text-3xs text-fg-faint">אין שורות פעילות.</div>
          ) : (
            po.lines
              .filter((l) => !l.is_dropped)
              .map((l) => (
                <div key={l.session_po_line_id} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-fg">{l.line_label}</span>
                    <span className="shrink-0 tabular-nums text-fg-muted">
                      {l.final_qty} {l.uom} · {formatIls(l.line_cost)}
                    </span>
                  </div>
                  <CoverageCaption trace={l.coverage_trace} />
                  <LineTrustCaption line={l} today={today} />
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface ActionListProps {
  pos: PurchaseSessionPo[];
  /** Session warnings — their machine-readable lines payload drives the
   *  inline inbound-supply chips (double-buy / zombie PO) per row. */
  warnings?: PurchaseSessionWarning[];
  /** When provided (Tranche 029), the primary row action opens inline focus
   *  mode. Until then rows link to the classic session screen. */
  onOpen?: (po: PurchaseSessionPo) => void;
  /** Injectable for deterministic tests; defaults to today. */
  today?: string;
}

// Filter/sort controls (Tom-directed 2026-07-16, upgraded in tranche 132).
// Pure client-side over the already-fetched session. Filters/sort apply
// WITHIN each decision bucket so the priority grouping stays intact; the
// summary strip always reflects the FULL session (a filter must never shrink
// reported risk).
type BucketFilter = "all" | DecisionBucket | "recount";
type SortKey = "urgency" | "amount_desc" | "supplier" | "order_by_date";

const SORTERS: Record<
  Exclude<SortKey, "urgency">,
  (a: ClassifiedPo<PurchaseSessionPo>, b: ClassifiedPo<PurchaseSessionPo>) => number
> = {
  amount_desc: (a, b) => b.po.total_cost - a.po.total_cost,
  supplier: (a, b) =>
    a.po.supplier_snapshot.localeCompare(b.po.supplier_snapshot, "he"),
  order_by_date: (a, b) =>
    a.po.order_by_date < b.po.order_by_date
      ? -1
      : a.po.order_by_date > b.po.order_by_date
        ? 1
        : 0,
};

function matchesQuery(po: PurchaseSessionPo, q: string): boolean {
  if (po.supplier_snapshot.toLowerCase().includes(q)) return true;
  return po.lines.some(
    (l) => !l.is_dropped && l.line_label.toLowerCase().includes(q),
  );
}

export function ActionList({
  pos,
  warnings = [],
  onOpen,
  today,
}: ActionListProps): JSX.Element {
  const effToday = today ?? todayISO();
  const [query, setQuery] = useState("");
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("urgency");

  const inboundMap = useMemo(() => buildInboundIssueMap(warnings), [warnings]);

  // Classify the FULL session once — the summary strip reads this, and the
  // visible list below is a filtered view of the same classification.
  const fullGroups = useMemo(
    () => groupByDecision(pos, effToday),
    [pos, effToday],
  );

  const allClassified = useMemo(
    () => [
      ...fullGroups.must_today,
      ...fullGroups.can_wait,
      ...fullGroups.handled,
    ],
    [fullGroups],
  );

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pick = (rows: ClassifiedPo<PurchaseSessionPo>[]) => {
      let out = rows;
      if (q) out = out.filter((r) => matchesQuery(r.po, q));
      if (bucketFilter === "recount")
        out = out.filter((r) => r.recount != null);
      const sorter = sortKey === "urgency" ? null : SORTERS[sortKey];
      if (sorter) out = [...out].sort(sorter);
      return out;
    };
    return {
      must_today:
        bucketFilter === "all" ||
        bucketFilter === "must_today" ||
        bucketFilter === "recount"
          ? pick(fullGroups.must_today)
          : [],
      can_wait:
        bucketFilter === "all" ||
        bucketFilter === "can_wait" ||
        bucketFilter === "recount"
          ? pick(fullGroups.can_wait)
          : [],
      handled:
        bucketFilter === "all" || bucketFilter === "handled"
          ? pick(fullGroups.handled)
          : [],
    };
  }, [fullGroups, query, bucketFilter, sortKey]);

  const isFiltered = query.trim() !== "" || bucketFilter !== "all";
  const visibleCount =
    visibleGroups.must_today.length +
    visibleGroups.can_wait.length +
    visibleGroups.handled.length;

  // --- decision summary (always full-session) ------------------------------
  const mustRows = fullGroups.must_today;
  const mustCost = mustRows.reduce((s, r) => s + (r.po.total_cost || 0), 0);
  const recountCount = allClassified.filter(
    (r) => r.bucket !== "handled" && r.recount != null,
  ).length;

  const rowInbound = (po: PurchaseSessionPo): InboundIssue[] => {
    const issues: InboundIssue[] = [];
    for (const l of po.lines) {
      if (l.is_dropped) continue;
      const target = l.component_id ?? l.item_id;
      if (!target) continue;
      const found = inboundMap.get(target);
      if (found) issues.push(...found);
    }
    return issues;
  };

  return (
    <Tooltip.Provider>
      <div className="space-y-5">
        {/* Decision summary — the one orienting line. Computed from the FULL,
            unfiltered session on purpose: a search or bucket filter narrows
            the list below, but must never shrink the reported risk. */}
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-4 py-3 text-sm",
            mustRows.length > 0
              ? "border-danger/40 bg-danger-softer/40"
              : "border-border/60 bg-bg-subtle/20",
          )}
          data-testid="procurement-at-risk-summary"
        >
          {mustRows.length > 0 ? (
            <>
              <AlertTriangle
                className="h-4 w-4 shrink-0 text-danger-fg"
                aria-hidden
              />
              <span className="font-bold text-danger-fg">
                {mustRows.length} חייב לצאת היום
              </span>
              <span className="tabular-nums text-fg-muted">
                · {formatIls(mustCost)}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2
                className="h-4 w-4 shrink-0 text-success-fg"
                aria-hidden
              />
              <span className="font-semibold text-success-fg">
                אין הזמנות שחייבות לצאת היום
              </span>
            </>
          )}
          <span className="text-fg-muted">
            · {fullGroups.can_wait.length} יכולות לחכות
          </span>
          {recountCount > 0 && (
            <span
              className="inline-flex items-center gap-1 text-info-fg"
              data-testid="procurement-recount-summary"
            >
              · <ClipboardList className="h-3.5 w-3.5" aria-hidden />
              {recountCount} כדאי לספור קודם
            </span>
          )}
        </div>

        {/* Search + filter + sort */}
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-bg-subtle/20 px-3 py-2"
          data-testid="procurement-filter-bar"
        >
          <div className="relative min-w-[11rem] flex-1">
            <Search
              className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש ספק או פריט…"
              aria-label="חיפוש לפי ספק או פריט"
              className="input w-full py-1.5 pr-8 text-xs"
              data-testid="procurement-filter-search"
            />
          </div>
          <select
            value={bucketFilter}
            onChange={(e) => setBucketFilter(e.target.value as BucketFilter)}
            aria-label="סינון לפי קטגוריה"
            className="input w-40 py-1.5 text-xs"
            data-testid="procurement-filter-bucket"
          >
            <option value="all">כל הקטגוריות</option>
            <option value="must_today">חייב לצאת היום</option>
            <option value="can_wait">יכול לחכות</option>
            <option value="recount">לספור קודם</option>
            <option value="handled">טופל</option>
          </select>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="מיון"
            className="input w-44 py-1.5 text-xs"
            data-testid="procurement-sort"
          >
            <option value="urgency">מיין: דחיפות</option>
            <option value="amount_desc">מיין: סכום (גבוה תחילה)</option>
            <option value="supplier">מיין: ספק (א-ת)</option>
            <option value="order_by_date">מיין: תאריך יעד</option>
          </select>
          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setBucketFilter("all");
              }}
              className="text-3xs font-medium text-accent hover:underline"
              data-testid="procurement-filter-clear"
            >
              נקה סינון
            </button>
          )}
        </div>

        {isFiltered && visibleCount === 0 && (
          <div className="rounded-md border border-border/60 bg-bg-subtle/30 px-4 py-6 text-center text-xs text-fg-muted">
            אין הזמנות התואמות את הסינון.
          </div>
        )}

        {(!isFiltered || visibleCount > 0) && SECTIONS.map((section) => {
          const rows = visibleGroups[section.key];
          // A bucket the current filter excludes entirely disappears instead
          // of rendering an empty shell — less scrolling, less noise.
          if (
            bucketFilter !== "all" &&
            rows.length === 0 &&
            !(bucketFilter === section.key)
          ) {
            return null;
          }
          const Icon = section.icon;
          const total = rows.reduce((sum, r) => sum + (r.po.total_cost || 0), 0);
          return (
            <SectionCard key={section.key}>
              <div className="flex items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={cn(
                      "h-4.5 w-4.5",
                      section.tone === "danger" && "text-danger-fg",
                      section.tone === "warning" && "text-warning-fg",
                      section.tone === "success" && "text-success-fg",
                    )}
                    aria-hidden
                  />
                  <div>
                    <h2 className="text-base font-bold text-fg">
                      {section.title}
                    </h2>
                    <p className="mt-0.5 text-3xs text-fg-faint">
                      {section.hint}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-left">
                  <Badge tone={section.tone} size="sm">
                    {rows.length}
                  </Badge>
                  {rows.length > 0 && (
                    <div className="mt-1 text-3xs tabular-nums text-fg-faint">
                      {formatIls(total)}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-3 px-6 py-4">
                {rows.length === 0 ? (
                  <div
                    className="flex items-center gap-2 text-xs text-fg-faint"
                    data-testid={`procurement-empty-${section.key}`}
                  >
                    <PackageOpen className="h-3.5 w-3.5" aria-hidden />
                    אין הזמנות בקטגוריה זו.
                  </div>
                ) : (
                  rows.map((classified) => (
                    <ProcurementRow
                      key={classified.po.session_po_id}
                      classified={classified}
                      inbound={rowInbound(classified.po)}
                      today={effToday}
                      onOpen={onOpen}
                    />
                  ))
                )}
              </div>
            </SectionCard>
          );
        })}
      </div>
    </Tooltip.Provider>
  );
}
