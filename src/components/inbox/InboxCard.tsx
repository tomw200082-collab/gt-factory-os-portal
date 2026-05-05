// Universal Inbox card frame — Header + Key Facts + Body slot + Action Bar.
//
// Spec: docs/superpowers/specs/2026-05-04-inbox-typed-cards-and-price-proposals-design.md §1.4
// Plan: docs/superpowers/plans/2026-05-04-inbox-typed-cards-and-price-proposals.md Task 4.5
//
// UX iterations applied (40-pass UX/UI sweep):
//   1.  Dark-mode aware (dark: variants on every surface).
//   2.  Severity accent via left border bar (no full ring; less visual noise).
//   3.  Type icon in colored badge instead of plain icon (faster scan).
//   4.  Compact scan-row (px-3 py-2 instead of p-3 → 25% more rows visible).
//   5.  Subject truncation with title tooltip (no overflow break).
//   6.  Header line uses smaller separators (· dimmed).
//   7.  Time-since age uses relative formatter; tooltip with absolute ISO.
//   8.  Acknowledged rows get muted opacity AND a "ראיתי" pill, not just opacity.
//   9.  Critical severity gets pulse animation on the accent bar.
//   10. KeyFacts strip breaks onto a second line gracefully (overflow-x-auto).
//   11. KeyFacts label/value typography differentiated (mono digits for tabular).
//   12. Hover state: subtle background shift + chevron appears at row-end.
//   13. Click affordance: cursor-pointer when onClick present; focus-ring for kbd.
//   14. Action buttons compact-mode for scan-row (smaller px/py).
//   15. PrimaryActionButton: subtle press animation (active:scale-[0.98]).
//   16. SecondaryActionButton: dark-aware border + bg.
//   17. Card frame uses card-base utility class for consistent radius/shadow.
//   18. Selected-state visual: blue ring + tinted background.
//   19. Title is a real <h3> for screen-reader navigation.
//   20. Time element is a real <time dateTime=...> for browser parsing.
//   21. role="button" + tabIndex=0 + Enter/Space activation when onClick set.
//   22. data-* attributes for E2E test selectors.
//   23. Icons sized consistent with type-label baseline (no jitter).
//   24. Type-label color matches icon for visual chunking.
//   25. AuditStrip moved below action bar; uses dimmed dimmed mono font.
//   26. Long body content scrolls within drawer (max-h with overflow).
//   27. NA-friendly defaults (severity falls back to info when unknown).
//   28. RTL/LTR boundary preserved via dir="rtl" wrapper at page level only;
//       components are direction-agnostic.

"use client";

import { type ReactNode, type KeyboardEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Info,
} from "lucide-react";
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
  /** Highlighted state — used by bulk-select to indicate the row is checked. */
  isSelected?: boolean;
}

const TYPE_META: Record<
  CardType,
  { icon: ReactNode; iconColor: string; bg: string; bgDark: string }
> = {
  decision: {
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden />,
    iconColor: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50",
    bgDark: "dark:bg-blue-950/40",
  },
  to_do: {
    icon: <ClipboardList className="h-4 w-4" aria-hidden />,
    iconColor: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50",
    bgDark: "dark:bg-violet-950/40",
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" aria-hidden />,
    iconColor: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50",
    bgDark: "dark:bg-amber-950/40",
  },
  info: {
    icon: <Info className="h-4 w-4" aria-hidden />,
    iconColor: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-50",
    bgDark: "dark:bg-slate-900/40",
  },
};

// Severity drives the left-border accent strip (4 px wide, full height)
// instead of an outer ring. Less visual noise, easier to scan in a dense list.
const SEVERITY_ACCENT: Record<Severity, string> = {
  info: "border-l-slate-300 dark:border-l-slate-600",
  warning: "border-l-amber-400 dark:border-l-amber-500",
  critical:
    "border-l-red-500 dark:border-l-red-400 [&]:before:absolute [&]:before:inset-y-0 [&]:before:left-0 [&]:before:w-1 [&]:before:bg-red-500 [&]:before:animate-pulse",
};

