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
// on existing tokens + CSS-animation utilities (.reveal / motion-reduce). No
// new dependency.

import { useMemo } from "react";

import { useSession } from "@/lib/auth/session-provider";
import { buildHomeCockpit, type Lang } from "@/features/home/cockpit";
import { cn } from "@/lib/cn";
import { HomeTile } from "./_components/HomeTile";

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
  const subcopy =
    lang === "he"
      ? "קפצו ישר למה שצריך. כל השאר במרחק חיפוש אחד (⌘K)."
      : "Jump straight to what you need. Everything else is one search (⌘K) away.";

  return (
    <div
      dir={dir}
      className="mx-auto flex w-full max-w-[1120px] flex-col gap-8"
      data-testid="home-cockpit"
      data-role={role}
      data-lang={lang}
    >
      {/* Greeting — the page thesis. A short teal "line" seeds the spine motif. */}
      <header className="reveal flex flex-col gap-1.5">
        <p className="font-mono text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          {dateLabel(now, lang)}
        </p>
        <h1 className="text-3xl font-semibold tracking-tightish text-fg-strong">
          {greeting(now, lang, session?.display_name)}
        </h1>
        <span aria-hidden className="mt-0.5 h-0.5 w-10 rounded-full bg-accent/70" />
        <p className="mt-1 text-sm text-fg-muted">{subcopy}</p>
      </header>

      {/* Primary — the role's hero tile (full-width banner). */}
      {primary ? (
        <div className="reveal reveal-delay-1">
          <HomeTile tile={primary} lang={lang} rtl={rtl} variant="primary" eyebrow={focusEyebrow} />
        </div>
      ) : null}

      {/* Supporting tiles — grouped bento, staggered reveal. */}
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              {lang === "he" ? group.label.he : group.label.en}
            </h2>
            <div className="h-px flex-1 bg-border/50" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.tiles.map((tile, i) => (
              <div
                key={tile.href}
                className={cn("reveal", `reveal-delay-${Math.min(i + 1, 7)}`)}
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
          {lang === "he"
            ? "אין כרגע קיצורים זמינים. השתמשו בסרגל הצד או ב-⌘K לניווט."
            : "No quick actions yet. Use the sidebar or ⌘K to navigate."}
        </div>
      ) : null}
    </div>
  );
}
