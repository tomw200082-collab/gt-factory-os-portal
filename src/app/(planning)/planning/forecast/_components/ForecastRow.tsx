"use client";

// ---------------------------------------------------------------------------
// ForecastRow — newspaper-grade row card for the Forecast list.
//
// Layout: 3-column grid (status stripe / main content / right meta column).
// Hover surfaces a layered accent ring + reveals the action icon column.
// All numeric metadata uses tabular-nums; published-at gets a micro-pill
// with a full ISO date tooltip.
// ---------------------------------------------------------------------------

import Link from "next/link";
import {
  Archive,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  Pencil,
  User2,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";

type ForecastStatus = "draft" | "published" | "superseded" | "discarded";
type ForecastCadence = "monthly" | "weekly" | "daily";

export interface ForecastRowVersion {
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

interface ForecastRowProps {
  v: ForecastRowVersion;
  active?: boolean;
  muted?: boolean;
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

function fmtHorizonStart(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "—";
  try {
    const then = new Date(iso).getTime();
    const min = Math.floor((Date.now() - then) / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
  } catch {
    return "—";
  }
}

function statusToTone(status: ForecastStatus): "published" | "draft" | "archived" {
  if (status === "published") return "published";
  if (status === "draft") return "draft";
  return "archived";
}

function statusLabel(status: ForecastStatus): string {
  if (status === "published") return "Published";
  if (status === "draft") return "Draft";
  if (status === "superseded") return "Superseded";
  return "Discarded";
}

function cadenceLabel(c: ForecastCadence): string {
  if (c === "monthly") return "Monthly";
  if (c === "weekly") return "Weekly";
  return "Daily";
}

export function ForecastRow({ v, active, muted }: ForecastRowProps) {
  const tone = statusToTone(v.status);
  const horizonText =
    v.cadence === "monthly"
      ? `${v.horizon_weeks} month${v.horizon_weeks === 1 ? "" : "s"}`
      : `${v.horizon_weeks} week${v.horizon_weeks === 1 ? "" : "s"}`;

  const relTime = v.published_at ?? v.updated_at ?? v.created_at;
  const detailHref = `/planning/forecast/${encodeURIComponent(v.version_id)}`;
  const showArchiveAction =
    v.status === "draft" || v.status === "superseded";

  return (
    <li
      className={cn(
        "fc-list-row group",
        muted && "opacity-80",
        active && "fc-list-row-active-emphasis",
      )}
      data-tone={tone}
      data-testid="forecast-version-row"
      data-version-id={v.version_id}
      data-status={v.status}
    >
      <Link
        href={detailHref}
        className="fc-list-row-content min-w-0"
        data-testid="forecast-version-link"
        aria-label={`Open forecast — horizon starts ${fmtHorizonStart(
          v.horizon_start_at,
        )}, ${horizonText}, ${statusLabel(v.status)}`}
      >
        {/* — Pill row: status + cadence + brand — */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="fc-list-chip" data-tone={tone}>
            {tone === "published" ? (
              <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
            ) : tone === "draft" ? (
              <FileText className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
            ) : (
              <Archive className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
            )}
            {statusLabel(v.status)}
          </span>
          <span className="fc-list-chip" data-tone="cadence">
            <CalendarDays
              className="h-2.5 w-2.5"
              strokeWidth={2.5}
              aria-hidden
            />
            {cadenceLabel(v.cadence)}
          </span>
          <span className="fc-list-chip" data-tone="brand">
            {v.site_id}
          </span>
        </div>

        {/* — Title — */}
        <div
          className="fc-list-row-title"
          data-testid="forecast-version-title"
          dir="auto"
        >
          Horizon starts{" "}
          <span className="tabular-nums">
            {fmtHorizonStart(v.horizon_start_at)}
          </span>{" "}
          · <span className="tabular-nums">{horizonText}</span>
        </div>

        {/* — Meta row: created-by / published-at / published-by — */}
        <div className="fc-list-row-meta">
          <span className="fc-list-row-meta-field">
            <User2 className="h-3 w-3" strokeWidth={2} aria-hidden />
            <span>by</span>
            <strong>{v.created_by_snapshot}</strong>
          </span>
          <span className="fc-list-row-meta-field">
            <CalendarDays className="h-3 w-3" strokeWidth={2} aria-hidden />
            <span
              className="tabular-nums"
              title={fmtDate(relTime)}
              data-testid="forecast-version-rel-time"
            >
              {v.published_at ? "published " : "updated "}
              {fmtAgo(relTime)}
            </span>
          </span>
          {v.published_at && v.published_by_snapshot ? (
            <span className="fc-list-row-meta-field">
              <UserCheck className="h-3 w-3" strokeWidth={2} aria-hidden />
              <span>by</span>
              <strong>{v.published_by_snapshot}</strong>
            </span>
          ) : null}
        </div>

        {/* — Description — */}
        {v.notes ? (
          <div className="fc-list-row-desc" dir="auto">
            {v.notes}
          </div>
        ) : null}
      </Link>

      {/* — Right meta column: published pill + actions + open arrow — */}
      <div className="fc-list-row-meta-col">
        <span
          className="fc-list-row-published"
          title={v.published_at ? fmtDate(v.published_at) : fmtDate(relTime)}
        >
          <ChevronRight
            className="h-3 w-3 text-fg-faint"
            strokeWidth={2}
            aria-hidden
          />
          <span>{v.published_at ? "published" : "updated"}</span>
          <strong className="text-fg">{fmtAgo(relTime)}</strong>
        </span>

        <div
          className="fc-list-row-actions"
          data-testid="forecast-row-actions"
          onClick={(e) => e.stopPropagation()}
        >
          <Link
            href={detailHref}
            className="fc-list-row-action-btn"
            title="Open forecast"
            aria-label="Open forecast"
            data-testid="forecast-row-action-open"
          >
            <Eye className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
          <Link
            href={detailHref}
            className="fc-list-row-action-btn"
            title="Edit forecast"
            aria-label="Edit forecast"
            data-testid="forecast-row-action-edit"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
          <button
            type="button"
            disabled
            title="Duplicate (coming soon)"
            aria-label="Duplicate forecast"
            className="fc-list-row-action-btn"
            data-testid="forecast-row-action-duplicate"
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          {showArchiveAction ? (
            <button
              type="button"
              disabled
              title="Archive (coming soon)"
              aria-label="Archive forecast"
              className="fc-list-row-action-btn"
              data-testid="forecast-row-action-archive"
            >
              <Archive className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </div>

        <span className="fc-list-row-open" aria-hidden>
          Open
          <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
        </span>
      </div>
    </li>
  );
}
