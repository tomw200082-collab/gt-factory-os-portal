"use client";

// ---------------------------------------------------------------------------
// ForecastRow — HERO monthly card for the Forecast list.
//
// 2026-05-05 hero redesign — Tom directive: "Less text. The card should be
// much bigger and more meaningful on screen. Think about the fact that this
// is a monthly plan — therefore it should be more significant in terms of
// user experience."
//
// Design:
//   - Massively reduced text. Description killed. Single tight metadata line.
//   - Hero month label (32-40px) extracted from horizon_start_at.
//   - Calmer subhead: "01 May → 30 Sep · 5 months".
//   - ~180-220px tall card; 24-28px padding; layered shadow + border.
//   - Decorative horizon strip — one block per month covered, first month
//     accent-tinted as the "horizon starts here" mark.
//   - Status / cadence / site chips relegated to a tight top-left meta row.
//   - Strong "Open forecast →" CTA zone on the right.
//   - 3px left status stripe preserved; balanced by an "as-of" micro pill.
// ---------------------------------------------------------------------------

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  Archive,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Eye,
  FileText,
  Minus,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  alignMonthlyLiters,
  barWidthFraction,
  formatLiters,
  formatMomPct,
  shortMonthLabel,
  summarizeHorizon,
  type ProductionLitersResponseApi,
} from "../_lib/production-liters";

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
  // 2026-05-05 list-card polish — per-month production-liters summary fetched
  // by the parent page. `null` = not yet loaded (or fetch failed); the row
  // gracefully degrades to month-name-only blocks in that case.
  productionLiters?: ProductionLitersResponseApi | null;
}

