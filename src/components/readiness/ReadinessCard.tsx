"use client";

// ---------------------------------------------------------------------------
// <ReadinessCard> — AMMC v1 Slice 3 (crystalline-drifting-dusk §C.1 #4 + §E.6).
//
// Consumes v_*_readiness API response shape and renders:
//   - tone pill: green (ready), yellow (partial — has some blockers but is_ready=true),
//     red (not ready)
//   - blockers list with "Fix now" inline actions (deep-links via href or callback)
//
// Accepts the readiness shape loosely so callers can pass item / component /
// bom_version / supplier_item readiness without coercion; blocker entries are
// rendered by whatever fields the server returns.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";

export interface ReadinessBlocker {
  /** Server-side blocker code (e.g. "no_active_bom", "missing_price"). */
  code: string;
  /** Human-readable label. */
  label: string;
  /** Optional detail shown under the label. */
  detail?: string;
  /** Optional Fix-now action. */
  fixAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export interface ReadinessPayload {
  is_ready: boolean;
  readiness_summary?: string;
  blockers: ReadinessBlocker[];
}

export type ReadinessEntityKind =
  | "item"
  | "component"
  | "bom_version"
  | "supplier_item";

export interface ReadinessCardProps {
  readiness: ReadinessPayload;
  /** Entity kind, used for the contextual summary text. */
  entity: ReadinessEntityKind;
  /** Optional extra content beneath the blockers list. */
  footer?: ReactNode;
}

function entityLabel(kind: ReadinessEntityKind): string {
  switch (kind) {
    case "item":
      return "Item";
    case "component":
      return "Component";
    case "bom_version":
      return "BOM version";
    case "supplier_item":
      return "Supplier-item";
  }
}

export function ReadinessCard({
  readiness,
  entity,
  footer,
}: ReadinessCardProps): JSX.Element {
  const { is_ready, readiness_summary, blockers } = readiness;

  // Tone selection:
  //   - is_ready=true + no blockers → green
  //   - is_ready=true + any blockers → yellow (partially ready — advisory only)
  //   - is_ready=false → red
  const tone: "green" | "yellow" | "red" = !is_ready
    ? "red"
    : blockers.length > 0
      ? "yellow"
      : "green";

  const toneProps: Record<
    typeof tone,
    {
      badge: "success" | "warning" | "danger";
      badgeLabel: string;
      icon: ReactNode;
      sectionTone: "success" | "warning" | "danger";
    }
  > = {
    green: {
      badge: "success",
      badgeLabel: "Ready for operations",
      icon: <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={2} />,
      sectionTone: "success",
    },
    yellow: {
      badge: "warning",
      badgeLabel: "Partially ready",
      icon: <AlertTriangle className="h-4 w-4 text-warning" strokeWidth={2} />,
      sectionTone: "warning",
    },
    red: {
      badge: "danger",
      badgeLabel: "Not ready",
      icon: <XCircle className="h-4 w-4 text-danger" strokeWidth={2} />,
      sectionTone: "danger",
    },
  };

  const t = toneProps[tone];

  return (
    <div data-testid={`readiness-card-${tone}`}>
    <SectionCard
      eyebrow={`${entityLabel(entity)} readiness`}
      tone={
        tone === "green" ? "success" : tone === "yellow" ? "warning" : "danger"
      }
      title={
        <span className="flex items-center gap-2">
          {t.icon}
          <span>{t.badgeLabel}</span>
          <Badge tone={t.badge} dotted>
            {tone.toUpperCase()}
          </Badge>
        </span>
      }
      description={readiness_summary ?? defaultSummary(tone, entity)}
    >
      {blockers.length === 0 ? (
        <p
          className="text-sm text-fg-muted"
          data-testid="readiness-card-no-blockers"
        >
          No blockers. This {entityLabel(entity).toLowerCase()} is ready.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="readiness-card-blockers">
          {blockers.map((b, idx) => (
            <li
              key={`${b.code}-${idx}`}
              className={cn(
                "flex flex-wrap items-start justify-between gap-3 rounded-md border border-border/70 bg-bg-subtle/40 p-3",
              )}
              data-testid={`readiness-blocker-${b.code}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-fg-strong">
                  {b.label}
                </div>
                {b.detail ? (
                  <div className="mt-0.5 text-xs text-fg-muted">{b.detail}</div>
                ) : null}
                <div className="mt-1 font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                  {b.code}
                </div>
              </div>
              {b.fixAction ? (
                b.fixAction.href ? (
                  <a
                    href={b.fixAction.href}
                    className="btn-primary btn-sm shrink-0"
                    data-testid={`readiness-fix-${b.code}`}
                  >
                    {b.fixAction.label}
                  </a>
                ) : (
                  <button
                    type="button"
                    className="btn-primary btn-sm shrink-0"
                    onClick={b.fixAction.onClick}
                    data-testid={`readiness-fix-${b.code}`}
                  >
                    {b.fixAction.label}
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {footer}
    </SectionCard>
    </div>
  );
}

function defaultSummary(
  tone: "green" | "yellow" | "red",
  entity: ReadinessEntityKind,
): string {
  const label = entityLabel(entity).toLowerCase();
  if (tone === "green") return `This ${label} is ready for operational use.`;
  if (tone === "yellow")
    return `This ${label} is usable but has advisory issues to address.`;
  return `This ${label} is not yet ready. Resolve the blockers below to activate it.`;
}
