"use client";

// Tranche 090 (Slice B / Phase 2) — the role-tailored card HOME landing.
//
// The corridor's front door (deep-research + /ck:grill, 2026-06-26): instead of
// scanning a ~30-item sidebar ("a needle in a haystack"), each role lands on a
// curated cockpit — ONE large primary tile (their #1 daily action) plus grouped
// supporting tiles. Static shortcuts, no live data — simple and zero-backend by
// design. The analytical Dashboard stays one tile/tab away (it is the "pulse";
// this is the "launcher").
//
// Role-TAILORED, not role-locked: tiles, primary, group order, and language are
// chosen per role by buildHomeCockpit(), but visibility uses the SAME gate as
// SideNav/RoleGate — so admin sees every group (everything) and no role is ever
// offered a tile it can't open. Everything not featured here is one ⌘K away.
// The bookkeeper/office (viewer) cockpit renders Hebrew + RTL (CLAUDE.md
// exception, 2026-06-26).
//
// Visual: "The Line" — a petrol-teal spine that fills each tile on hover, built
// on existing tokens + Tailwind's animate-fade-in-up utility (already used
// elsewhere in the portal) paired with motion-reduce:animate-none, so entrance
// motion honors prefers-reduced-motion without any globals.css change. No new
// dependency.
//
// Tranche 119 (UX-gate P1 pass, 2026-07-03): fixed the ux-release-gate CONDITIONAL_SHIP
// items for this surface — Hebrew lang attribute, reduced-motion entrance, RTL-safe
// keyboard-shortcut copy, mobile search-affordance honesty, contrast, and the
// single-tile-group span-fill layout rule.

import { useMemo, type CSSProperties } from "react";

import { useSession } from "@/lib/auth/session-provider";
import { buildHomeCockpit, type Lang } from "@/features/home/cockpit";
import { cn } from "@/lib/cn";
import { HomeTile } from "./_components/HomeTile";
import { TodayBoard } from "./_components/TodayBoard";

// Entrance animation — Tailwind's built-in animate-fade-in-up (tailwind.config.ts)
// + motion-reduce:animate-none so the OS reduced-motion preference is honored.
// Delay mirrors the retired .reveal-delay-N steps (40ms per step, capped at 7).
const REVEAL = "animate-fade-in-up motion-reduce:animate-none";
function revealDelay(step: number): CSSProperties {
  return { animationDelay: `${Math.min(step, 7) * 40}ms` };
}

function greeting(now: Date, lang: Lang, name?: string | null): string {
  const h = now.getHours();
  const first = name ? name.split(" (")[0].split(" ")[0] : null;
  if (lang === "he") {
    const base = h < 12 ? "בוקר טוב" : h < 18 ? "צהריים טובים" : "ערב טוב";
    return first ? `${base}, ${first}` : base;
  }
  const base = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return first ? `${base}, ${first}` : base;
}

function dateLabel(now: Date, lang: Lang): string {
  return now.toLocaleDateString(lang === "he" ? "he-IL" : undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function HomePage() {
  const { session } = useSession();
  const role = session?.role ?? "viewer";
  const view = useMemo(() => buildHomeCockpit(role), [role]);
  const { primary, groups, lang, dir } = view;
  const rtl = dir === "rtl";
  const now = new Date();

  const focusEyebrow = lang === "he" ? "המוקד שלך" : "Your focus";

  // The Ctrl+K hint is wrapped in <bdi dir="ltr"> so it never bidi-reverses to
  // "K+lrtC" inside the RTL Hebrew sentence. Ctrl+K (not ⌘K) — the bookkeeper's
  // office workstation is Windows. Below md the search-field trigger in TopBar
  // is hidden (CommandPalette.tsx), so the promise there points at the menu
  // instead, which is always present (MobileNav).
  const shortcutHint = <bdi dir="ltr">Ctrl+K</bdi>;

  return (
    <div
      dir={dir}
      lang={lang}
      className="mx-auto flex w-full max-w-[1120px] flex-col gap-8"
      data-testid="home-cockpit"
      data-role={role}
      data-lang={lang}
    >
      {/* Greeting — the page thesis. A short teal "line" seeds the spine motif. */}
      <header className={cn(REVEAL, "flex flex-col gap-1.5")}>
        <p className="font-mono text-3xs font-semibold uppercase tracking-sops text-fg-muted">
          {dateLabel(now, lang)}
        </p>
        <h1 className="text-3xl font-semibold tracking-tightish text-fg-strong">
          {greeting(now, lang, session?.display_name)}
        </h1>
        <span aria-hidden className="mt-0.5 h-0.5 w-10 rounded-full bg-accent/70" />
        {lang === "he" ? (
          <>
            <p className="mt-1 hidden text-sm text-fg-muted md:block">
              קפצו ישר למה שצריך. כל השאר במרחק חיפוש אחד ({shortcutHint}).
            </p>
            <p className="mt-1 text-sm text-fg-muted md:hidden">
              קפצו ישר למה שצריך. כל השאר נמצא בתפריט.
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 hidden text-sm text-fg-muted md:block">
              Jump straight to what you need. Everything else is one search ({shortcutHint}) away.
            </p>
            <p className="mt-1 text-sm text-fg-muted md:hidden">
              Jump straight to what you need. Everything else is in the menu.
            </p>
          </>
        )}
      </header>

      {/* Primary — the role's hero tile (full-width banner). */}
      {primary ? (
        <div className={REVEAL} style={revealDelay(1)}>
          <HomeTile tile={primary} lang={lang} rtl={rtl} variant="primary" eyebrow={focusEyebrow} />
        </div>
      ) : null}

      {/* Today Board (Tranche 136) — the 9:30 briefing surface: Yesterday /
          Today / Tomorrow tabs. Operator/planner/admin only in v1; the
          viewer/bookkeeper cockpit is a different surface entirely (OQ-2
          default: no board there). */}
      {role !== "viewer" ? (
        <div className={REVEAL} style={revealDelay(2)}>
          <TodayBoard />
        </div>
      ) : null}

      {/* Supporting tiles — grouped bento, staggered reveal. A lone tile in a
          group spans the full row instead of leaving a 2/3-empty row. */}
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-3xs font-semibold uppercase tracking-sops text-fg-muted">
              {lang === "he" ? group.label.he : group.label.en}
            </h2>
            <div className="h-px flex-1 bg-border/50" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.tiles.map((tile, i) => (
              <div
                key={tile.href}
                className={cn(REVEAL, group.tiles.length === 1 && "sm:col-span-2 lg:col-span-3")}
                style={revealDelay(i + 1)}
              >
                <HomeTile tile={tile} lang={lang} rtl={rtl} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Empty fallback — should not occur (every role has Inbox + Dashboard). */}
      {!primary && groups.length === 0 ? (
        <div className="card p-6 text-sm text-fg-muted">
          {lang === "he" ? (
            <>אין כרגע קיצורים זמינים. השתמשו בסרגל הצד או ב-{shortcutHint} לניווט.</>
          ) : (
            <>No quick actions yet. Use the sidebar or {shortcutHint} to navigate.</>
          )}
        </div>
      ) : null}
    </div>
  );
}