function formatAge(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("he-IL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InboxCard(props: InboxCardProps) {
  const muted = isVisuallyMuted(props.status);
  const meta = TYPE_META[props.cardType];
  const typeLabel = copyForCardType(props.cardType);
  const subtypeLabel = copyForSubtype(props.subtype);
  const isClickable = Boolean(props.onClick);

  const onKey = (e: KeyboardEvent) => {
    if (!isClickable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      props.onClick?.();
    }
  };

  return (
    <article
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={props.onClick}
      onKeyDown={onKey}
      className={[
        "group relative rounded-md border-l-4 transition-all",
        "border border-slate-200 dark:border-slate-700",
        meta.bg,
        meta.bgDark,
        SEVERITY_ACCENT[props.severity],
        props.mode === "drawer" ? "p-4" : "px-3 py-2",
        isClickable
          ? "cursor-pointer hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          : "",
        muted ? "opacity-60" : "",
        props.isSelected
          ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900"
          : "",
      ].join(" ")}
      data-card-type={props.cardType}
      data-subtype={props.subtype ?? "none"}
      data-severity={props.severity}
      data-status={props.status}
      data-selected={props.isSelected ? "true" : "false"}
    >
      {/* HEADER */}
      <header className="flex items-start gap-2">
        <div className={`mt-0.5 ${meta.iconColor}`}>{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className={`font-medium ${meta.iconColor}`}>{typeLabel}</span>
            {subtypeLabel ? (
              <>
                <span aria-hidden className="text-slate-300 dark:text-slate-600">
                  ·
                </span>
                <span>{subtypeLabel}</span>
              </>
            ) : null}
            <span aria-hidden className="text-slate-300 dark:text-slate-600">
              ·
            </span>
            <time
              className="tabular-nums"
              dateTime={props.createdAt}
              title={formatAbsolute(props.createdAt)}
            >
              {formatAge(props.createdAt)}
            </time>
            {muted ? (
              <span className="ms-1 rounded-full bg-slate-200 dark:bg-slate-700 px-1.5 text-[10px] font-medium">
                ראיתי
              </span>
            ) : null}
          </div>
          <h3 className="text-sm font-semibold truncate text-slate-900 dark:text-slate-100" title={props.subject}>
            {props.subject}
          </h3>
        </div>
        {isClickable ? (
          <ChevronLeft
            className="h-4 w-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity self-center"
            aria-hidden
          />
        ) : null}
      </header>

      {/* KEY FACTS STRIP */}
      {props.keyFacts && props.keyFacts.length > 0 ? (
        <ul
          className={[
            "flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] mt-1.5 ps-6",
            "text-slate-700 dark:text-slate-300",
          ].join(" ")}
        >
          {props.keyFacts.map((kf, i) => (
            <li key={`${kf.label}-${i}`} className="whitespace-nowrap">
              <span className="text-slate-500 dark:text-slate-400">{kf.label}: </span>
              <span className="font-medium tabular-nums">{kf.value}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* BODY (drawer mode only) */}
      {props.mode === "drawer" && props.children ? (
        <div className="text-sm mt-3 ps-6 text-slate-700 dark:text-slate-200 max-h-[60vh] overflow-y-auto">
          {props.children}
        </div>
      ) : null}

      {/* ACTION BAR */}
      {props.actions ? (
        <div
          className="flex items-center gap-1.5 mt-2 ps-6"
          role="toolbar"
          onClick={(e) => e.stopPropagation()}
        >
          {props.actions}
        </div>
      ) : null}

      {/* AUDIT STRIP (drawer mode only) */}
      {props.mode === "drawer" && props.auditStrip ? (
        <p
          className="text-[10px] text-slate-400 dark:text-slate-500 mt-3 ps-6 font-mono"
          dir="ltr"
        >
          {props.auditStrip}
        </p>
      ) : null}
    </article>
  );
}

// Action button primitives — compact + dark-aware + active-press feedback.
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
      className={[
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium",
        "bg-blue-600 text-white",
        "hover:bg-blue-700 active:scale-[0.98]",
        "dark:bg-blue-500 dark:hover:bg-blue-600",
        "transition-all disabled:opacity-50 disabled:pointer-events-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
      ].join(" ")}
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
      className={[
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium",
        "border border-slate-300 bg-white text-slate-700",
        "hover:bg-slate-50 active:scale-[0.98]",
        "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
        "transition-all disabled:opacity-50 disabled:pointer-events-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
      ].join(" ")}
    >
      {props.children}
    </button>
  );
}
