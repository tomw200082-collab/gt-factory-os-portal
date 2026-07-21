"use client";

// ---------------------------------------------------------------------------
// IntegrityStrip — Tranche 132 (procurement-triage-decision-grade), extended
// Tranche 133.
//
// One compact line above the action list answering "how much should I trust
// the numbers underneath": stock-truth drift, physical-count freshness over
// the buy list, forecast age + horizon coverage, how many firmed production
// weeks fed component demand, and the engine's structural warnings — each as
// a small chip with the full story in a tooltip. Replaces the previous stack
// of full-width warning banners (the details now also surface INLINE on the
// affected rows via ActionList).
//
// Renders progressively: pre-0284 sessions have no input_integrity, so the
// strip quietly shows only what exists (drift, warnings, session age) and
// never blocks on missing data.
//
// Tranche 133 additions:
//   - Every warning chip that resolves a fix target (PO date, missing
//     supplier) is now a real Link, not just a tooltip — click-to-fix.
//   - onRefresh: when the input itself looks untrustworthy (stock drift,
//     stale/never-counted lines, or a stale_stock_input warning), a
//     "רענון המלצות" action reruns the session with fresh data — closes the
//     loop after a planner goes and physically counts something. Reuses the
//     page's existing supersede-confirm flow; this is not a new mutation.
//   - Mobile: a collapsed one-line summary (status + issue count) that
//     expands to the full chip row on tap, so the strip doesn't eat a third
//     of the screen on a phone before the planner sees any actual orders.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronDown, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { useCapability } from "@/lib/auth/role-gate";
import { cn } from "@/lib/cn";
import type { PurchaseSession } from "../../purchase-session/_lib/types";
import {
  countsTone,
  driftTone,
  forecastTone,
  parseFirmedWindow,
  parseInputIntegrity,
  type SignalTone,
} from "../_lib/integrity";
import { warningChip } from "../_lib/session-warnings";
import { fmtDateHe } from "../_lib/decision";

const TONE_TO_BADGE: Record<SignalTone, BadgeTone> = {
  ok: "success",
  warn: "warning",
  bad: "danger",
};

const TONE_TO_TEXT: Record<SignalTone, string> = {
  ok: "text-success-fg",
  warn: "text-warning-fg",
  bad: "text-danger-fg",
};

