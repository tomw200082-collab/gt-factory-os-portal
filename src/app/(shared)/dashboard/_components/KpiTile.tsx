// ---------------------------------------------------------------------------
// KpiTile — premium command-center KPI tile. Replaces the previous inline
// ValueCard / ExceptionsCard treatment. Uses the .kpi-tile CSS layer from
// globals.css for consistent tone-driven backgrounds, glowing icon halos,
// and dramatic primary-number typography.
//
// Two variants share the same shell:
//   - <KpiTile> for single-value metrics (RM, FG, PO, etc.)
//   - <KpiTileBreakdown> for tiles with a legend (Exceptions, Stock health)
//
// Linked tiles get the hover-lift + ring-glow treatment automatically.
// Theme-aware, mobile-safe, prefers-reduced-motion safe.
// ---------------------------------------------------------------------------
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type KpiTone = "accent" | "success" | "info" | "warning" | "danger";

export interface KpiTileProps {
  label: string;
  value: string | null;
  sub: ReactNode;
  tone: KpiTone;
  icon?: ReactNode;
  href?: string;
  /** When set, renders this small chip to the right of the label
   *  (e.g. "1,250 items"). Use sparingly — only when extra context
   *  is genuinely useful at a glance. */
  rightLabel?: string;
  /** "Open inventory" / "Open inbox" / "Open run" — text in the bottom-left
   *  CTA strip on linked tiles. Defaults to "Open". */
  ctaLabel?: string;
  loading?: boolean;
  /** Optional skeleton component to render in place of value/sub. */
  skeleton?: ReactNode;
}

export function KpiTile({
  label,
  value,
  sub,
  tone,
  icon,
  href,
  rightLabel,
  ctaLabel = "Open",
  loading,
  skeleton,
}: KpiTileProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="kpi-tile-label">{label}</div>
          {rightLabel ? (
            <div className="mt-0.5 text-3xs font-medium tabular-nums text-fg-faint">
              {rightLabel}
            </div>
          ) : null}
        </div>
        {icon ? (
          <div className="kpi-tile-icon" aria-hidden>
            {icon}
          </div>
        ) : null}
      </div>
      {loading ? (
        skeleton ?? (
          <div
            className="relative overflow-hidden rounded bg-bg-muted"
            style={{ height: 48, width: "70%" }}
            aria-hidden
          >
            <div
              className="absolute inset-y-0 w-3/5 bg-gradient-to-r from-transparent via-bg-raised/80 to-transparent motion-reduce:hidden"
              style={{ animation: "gt-shimmer 1.5s ease-in-out infinite" }}
            />
          </div>
        )
      ) : (
        <div className="kpi-tile-value">{value ?? "—"}</div>
      )}
      <div className="kpi-tile-sub">{sub}</div>
      {href ? (
        <div className="kpi-tile-cta">
          <span>{ctaLabel}</span>
          <ArrowRight className="kpi-tile-cta-arrow" strokeWidth={2} aria-hidden />
        </div>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        data-tone={tone}
        className={cn(
          "kpi-tile is-link group focus-visible:outline-none focus-visible:ring-2",
          tone === "danger"
            ? "focus-visible:ring-danger/40"
            : "focus-visible:ring-accent/40",
        )}
      >
        {body}
      </Link>
    );
  }
  return (
    <div data-tone={tone} className="kpi-tile">
      {body}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KpiTileBreakdown — same shell, but `legend` slot replaces the sub line and
// renders a stack of legend rows. Used by ExceptionsCard which doesn't have
// a single "sub" string but a breakdown.
// ---------------------------------------------------------------------------
export interface KpiTileBreakdownProps {
  label: string;
  value: string | null;
  legend: ReactNode;
  tone: KpiTone;
  icon?: ReactNode;
  href?: string;
  ctaLabel?: string;
  loading?: boolean;
}

export function KpiTileBreakdown({
  label,
  value,
  legend,
  tone,
  icon,
  href,
  ctaLabel = "Open",
  loading,
}: KpiTileBreakdownProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="kpi-tile-label">{label}</div>
        {icon ? (
          <div className="kpi-tile-icon" aria-hidden>
            {icon}
          </div>
        ) : null}
      </div>
      {loading ? (
        <div
          className="relative overflow-hidden rounded bg-bg-muted"
          style={{ height: 48, width: "55%" }}
          aria-hidden
        >
          <div
            className="absolute inset-y-0 w-3/5 bg-gradient-to-r from-transparent via-bg-raised/80 to-transparent motion-reduce:hidden"
            style={{ animation: "gt-shimmer 1.5s ease-in-out infinite" }}
          />
        </div>
      ) : (
        <div className={cn("kpi-tile-value", tone === "danger" ? "text-danger" : "")}>
          {value ?? "—"}
        </div>
      )}
      {!loading && <div className="flex flex-col gap-1.5">{legend}</div>}
      {href ? (
        <div className="kpi-tile-cta">
          <span>{ctaLabel}</span>
          <ArrowRight className="kpi-tile-cta-arrow" strokeWidth={2} aria-hidden />
        </div>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        data-tone={tone}
        className={cn(
          "kpi-tile is-link group focus-visible:outline-none focus-visible:ring-2",
          tone === "danger"
            ? "focus-visible:ring-danger/40"
            : "focus-visible:ring-accent/40",
        )}
      >
        {body}
      </Link>
    );
  }
  return (
    <div data-tone={tone} className="kpi-tile">
      {body}
    </div>
  );
}
