"use client";

import { CalendarDays, CheckCircle2, AlertTriangle, MinusCircle, HelpCircle } from "lucide-react";
import { formatQty } from "@/lib/utils/format-quantity";
import { cn } from "@/lib/cn";
import type { CoverageStatus, MaterialGroup } from "./types";

// ---------------------------------------------------------------------------
// Date helpers — all plan dates are YYYY-MM-DD strings parsed as local dates.
// ---------------------------------------------------------------------------

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Parse a YYYY-MM-DD string into a local Date (midnight). */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** "May 21" — compact, for inline chips. */
export function formatPlanDate(iso: string): string {
  const d = parseIsoDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Wed, May 21" — used in headers and tooltips. */
export function formatPlanDateLong(iso: string): string {
  const d = parseIsoDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function startOfToday(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

/** Whole-day difference between an ISO date and today (positive = future). */
export function daysFromToday(iso: string): number {
  const d = parseIsoDate(iso);
  if (Number.isNaN(d.getTime())) return 0;
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - startOfToday().getTime()) / 86_400_000);
}

/** "Today" / "Tomorrow" / "In 9 days" / "9 days ago" — a human cadence cue. */
export function relativeDayLabel(iso: string): string {
  const n = daysFromToday(iso);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1) return `In ${n} days`;
  return `${Math.abs(n)} days ago`;
}

// ---------------------------------------------------------------------------
// DateChip — the small "when is this needed" marker shown next to a component.
// ---------------------------------------------------------------------------

export function DateChip({
  iso,
  label = "Needed",
  tone = "neutral",
}: {
  iso: string;
  label?: string;
  tone?: "neutral" | "soon" | "danger";
}) {
  const toneCls =
    tone === "danger"
      ? "border-danger/40 bg-danger-softer/50 text-danger-fg"
      : tone === "soon"
        ? "border-warning/40 bg-warning-softer/50 text-warning-fg"
        : "border-border/70 bg-bg-subtle/70 text-fg-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs font-semibold whitespace-nowrap",
        toneCls,
      )}
      title={`${label} ${formatPlanDateLong(iso)} — ${relativeDayLabel(iso)}`}
    >
      <CalendarDays className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
      <span>{formatPlanDate(iso)}</span>
      <span className="font-medium text-fg-faint">· {relativeDayLabel(iso)}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Coverage badge — shared status pill.
// ---------------------------------------------------------------------------

const COVERAGE_META: Record<
  CoverageStatus,
  { label: string; cls: string; icon: typeof CheckCircle2 }
> = {
  covered: {
    label: "In stock",
    cls: "text-success-fg",
    icon: CheckCircle2,
  },
  partial: {
    label: "Partial",
    cls: "text-warning-fg",
    icon: MinusCircle,
  },
  not_covered: {
    label: "To order",
    cls: "text-danger-fg",
    icon: AlertTriangle,
  },
  no_stock_data: {
    label: "No stock data",
    cls: "text-fg-faint",
    icon: HelpCircle,
  },
};

export function CoverageBadge({ status }: { status: CoverageStatus }) {
  const meta = COVERAGE_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-semibold",
        meta.cls,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
      {meta.label}
    </span>
  );
}

/** A row is "short" (needs purchasing attention) for these statuses. */
export function isShortStatus(status: CoverageStatus): boolean {
  return (
    status === "partial" ||
    status === "not_covered" ||
    status === "no_stock_data"
  );
}

// ---------------------------------------------------------------------------
// Material group labels.
// ---------------------------------------------------------------------------

export const GROUP_ORDER: MaterialGroup[] = [
  "ingredient",
  "packaging",
  "other",
];

export const GROUP_LABEL: Record<MaterialGroup, string> = {
  ingredient: "Ingredients & raw materials",
  packaging: "Packaging",
  other: "Other components",
};

// ---------------------------------------------------------------------------
// Quantity formatting — wraps formatQty for the string-typed API values.
// ---------------------------------------------------------------------------

export function fmtQtyStr(value: string, uom: string | null): string {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return value;
  return formatQty(n, uom ?? "UNIT");
}
