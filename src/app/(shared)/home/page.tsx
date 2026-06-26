"use client";

// Tranche 090 (Slice B) — the card-based HOME landing.
//
// The corridor's front door (deep-research + /ck:grill, 2026-06-26): instead of
// scanning a ~30-item sidebar ("a needle in a haystack"), each role lands on a
// small grid of large, clear shortcut tiles to *their* areas. Static tiles, no
// live data — simple and zero-backend by design. The analytical Dashboard stays
// one tile/tab away (it is the "pulse"; this is the "launcher").
//
// Source of truth: the same role-aware QUICK_ACTIONS set the dashboard launcher
// uses, filtered by authorizeCapability — identical enforcement path as SideNav
// and RoleGate, so HOME can never show a tile the role can't use. Visual polish
// with "special components" is Tom's explicit phase 2; this is the functional
// version on the existing design system.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";

import { useSession } from "@/lib/auth/session-provider";
import { authorizeCapability } from "@/lib/auth/authorize";
import { QUICK_ACTIONS, type QuickAction } from "@/features/dashboard/quick-actions";
import { SectionCard } from "@/components/workflow/SectionCard";
import { cn } from "@/lib/cn";

// Display order + operator-facing labels for the QuickAction categories.
const CATEGORY_ORDER: QuickAction["category"][] = [
  "triage",
  "overview",
  "stock",
  "planning",
  "admin",
];
const CATEGORY_LABEL: Record<QuickAction["category"], string> = {
  triage: "Triage",
  overview: "Overview",
  stock: "Stock",
  planning: "Planning & purchasing",
  admin: "Admin",
};

function greeting(now: Date, name?: string | null): string {
  const h = now.getHours();
  const base = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name ? name.split(" (")[0].split(" ")[0] : null;
  return first ? `${base}, ${first}` : base;
}

function todayLabel(now: Date): string {
  return now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function HomePage() {
  const { session } = useSession();
  const role = session?.role ?? "viewer";
  const now = new Date();

  const byCategory = useMemo(() => {
    const visible = QUICK_ACTIONS.filter((a) => authorizeCapability(role, a.required));
    const groups = new Map<QuickAction["category"], QuickAction[]>();
    for (const a of visible) {
      const list = groups.get(a.category) ?? [];
      list.push(a);
      groups.set(a.category, list);
    }
    return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({
      category: c,
      label: CATEGORY_LABEL[c],
      actions: groups.get(c)!,
    }));
  }, [role]);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8">
      {/* Greeting header ———————————————————————————————————————————————— */}
      <header className="flex flex-col gap-1">
        <p className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          {todayLabel(now)}
        </p>
        <h1 className="text-2xl font-semibold tracking-tightish text-fg-strong">
          {greeting(now, session?.display_name)}
        </h1>
        <p className="text-sm text-fg-muted">
          Jump straight to what you need. Everything else is one search (⌘K) away.
        </p>
      </header>

      {byCategory.length === 0 ? (
        <SectionCard title="Nothing to launch yet">
          <p className="text-sm text-fg-muted">
            Your role has no quick actions configured. Use the sidebar or ⌘K to navigate.
          </p>
        </SectionCard>
      ) : (
        byCategory.map(({ category, label, actions }) => (
          <SectionCard key={category} eyebrow={label}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {actions.map((a) => {
                const Icon = a.icon;
                return (
                  <Link
                    key={a.href}
                    href={a.href}
                    className={cn(
                      "group flex items-start gap-3 rounded-xl border border-border/70 bg-bg-raised p-4 transition-all duration-150",
                      "hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 motion-reduce:hover:translate-y-0",
                    )}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[0.9375rem] font-semibold text-fg-strong">
                          {a.label}
                        </span>
                        <ArrowRight
                          className="h-3.5 w-3.5 -translate-x-1 text-accent opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none"
                          strokeWidth={2}
                          aria-hidden
                        />
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">
                        {a.blurb}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </SectionCard>
        ))
      )}
    </div>
  );
}
