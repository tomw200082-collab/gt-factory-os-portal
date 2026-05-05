// Universal Inbox card frame — Header + Key Facts + Body slot + Action Bar.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.4
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.5

"use client";

import { type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, FileWarning, Info } from "lucide-react";
import {
  copyForCardType,
  copyForSubtype,
  type CardType,
} from "@/lib/inbox-copy";
import { isVisuallyMuted } from "@/lib/inbox-status";

export type Severity = "info" | "warning" | "critical";

export interface InboxCardProps {
  cardType: CardType;
  subtype: string | null;
  severity: Severity;
  /** Subject — what the card is about (e.g., supplier name + component). */
  subject: string;
  /** ISO timestamp of when the card was emitted. */
  createdAt: string;
  /** Internal status — drives visual muting for 'acknowledged' rows. */
  status: string;
  keyFacts?: Array<{ label: string; value: string }> | null;
  /** Body slot — subtype-specific component. */
  children?: ReactNode;
  /** Footer audit strip — "proposed by <producer> · <ts>". Optional. */
  auditStrip?: string;
  /** Action bar at the bottom. Components compose ActionButton inside. */
  actions?: ReactNode;
  /** Click handler for the whole card (e.g., to open drawer). */
  onClick?: () => void;
  /** Render mode — scan-row (compact, for feed) vs drawer (full). */
  mode?: "scan" | "drawer";
}

const TYPE_ICON: Record<CardType, ReactNode> = {
  decision: <CheckCircle2 className="h-5 w-5" aria-hidden />,
  to_do: <ClipboardList className="h-5 w-5" aria-hidden />,
  warning: <AlertTriangle className="h-5 w-5" aria-hidden />,
  info: <Info className="h-5 w-5" aria-hidden />,
};

const SEVERITY_RING: Record<Severity, string> = {
  info: "ring-1 ring-slate-200",
  warning: "ring-1 ring-amber-300",
  critical: "ring-2 ring-red-400",
};

const TYPE_BG: Record<CardType, string> = {
  decision: "bg-blue-50",
  to_do: "bg-violet-50",
  warning: "bg-amber-50",
  info: "bg-slate-50",
};

function formatAge(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function InboxCard(props: InboxCardProps) {
  const muted = isVisuallyMuted(props.status);
  const typeLabel = copyForCardType(props.cardType);
  const subtypeLabel = copyForSubtype(props.subtype);

  return (
    <article
      onClick={props.onClick}
      className={[
        "rounded-lg p-3 transition-colors",
        TYPE_BG[props.cardType],
        SEVERITY_RING[props.severity],
        muted ? "opacity-60" : "",
        props.onClick ? "cursor-pointer hover:shadow-sm" : "",
      ].join(" ")}
      data-card-type={props.cardType}
      data-subtype={props.subtype ?? "none"}
      data-severity={props.severity}
      data-status={props.status}
    >
      {/* HEADER */}
      <header className="flex items-start gap-2 mb-2">
        <div className="text-slate-700 mt-0.5">{TYPE_ICON[props.cardType]}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-medium">{typeLabel}</span>
            {subtypeLabel ? (
              <>
                <span aria-hidden>·</span>
                <span>{subtypeLabel}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <time className="tabular-nums" dateTime={props.createdAt}>
              {formatAge(props.createdAt)}
            </time>
          </div>
          <h3 className="text-sm font-semibold truncate">{props.subject}</h3>
        </div>
      </header>

      {/* KEY FACTS STRIP */}
      {props.keyFacts && props.keyFacts.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700 mb-2 px-7">
          {props.keyFacts.map((kf, i) => (
            <li key={`${kf.label}-${i}`} className="whitespace-nowrap">
              <span className="text-slate-500">{kf.label}: </span>
              <span className="font-medium tabular-nums">{kf.value}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* BODY (subtype-specific; only rendered in drawer mode) */}
      {props.mode === "drawer" && props.children ? (
        <div className="text-sm text-slate-700 my-3 px-7">{props.children}</div>
      ) : null}

      {/* ACTION BAR */}
      {props.actions ? (
        <div className="flex items-center gap-2 px-7 pt-1" role="toolbar">
          {props.actions}
        </div>
      ) : null}

      {/* AUDIT STRIP (drawer mode only) */}
      {props.mode === "drawer" && props.auditStrip ? (
        <p className="text-[11px] text-slate-400 mt-3 px-7" dir="ltr">
          {props.auditStrip}
        </p>
      ) : null}
    </article>
  );
}

// Convenience action-button primitives (consumers compose these inside `actions`).
export function PrimaryActionButton(props: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
      disabled={props.disabled}
      className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

export function SecondaryActionButton(props: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
      disabled={props.disabled}
      className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}