/** "14:32" from the session's created_at timestamp (local time). */
function fmtTimeHe(ts: string | null): string | null {
  if (!ts) return null;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function IntegrityStrip({
  session,
  onRefresh,
  refreshPending,
  refreshConfirming,
}: {
  session: PurchaseSession;
  /** Reruns the session with fresh stock/count/forecast data (133) —
   *  typically the page's handleStart, which already routes through the
   *  supersede-confirm flow when a session is open. Omit to hide the action
   *  entirely (e.g. read-only contexts). */
  onRefresh?: () => void;
  refreshPending?: boolean;
  /** True while the caller's supersede-confirm zone is armed and awaiting
   *  the operator's decision. ux-release-gate 2026-07-21 INT-P0-1: without
   *  this the first tap armed the confirm with zero feedback here and a
   *  second tap on the still-enabled button fell through the caller's
   *  guard — superseding the session without the confirm ever being seen. */
  refreshConfirming?: boolean;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  // FLOW-101 (ux-release-gate 2026-07-21): components_without_supplier fix
  // links target /admin/masters/** which sits behind admin:execute — for any
  // other role the link is a dead-end "Access restricted" wall, so degrade
  // those chips to tooltip-only at render (the pure warningChip util stays
  // role-agnostic).
  const canAdminFix = useCapability("admin:execute");

  const integrity = parseInputIntegrity(session.input_integrity ?? null);
  const firmed = parseFirmedWindow(session.firmed_window ?? null);

  const drift = session.rebuild_verifier_drift;
  const dTone = driftTone(drift);

  const counts = integrity?.counts ?? null;
  const cTone = countsTone(counts);

  const forecast = integrity?.forecast ?? null;
  const fTone = forecastTone(forecast);

  const createdTime = fmtTimeHe(session.created_at);

  const structuralWarnings = session.warnings.filter(
    (w) => w.code !== "no_orders_needed",
  );

  // --- mobile collapsed summary ---------------------------------------
  const issueCount =
    (dTone !== "ok" ? 1 : 0) +
    (counts && cTone && cTone !== "ok" ? 1 : 0) +
    (forecast && fTone && fTone !== "ok" ? 1 : 0) +
    structuralWarnings.length;
  const overallTone: SignalTone =
    dTone === "bad" ? "bad" : issueCount > 0 ? "warn" : "ok";

  // --- refresh-recommendations action -----------------------------------
  // Shown only when the input itself looks untrustworthy — never a
  // standing/always-on button (no noise on a clean session).
  const needsRefresh =
    dTone !== "ok" ||
    (counts != null && cTone != null && cTone !== "ok") ||
    session.warnings.some((w) => w.code === "stale_stock_input");
  const showRefresh = Boolean(onRefresh) && needsRefresh;

  return (
    <Tooltip.Provider>
      <div className="space-y-1.5" data-testid="procurement-integrity-strip">
        {/* Mobile-only collapsed summary — the full chip row below is
            always in the DOM (screen readers / textContent still see it);
            this bar just controls what's visually shown under sm. Desktop
            (sm+) always shows the full row and this bar stays hidden. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-bg-subtle/20 px-3 py-2 sm:hidden"
          aria-expanded={expanded}
          aria-controls="procurement-integrity-strip-detail"
          data-testid="procurement-integrity-strip-toggle"
        >
          <span className="inline-flex items-center gap-1 text-3xs font-medium text-fg-faint">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            אמינות הקלט
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-3xs font-semibold",
              TONE_TO_TEXT[overallTone],
            )}
          >
            {issueCount > 0 ? `${issueCount} לבדיקה` : "תקין"}
            {/* INT-105: the refresh action lives inside the (hidden-until-
                expanded) detail row — hint its existence in the collapsed
                bar so the post-count refresh loop is discoverable on mobile. */}
            {showRefresh && (
              <span className="inline-flex items-center gap-0.5 text-accent">
                · <RefreshCw className="h-3 w-3" aria-hidden /> רענן
              </span>
            )}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
          </span>
        </button>

        <div
          id="procurement-integrity-strip-detail"
          className={cn(
            "flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-border/60 bg-bg-subtle/20 px-3 py-2",
            expanded ? "flex" : "hidden",
            "sm:flex",
          )}
        >
          <span className="hidden items-center gap-1 text-3xs font-medium text-fg-faint sm:inline-flex">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            אמינות הקלט
          </span>

          {/* Stock truth — ledger/projection parity at run time. */}
          <Badge
            tone={TONE_TO_BADGE[dTone]}
            size="xs"
            dot
            tooltip={
              dTone === "ok"
                ? "המלאי המחושב אומת מול יומן התנועות בזמן הריצה (סטייה 0)."
                : `סטיית אימות מלאי: ${drift ?? "לא ידוע"} — כמויות עלולות להיות לא מדויקות; רעננו מלאי לפני הסתמכות.`
            }
          >
            {dTone === "ok" ? "מלאי מאומת" : "סטיית מלאי"}
          </Badge>

          {/* Physical-count freshness across the buy list (0284+ sessions). */}
          {counts && cTone && (
            <Badge
              tone={TONE_TO_BADGE[cTone]}
              size="xs"
              dot
              tooltip={`מתוך ${counts.targets} פריטים ברשימה: ${counts.fresh} נספרו ב-${counts.thresholdDays} הימים האחרונים, ${counts.stale} עם ספירה ישנה, ${counts.neverCounted} לא נספרו מעולם${counts.oldestAgeDays != null ? ` (הישן ביותר: לפני ${counts.oldestAgeDays} ימים)` : ""}. שורות שכדאי לספור מסומנות ברשימה.`}
            >
              ספירות: {counts.fresh}/{counts.targets} טריות
            </Badge>
          )}

          {/* Forecast age + horizon coverage (0284+ sessions). */}
          {forecast && fTone && (
            <Badge
              tone={TONE_TO_BADGE[fTone]}
              size="xs"
              dot
              tooltip={`התחזית שמזינה ביקוש לפריטי קנייה פורסמה לפני ${forecast.ageDays ?? "?"} ימים${forecast.coverageEnd ? ` ומכסה עד ${fmtDateHe(forecast.coverageEnd)}` : ""}${forecast.uncoveredDays ? ` — ${forecast.uncoveredDays} ימים מסוף אופק התכנון אינם מכוסים` : ""}.`}
            >
              תחזית: לפני {forecast.ageDays ?? "?"} ימ׳
            </Badge>
          )}

          {/* Firmed production window feeding component demand (0235+). */}
          {firmed && firmed.firmedWeeks.length > 0 && (
            <Badge
              tone="neutral"
              size="xs"
              tooltip={`ביקוש חומרי הגלם נגזר מתוכנית ייצור מאושרת בלבד: ${firmed.firmedWeeks.map((w) => fmtDateHe(w)).join(", ")} (טיוטות אינן נספרות). מעבר לשבועות אלה אין ביקוש רכיבים.`}
            >
              תוכנית מאושרת: {firmed.firmedWeeks.length} שב׳
            </Badge>
          )}

          {/* Structural engine warnings — compact chips, details in tooltip
              and inline on the affected rows. Tranche 133: a chip with a
              resolved fix href is a real Link (click straight to the PO or
              master-data record); the rest stay tooltip-only badges. */}
          {structuralWarnings.map((w, i) => {
            const chip = warningChip(w);
            // FLOW-101: an /admin/** fix target is only a real fix for a role
            // that can open it — everyone else gets the tooltip-only badge
            // with an explicit hand-off note instead of a dead-end link.
            const adminBlocked =
              chip.href != null &&
              chip.href.startsWith("/admin") &&
              !canAdminFix;
            const href = adminBlocked ? null : chip.href;
            const tooltip = adminBlocked
              ? `${chip.tooltip} התיקון דורש הרשאת מנהל — פנו למנהל להשלמת הספק.`
              : chip.tooltip;
            return href ? (
              <Link
                key={`${chip.code}-${i}`}
                href={href}
                aria-label={`${chip.label}. ${tooltip}`}
                title={tooltip}
                className="inline-flex rounded-md decoration-dotted underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                data-testid={`procurement-integrity-warning-${chip.code}`}
              >
                <Badge tone="warning" size="xs" dot>
                  {chip.label}
                </Badge>
              </Link>
            ) : (
              <Badge
                key={`${chip.code}-${i}`}
                tone="warning"
                size="xs"
                dot
                tooltip={tooltip}
              >
                {chip.label}
              </Badge>
            );
          })}

          {/* Refresh recommendations — only when the input actually looks
              untrustworthy (drift, stale/never counts, or a stale_stock_input
              warning). Closes the recount loop: count physically, tap this,
              get numbers that reflect it. Reuses the page's existing
              supersede-confirm mutation — never a silent overwrite. */}
          {showRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              // INT-P0-1: also disabled while the caller's confirm zone is
              // armed — a second tap here must never be able to land as the
              // implicit "confirm".
              disabled={refreshPending || refreshConfirming}
              className="inline-flex min-h-[2rem] items-center gap-1 rounded-md px-2 text-3xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-60"
              title="מריץ מושב רכש חדש כדי שההמלצות ישקפו מלאי, ספירות ותאריכי אספקה עדכניים. מושב פתוח עם אישורים שלא נשמרו יוחלף."
              data-testid="procurement-integrity-refresh"
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5 motion-reduce:animate-none",
                  refreshPending && "animate-spin",
                )}
                aria-hidden
              />
              {refreshPending
                ? "מריץ…"
                : refreshConfirming
                  ? "ממתין לאישור…"
                  : "רענון המלצות"}
            </button>
          )}

          {createdTime && (
            <span className="ms-auto text-3xs tabular-nums text-fg-faint">
              נוצר {createdTime}
            </span>
          )}
        </div>
      </div>
    </Tooltip.Provider>
  );
}