function fmtFullDateTime(iso: string | null): string {
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

function fmtDateShort(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
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

// — Build month/year display from horizon_start_at. For monthly cadence the
//   anchor month dominates as the hero label.
function heroLabelFor(
  iso: string,
  cadence: ForecastCadence,
): { primary: string; primaryShort: string; year: string } {
  try {
    const d = new Date(iso);
    const year = String(d.getFullYear());
    if (cadence === "monthly") {
      const monthLong = d.toLocaleDateString(undefined, { month: "long" });
      const monthShort = d.toLocaleDateString(undefined, { month: "short" });
      return { primary: monthLong, primaryShort: monthShort, year };
    }
    // For weekly/daily — anchor week label.
    const dayShort = d.toLocaleDateString(undefined, {
      month: "short",
      day: "2-digit",
    });
    return { primary: `Week of ${dayShort}`, primaryShort: dayShort, year };
  } catch {
    return { primary: "—", primaryShort: "—", year: "" };
  }
}

// — Generate the month-block list for the horizon strip. Cadence='monthly':
//   horizon_weeks semantically = months covered. We emit up to 8 blocks and
//   show a "+N more" indicator if the horizon overflows.
function horizonBlocks(
  iso: string,
  cadence: ForecastCadence,
  span: number,
): Array<{ key: string; label: string; isFirst: boolean }> {
  const blocks: Array<{ key: string; label: string; isFirst: boolean }> = [];
  if (!iso || span < 1) return blocks;
  try {
    const start = new Date(iso);
    const max = Math.min(span, cadence === "monthly" ? 8 : 6);
    for (let i = 0; i < max; i++) {
      const d = new Date(start);
      if (cadence === "monthly") {
        d.setMonth(d.getMonth() + i);
        const lbl = d
          .toLocaleDateString(undefined, { month: "short" })
          .toUpperCase();
        blocks.push({ key: `${i}`, label: lbl, isFirst: i === 0 });
      } else {
        d.setDate(d.getDate() + i * 7);
        const lbl = d
          .toLocaleDateString(undefined, { month: "short", day: "2-digit" })
          .toUpperCase();
        blocks.push({ key: `${i}`, label: lbl, isFirst: i === 0 });
      }
    }
    return blocks;
  } catch {
    return blocks;
  }
}

function horizonEndIso(
  iso: string,
  cadence: ForecastCadence,
  span: number,
): string | null {
  if (!iso || span < 1) return null;
  try {
    const d = new Date(iso);
    if (cadence === "monthly") {
      // End-of-horizon = last day of (start + span - 1) months.
      d.setMonth(d.getMonth() + span);
      d.setDate(0); // last day of the previous month
    } else {
      d.setDate(d.getDate() + span * 7 - 1);
    }
    return d.toISOString();
  } catch {
    return null;
  }
}

export function ForecastRow({
  v,
  active,
  muted,
  productionLiters,
}: ForecastRowProps) {
  const tone = statusToTone(v.status);
  const span = v.horizon_weeks;
  const hero = heroLabelFor(v.horizon_start_at, v.cadence);
  const blocks = horizonBlocks(v.horizon_start_at, v.cadence, span);
  const overflow = span > blocks.length ? span - blocks.length : 0;
  const endIso = horizonEndIso(v.horizon_start_at, v.cadence, span);

  // 2026-05-05 list-card polish — align the API payload to the visible
  // horizon blocks (so block i lines up with alignedLiters[i]) and derive
  // the horizon-summary cluster shown next to the hero month label.
  const alignedLiters = productionLiters
    ? alignMonthlyLiters(
        productionLiters.monthly_liters,
        v.horizon_start_at,
        v.cadence,
        blocks.length,
      )
    : [];
  const summary = summarizeHorizon(alignedLiters);
  const peakLiters = summary.peakMonth?.liters ?? 0;
  const hasLitersData =
    productionLiters !== null && productionLiters !== undefined;

  const horizonSpanText =
    v.cadence === "monthly"
      ? `${span} month${span === 1 ? "" : "s"}`
      : `${span} week${span === 1 ? "" : "s"}`;

  const subhead = `${fmtDateShort(v.horizon_start_at)} → ${fmtDateShort(endIso)} · ${horizonSpanText}`;

  const relTime = v.published_at ?? v.updated_at ?? v.created_at;
  const author = v.published_by_snapshot ?? v.created_by_snapshot;
  const verb = v.published_at ? "published" : "updated";
  const detailHref = `/planning/forecast/${encodeURIComponent(v.version_id)}`;

  return (
    <li
      className={cn(
        "fc-list-row-hero group",
        muted && "opacity-80",
        active && "fc-list-row-hero-active",
      )}
      data-tone={tone}
      data-testid="forecast-version-row"
      data-version-id={v.version_id}
      data-status={v.status}
    >
      <Link
        href={detailHref}
        className="fc-list-row-hero-content min-w-0"
        data-testid="forecast-version-link"
        aria-label={`Open forecast ${hero.primary} ${hero.year} — ${horizonSpanText}, ${statusLabel(v.status)}`}
      >
        {/* — Top meta row: status / cadence / site (small caps, secondary). — */}
        <div className="fc-list-row-hero-chips">
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
            {cadenceLabel(v.cadence)}
          </span>
          <span className="fc-list-chip" data-tone="brand">
            {v.site_id}
          </span>
        </div>

        {/* — Hero month label — DOMINATES the card.
            Beside it: a horizon-summary microcard cluster (total / avg /
            peak) when production-liters data has loaded. The big month
            label remains the visual anchor; the cluster sits to its right
            as calmly secondary. — */}
        <div className="fc-list-row-hero-title-wrap">
          <div className="fc-list-row-hero-title-line">
            <h3
              className="fc-list-row-hero-title"
              data-testid="forecast-version-title"
              dir="auto"
            >
              <span className="fc-list-row-hero-month">{hero.primary}</span>
              {hero.year ? (
                <span className="fc-list-row-hero-year tabular-nums">
                  {hero.year}
                </span>
              ) : null}
            </h3>
            {hasLitersData && summary.monthCount > 0 ? (
              <div
                className="fc-list-row-hero-summary"
                data-testid="forecast-row-horizon-summary"
                aria-label="Horizon production summary"
              >
                <div className="fc-list-row-hero-summary-card" data-tone="total">
                  <span className="fc-list-row-hero-summary-label">
                    Total horizon
                  </span>
                  <span
                    className="fc-list-row-hero-summary-value tabular-nums"
                    title={`${summary.totalLiters.toLocaleString("en-US")} L total over ${summary.monthCount} month${summary.monthCount === 1 ? "" : "s"}`}
                  >
                    {formatLiters(summary.totalLiters)}
                  </span>
                  <span className="fc-list-row-hero-summary-sub tabular-nums">
                    over {summary.monthCount} mo
                  </span>
                </div>
                <div className="fc-list-row-hero-summary-card" data-tone="avg">
                  <span className="fc-list-row-hero-summary-label">
                    Avg / month
                  </span>
                  <span className="fc-list-row-hero-summary-value tabular-nums">
                    {formatLiters(summary.avgLitersPerMonth)}
                  </span>
                  <span className="fc-list-row-hero-summary-sub tabular-nums">
                    {summary.horizonGrowth === null
                      ? "—"
                      : (() => {
                          const g = formatMomPct(summary.horizonGrowth);
                          return `${g.label} across horizon`;
                        })()}
                  </span>
                </div>
                <div className="fc-list-row-hero-summary-card" data-tone="peak">
                  <span className="fc-list-row-hero-summary-label">Peak</span>
                  <span className="fc-list-row-hero-summary-value tabular-nums">
                    {summary.peakMonth
                      ? formatLiters(summary.peakMonth.liters)
                      : "—"}
                  </span>
                  <span className="fc-list-row-hero-summary-sub tabular-nums">
                    {summary.peakMonth
                      ? shortMonthLabel(summary.peakMonth.monthStart)
                      : "—"}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          <div className="fc-list-row-hero-subhead tabular-nums">
            {subhead}
          </div>
        </div>

        {/* — Horizon strip — month-name + production-liters total + MoM
            growth chip per block. The thin tier bar at the bottom is
            data-scaled by liters/peakLiters so smaller months visibly read
            as smaller. Falls back to the original decorative-only mode when
            no productionLiters payload has loaded yet. — */}
        {blocks.length > 0 ? (
          <div
            className="fc-list-row-hero-strip"
            data-cadence={v.cadence}
            data-with-data={hasLitersData ? "true" : "false"}
          >
            {blocks.map((b, i) => {
              const aligned = alignedLiters[i];
              const liters = aligned?.liters ?? 0;
              const mom = aligned?.mom ?? null;
              const momView = formatMomPct(mom);
              const barFrac = hasLitersData
                ? barWidthFraction(liters, peakLiters)
                : 0;
              return (
                <div
                  key={b.key}
                  className="fc-list-row-hero-strip-block"
                  data-first={b.isFirst}
                  data-tone={tone}
                  data-has-data={hasLitersData ? "true" : "false"}
                >
                  <span className="fc-list-row-hero-strip-label">
                    {b.label}
                  </span>
                  {hasLitersData ? (
                    <>
                      <span
                        className="fc-list-row-hero-strip-liters tabular-nums"
                        title={`${liters.toLocaleString("en-US")} L production`}
                      >
                        {formatLiters(liters)}
                      </span>
                      <span
                        className="fc-list-row-hero-strip-mom"
                        data-tone={momView.tone}
                        aria-label={`Month-over-month change ${momView.label}`}
                      >
                        {momView.tone === "up" ? (
                          <ArrowUpRight
                            className="h-2.5 w-2.5"
                            strokeWidth={2.5}
                            aria-hidden
                          />
                        ) : momView.tone === "down" ? (
                          <ArrowDownRight
                            className="h-2.5 w-2.5"
                            strokeWidth={2.5}
                            aria-hidden
                          />
                        ) : momView.tone === "flat" ? (
                          <Minus
                            className="h-2.5 w-2.5"
                            strokeWidth={2.5}
                            aria-hidden
                          />
                        ) : null}
                        <span className="tabular-nums">{momView.label}</span>
                      </span>
                    </>
                  ) : null}
                  <span
                    className="fc-list-row-hero-strip-bar"
                    style={
                      hasLitersData
                        ? ({
                            ["--bar-frac" as string]: String(barFrac),
                          } as CSSProperties)
                        : undefined
                    }
                  />
                </div>
              );
            })}
            {overflow > 0 ? (
              <div
                className="fc-list-row-hero-strip-block fc-list-row-hero-strip-overflow"
                data-tone={tone}
              >
                <span className="fc-list-row-hero-strip-label">
                  +{overflow}
                </span>
                <span className="fc-list-row-hero-strip-bar" />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* — Single tight metadata line — author + relative time. — */}
        <div className="fc-list-row-hero-foot">
          <span className="fc-list-row-hero-foot-field">
            <span className="fc-list-row-hero-foot-label">{verb} by</span>
            <strong>{author}</strong>
          </span>
          <span className="fc-list-row-hero-foot-sep" aria-hidden />
          <span
            className="fc-list-row-hero-foot-field tabular-nums"
            title={fmtFullDateTime(relTime)}
            data-testid="forecast-version-rel-time"
          >
            {fmtAgo(relTime)}
          </span>
          {v.notes ? (
            <>
              <span className="fc-list-row-hero-foot-sep" aria-hidden />
              <span
                className="fc-list-row-hero-foot-note"
                dir="auto"
                title={v.notes}
              >
                {v.notes}
              </span>
            </>
          ) : null}
        </div>
      </Link>

      {/* — Right rail: hover-revealed actions + primary "Open" CTA zone. — */}
      <div className="fc-list-row-hero-rail">
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
        </div>

        <Link
          href={detailHref}
          className="fc-list-row-hero-cta"
          aria-label={`Open ${hero.primary} ${hero.year} forecast`}
          tabIndex={-1}
        >
          <span className="fc-list-row-hero-cta-label">Open forecast</span>
          <ArrowRight
            className="fc-list-row-hero-cta-arrow h-4 w-4"
            strokeWidth={2.25}
            aria-hidden
          />
        </Link>
      </div>
    </li>
  );
}
