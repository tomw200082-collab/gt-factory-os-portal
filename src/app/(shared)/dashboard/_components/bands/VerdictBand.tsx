"use client";

// ---------------------------------------------------------------------------
// VerdictBand — Band 0 of the dashboard (Tranche 060, design-doc §4).
// Replaces DashboardHero. The daily ritual's ARRIVE moment:
//
//   row 1 — eyebrow + factory-state pill (Q1: am I safe?)
//   row 2 — greeting (date appears ONCE, inside this line)
//   row 3 — the Focus Engine sentence (LAW 1: what is today about?)
//   row 4 — meta rail: freshness + "since you last looked" delta chips
//
// Sticky collapse: a zero-height sticky wrapper under the TopBar carries a
// slim mirror (state dot + focus sentence + jump link). It fades in only
// after the full band scrolls out, so Q1 stays answered at any depth.
//
// All data comes from the page; this component owns no queries.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FocusResult } from "../../_lib/focus-engine";

export interface SinceChip {
  key: string;
  label: string;
  href: string;
}

export interface VerdictBandProps {
  /** "Good morning, Tom" — composed by the page. */
  greeting: string;
  /** "Thursday, June 12" — rendered once, inside the greeting line. */
  dateLong: string;
  /** Focus Engine result (rule "loading" while queries resolve). */
  focus: FocusResult;
  /** Critical-today count; null while loading. */
  critical: number | null;
  /** Slipped-plan count; null while loading. */
  slipped: number | null;
  /** Freshness chip(s) — composed by the page. */
  metaRail: ReactNode;
  /** "Since you last looked" delta chips (empty on first-ever visit). */
  sinceChips: SinceChip[];
}

interface FactoryState {
  tone: "success" | "danger" | "warning" | "neutral";
  label: string;
  Icon: typeof CheckCircle2;
}

function resolveFactoryState(critical: number | null, slipped: number | null): FactoryState {
  if (critical === null || slipped === null) {
    return { tone: "neutral", label: "Reading floor state", Icon: Loader2 };
  }
  const parts: string[] = [];
  if (critical > 0) parts.push(`${critical} critical`);
  if (slipped > 0) parts.push(`${slipped} slipped`);
  if (parts.length === 0) {
    return { tone: "success", label: "Floor is clear", Icon: CheckCircle2 };
  }
  return {
    tone: critical > 0 ? "danger" : "warning",
    label: parts.join(" · "),
    Icon: AlertTriangle,
  };
}

export function VerdictBand({
  greeting,
  dateLong,
  focus,
  critical,
  slipped,
  metaRail,
  sinceChips,
}: VerdictBandProps) {
  const state = resolveFactoryState(critical, slipped);
  const { Icon } = state;

  // Sticky collapse — observe the full band; show the slim mirror when it
  // has scrolled out from under the TopBar.
  const bandRef = useRef<HTMLElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = bandRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      // TopBar is sticky h-16 (64px) — treat the band as gone once it has
      // fully passed under it.
      { rootMargin: "-72px 0px 0px 0px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const focusNode = (
    <span className="inline-flex min-w-0 items-baseline gap-2">
      <span className="truncate">{focus.sentence}</span>
      {focus.href ? (
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 self-center" strokeWidth={2.25} aria-hidden />
      ) : null}
    </span>
  );

  return (
    <>
      {/* Slim sticky mirror — zero-height wrapper so it never shifts layout. */}
      <div className="dash-verdict-mini-wrap" aria-hidden={!stuck}>
        <div className={cn("dash-verdict-mini", stuck && "is-stuck")} data-tone={focus.tone}>
          <span className="dash-hero-status-dot shrink-0" data-tone={state.tone} aria-hidden />
          {focus.href ? (
            <Link
              href={focus.href}
              className="min-w-0 truncate text-xs font-semibold text-fg-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              tabIndex={stuck ? 0 : -1}
            >
              {focus.sentence}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-xs font-semibold text-fg-strong">
              {focus.sentence}
            </span>
          )}
          <a
            href="#todays-work"
            className="ml-auto shrink-0 text-2xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            tabIndex={stuck ? 0 : -1}
          >
            Today&apos;s work
          </a>
        </div>
      </div>

      <header ref={bandRef} className="dash-hero reveal" data-testid="dash-verdict">
        {/* Row 1 — eyebrow + factory-state pill */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="dash-hero-eyebrow">Factory Floor · Command Center</div>
          <span
            className="dash-hero-status"
            data-tone={state.tone}
            data-testid="dash-state-pill"
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
                Icon === Loader2 ? "animate-spin motion-reduce:animate-none" : "",
              )}
              strokeWidth={2.25}
              aria-hidden
            />
            {state.label}
          </span>
        </div>

        {/* Row 2 — greeting; the date appears once, here. */}
        <h1 className="dash-hero-title mt-4 min-w-0 sm:mt-5">
          {greeting}
          <span className="dash-verdict-date"> · {dateLong}</span>
        </h1>

        {/* Row 3 — the Focus Engine sentence. */}
        <p className="dash-focus mt-3" data-tone={focus.tone} data-testid="dash-focus">
          {focus.href ? (
            focus.href.startsWith("#") ? (
              <a
                href={focus.href}
                className="dash-focus-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {focusNode}
              </a>
            ) : (
              <Link
                href={focus.href}
                className="dash-focus-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {focusNode}
              </Link>
            )
          ) : (
            focusNode
          )}
        </p>

        {/* Row 4 — meta rail: freshness + since-you-last-looked deltas. */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {metaRail}
          {sinceChips.map((c) => (
            <Link
              key={c.key}
              href={c.href}
              className="dash-chip transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              title="Since you last opened the dashboard."
            >
              {c.label}
            </Link>
          ))}
        </div>
      </header>
    </>
  );
}
