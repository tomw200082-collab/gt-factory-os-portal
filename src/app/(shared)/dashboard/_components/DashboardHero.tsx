// ---------------------------------------------------------------------------
// DashboardHero — premium command-bridge hero for /dashboard. Replaces the
// shared WorkflowHeader on this page only. Designed to deliver the "this is
// the command center" moment the operator should feel on first paint.
//
// Layout:
//   row 1 — eyebrow (Factory Floor · Command Center) + factory-state pill
//   row 2 — greeting title + date plate
//   row 3 — meta rail: freshness, auto-refresh, total inventory
//
// All data comes from the page; this component owns no queries.
// Theme-aware, mobile-safe, prefers-reduced-motion safe.
// ---------------------------------------------------------------------------
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DashboardHeroProps {
  /** "Good morning, Tom" — composed by the page from session display name. */
  greeting: string;
  /** "Monday, January 13" — pre-formatted full date. */
  dateLong: string;
  /** "Mon · Jan 13" — pre-formatted compact date for the small date plate. */
  dateCompact: string;
  /** Critical-today count; pass null while loading. */
  critical: number | null;
  /** Slipped-plan count; pass null while loading. */
  slipped: number | null;
  /** Right-side meta-rail content (freshness chip, total inventory chip,
   *  auto-refresh chip) — composed by the page. */
  metaRail: ReactNode;
}

interface FactoryState {
  tone: "success" | "danger" | "warning" | "neutral";
  label: string;
  Icon: typeof CheckCircle2;
  pulse?: boolean;
}

function resolveFactoryState({
  critical,
  slipped,
}: {
  critical: number | null;
  slipped: number | null;
}): FactoryState {
  if (critical === null || slipped === null) {
    return {
      tone: "neutral",
      label: "Reading floor state",
      Icon: Loader2,
    };
  }
  const parts: string[] = [];
  if (critical > 0) parts.push(`${critical} critical`);
  if (slipped > 0) parts.push(`${slipped} slipped`);
  if (parts.length === 0) {
    return { tone: "success", label: "Floor is clear", Icon: CheckCircle2 };
  }
  const tone: "danger" | "warning" = critical > 0 ? "danger" : "warning";
  return {
    tone,
    label: parts.join(" · "),
    Icon: AlertTriangle,
    pulse: tone === "danger",
  };
}

export function DashboardHero({
  greeting,
  dateLong,
  dateCompact,
  critical,
  slipped,
  metaRail,
}: DashboardHeroProps) {
  const state = resolveFactoryState({ critical, slipped });
  const { Icon } = state;

  return (
    <header className="dash-hero reveal">
      {/* Row 1 — eyebrow + factory-state pill */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="dash-hero-eyebrow">Factory Floor · Command Center</div>
        <span
          className="dash-hero-status"
          data-tone={state.tone}
          title={
            state.tone === "neutral"
              ? "Resolving critical and slipped signals."
              : state.tone === "success"
                ? "No critical issues, no slipped plans."
                : "Items needing your attention now."
          }
        >
          <span className="dash-hero-status-dot" aria-hidden />
          <Icon
            className={cn(
              "h-3.5 w-3.5",
              state.Icon === Loader2 ? "animate-spin motion-reduce:animate-none" : "",
            )}
            strokeWidth={2.25}
            aria-hidden
          />
          {state.label}
        </span>
      </div>

      {/* Row 2 — title + compact date plate */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 sm:mt-5">
        <h1 className="dash-hero-title min-w-0">{greeting}</h1>
        <div className="dash-hero-date" title={dateLong}>
          <strong>{dateCompact}</strong>
        </div>
      </div>

      {/* Description — softer secondary line */}
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">
        Here is the state of the factory on{" "}
        <span className="font-semibold text-fg-strong">{dateLong}</span>.
      </p>

      {/* Row 3 — meta rail */}
      {metaRail ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">{metaRail}</div>
      ) : null}
    </header>
  );
}
