"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";

export interface CompletenessItem {
  label: string;
  status: "ok" | "warn" | "error" | "na";
  detail?: string;
  /**
   * Optional inline fix-it action rendered next to the completeness row.
   * Used for things like an "+ Assign primary supplier" CTA when the row is
   * in error state, so the user can act without hunting through tabs.
   */
  fixAction?: ReactNode;
  /**
   * Optional deep-link target. When set, the entire row becomes clickable
   * and routes the user to the right tab/section. The row still renders the
   * fixAction button (if any) on the right edge — both can coexist for fields
   * that benefit from a one-tap action AND a "see all" target.
   */
  href?: string;
}

export interface KpiStat {
  label: string;
  value: ReactNode;
  /** Optional contextual hint (e.g. "vs last week", "v3 active"). */
  hint?: string;
  /** Optional click target — turns the chip into a deep link. */
  href?: string;
  /** Optional intent tone for the value text. */
  tone?: "default" | "success" | "warning" | "danger" | "muted";
}

interface MasterSummaryCardProps {
  name: string;
  code: string;
  entityType: string;
  status: string;
  completeness: CompletenessItem[];
  /**
   * Prominent call-to-action rendered before the secondary actions cluster.
   * Use for one big primary action (e.g. "+ Assign primary supplier") when
   * the entity is missing a critical link.
   */
  primaryAction?: ReactNode;
  actions?: ReactNode;
  /**
   * Optional KPI strip rendered between the title block and the completeness
   * list. Provides at-a-glance facts that read as the row above. Each KPI is
   * a small label/value/hint chip; pass an array of stats or a fully custom
   * node.
   */
  kpis?: KpiStat[];
  /**
   * Optional secondary subtitle line under the name. Used for a Hebrew /
   * local-language secondary name, or a category breadcrumb.
   */
  subtitle?: ReactNode;
}

function statusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "ACTIVE") return "success";
  if (status === "PENDING") return "warning";
  return "neutral";
}

function statusLabel(status: string): string {
  if (status === "ACTIVE") return "Active";
  if (status === "PENDING") return "Pending review";
  if (status === "INACTIVE") return "Archived";
  return status;
}

function CompletenessIcon({ status }: { status: CompletenessItem["status"] }) {
  // Tiny, accessible status dot. Replaces the prior emoji-based icons so the
  // checklist looks at home in the rest of the portal.
  if (status === "ok") {
    return (
      <span
        aria-hidden
        className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-success"
      />
    );
  }
  if (status === "warn") {
    return (
      <span
        aria-hidden
        className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-warning"
      />
    );
  }
  if (status === "error") {
    return (
      <span
        aria-hidden
        className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-danger"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-fg-faint/50"
    />
  );
}

function progressFor(items: CompletenessItem[]): {
  completed: number;
  total: number;
  blockers: number;
} {
  let completed = 0;
  let total = 0;
  let blockers = 0;
  for (const it of items) {
    if (it.status === "na") continue;
    total += 1;
    if (it.status === "ok") completed += 1;
    if (it.status === "error") blockers += 1;
  }
  return { completed, total, blockers };
}

function valueToneClass(tone: KpiStat["tone"] | undefined): string {
  switch (tone) {
    case "success":
      return "text-success-fg";
    case "warning":
      return "text-warning-fg";
    case "danger":
      return "text-danger-fg";
    case "muted":
      return "text-fg-muted";
    default:
      return "text-fg-strong";
  }
}

export function MasterSummaryCard({
  name,
  code,
  entityType,
  status,
  completeness,
  primaryAction,
  actions,
  kpis,
  subtitle,
}: MasterSummaryCardProps) {
  const { completed, total, blockers } = progressFor(completeness);
  const completionPct = total === 0 ? null : Math.round((completed / total) * 100);

  return (
    <div className="rounded-lg border border-border bg-bg-card p-4 space-y-3">
      {/* --- Title block ---------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(status)} dotted>
              {statusLabel(status)}
            </Badge>
            <span className="text-xs uppercase tracking-sops text-fg-subtle">
              {entityType}
            </span>
            {completionPct !== null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-3xs uppercase tracking-sops",
                  blockers > 0
                    ? "text-danger-fg"
                    : completionPct === 100
                      ? "text-success-fg"
                      : "text-fg-muted",
                )}
                title={
                  blockers > 0
                    ? `${blockers} blocker${blockers === 1 ? "" : "s"} — item cannot be planned yet.`
                    : completionPct === 100
                      ? "Setup complete."
                      : `${completed}/${total} setup steps complete.`
                }
              >
                <span aria-hidden>•</span>
                Setup {completionPct}%
              </span>
            ) : null}
          </div>
          <h2
            className="truncate text-xl font-semibold leading-tight text-fg-strong"
            dir="auto"
          >
            {name}
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="font-mono text-xs text-fg-muted">{code}</p>
            {subtitle ? (
              <span className="text-xs text-fg-subtle">{subtitle}</span>
            ) : null}
          </div>
        </div>
        {primaryAction || actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {primaryAction}
            {actions}
          </div>
        ) : null}
      </div>

      {/* --- KPI strip ------------------------------------------------------ */}
      {kpis && kpis.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
          {kpis.map((kpi, idx) => {
            const inner = (
              <div
                className={cn(
                  "flex min-w-[8rem] flex-1 flex-col gap-0.5 rounded-md border border-border/40 bg-bg-subtle/40 px-3 py-2",
                  kpi.href &&
                    "transition-colors hover:border-accent/60 hover:bg-accent/5",
                )}
              >
                <span className="text-3xs uppercase tracking-sops text-fg-subtle">
                  {kpi.label}
                </span>
                <span
                  className={cn(
                    "text-base font-semibold leading-tight",
                    valueToneClass(kpi.tone),
                  )}
                >
                  {kpi.value}
                </span>
                {kpi.hint ? (
                  <span className="text-3xs text-fg-faint">{kpi.hint}</span>
                ) : null}
              </div>
            );
            return kpi.href ? (
              <Link
                href={kpi.href}
                key={`${kpi.label}-${idx}`}
                className="flex-1 outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md"
              >
                {inner}
              </Link>
            ) : (
              <div key={`${kpi.label}-${idx}`} className="flex-1">
                {inner}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* --- Setup checklist ----------------------------------------------- */}
      {completeness.length > 0 ? (
        <div className="space-y-1 border-t border-border/60 pt-3">
          {completeness.map((item) => {
            const rowInner = (
              <>
                <CompletenessIcon status={item.status} />
                <div className="min-w-0 flex-1">
                  <span className="text-fg-strong">{item.label}</span>
                  {item.detail ? (
                    <span className="text-fg-subtle"> — {item.detail}</span>
                  ) : null}
                </div>
                {item.href ? (
                  <ChevronRight
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
                    strokeWidth={2.5}
                  />
                ) : null}
              </>
            );
            return (
              <div
                key={item.label}
                className="flex items-start gap-2 text-sm"
              >
                {item.href ? (
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex flex-1 items-start gap-2 rounded-sm px-1 py-0.5 -mx-1",
                      "transition-colors hover:bg-bg-subtle/60",
                      "outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    )}
                  >
                    {rowInner}
                  </Link>
                ) : (
                  <div className="flex flex-1 items-start gap-2 px-1 py-0.5">
                    {rowInner}
                  </div>
                )}
                {item.fixAction ? (
                  <span className="ml-1 shrink-0">{item.fixAction}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
