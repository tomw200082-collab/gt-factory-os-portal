"use client";

// ---------------------------------------------------------------------------
// IntegrityStrip — Tranche 132 (procurement-triage-decision-grade).
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
// ---------------------------------------------------------------------------

import * as Tooltip from "@radix-ui/react-tooltip";
import { ShieldCheck } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
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
}: {
  session: PurchaseSession;
}): JSX.Element {
  const integrity = parseInputIntegrity(session.input_integrity ?? null);
  const firmed = parseFirmedWindow(session.firmed_window ?? null);

  const drift = session.rebuild_verifier_drift;
  const dTone = driftTone(drift);

  const counts = integrity?.counts ?? null;
  const cTone = countsTone(counts);

  const forecast = integrity?.forecast ?? null;
  const fTone = forecastTone(forecast);

  const createdTime = fmtTimeHe(session.created_at);

  return (
    <Tooltip.Provider>
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-border/60 bg-bg-subtle/20 px-3 py-2"
      data-testid="procurement-integrity-strip"
    >
      <span className="inline-flex items-center gap-1 text-3xs font-medium text-fg-faint">
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

      {/* Structural engine warnings — compact chips, details in tooltip and
          inline on the affected rows. */}
      {session.warnings
        .filter((w) => w.code !== "no_orders_needed")
        .map((w, i) => {
          const chip = warningChip(w);
          return (
            <Badge
              key={`${chip.code}-${i}`}
              tone="warning"
              size="xs"
              dot
              tooltip={chip.tooltip}
            >
              {chip.label}
            </Badge>
          );
        })}

      {createdTime && (
        <span className="ms-auto text-3xs tabular-nums text-fg-faint">
          נוצר {createdTime}
        </span>
      )}
    </div>
    </Tooltip.Provider>
  );
}
