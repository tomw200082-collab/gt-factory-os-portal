"use client";

// The workspace chrome: a phone-first bottom tab bar, a slim desktop rail, and
// a header that stays out of the way.
//
// Deliberately not AppShellChrome. The factory shell is a wide LTR instrument
// panel with its own nav manifest; this is a three-destination Hebrew app that
// has to work one-handed. Sharing the chrome would mean bending both.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Building2, CalendarCheck, Plus, Search, Settings, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NAV_LABELS, UI } from "../_lib/labels";
import { useLeads, useOrgs, useQuickAdd } from "../_lib/api";
import { CommandK } from "./CommandK";
import { QuickAddSheet } from "./QuickAddSheet";

interface Destination {
  href: string;
  label: string;
  icon: typeof CalendarCheck;
}

const DESTINATIONS: Destination[] = [
  { href: "/sales/today", label: NAV_LABELS.today, icon: CalendarCheck },
  { href: "/sales/leads", label: NAV_LABELS.leads, icon: Users },
  { href: "/sales/orgs", label: NAV_LABELS.orgs, icon: Building2 },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SalesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Confirmation should not outstay its welcome above the tab bar. Without
  // this the quick-add toast sits there for the rest of the session, still
  // announcing a lead created ten minutes and three screens ago.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  // Both lists are already cached for the screens; the palette reuses them
  // rather than adding a search endpoint.
  const leads = useLeads();
  const orgs = useOrgs();
  const quickAdd = useQuickAdd();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div data-app="sales" dir="rtl" lang="he" className="min-h-screen">
      <a
        href="#sales-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:px-3 focus:py-2"
        style={{ background: "hsl(var(--s-surface))", color: "hsl(var(--s-fg))" }}
      >
        דלג לתוכן
      </a>

      <header
        className="sticky top-0 z-30 border-b backdrop-blur-md"
        style={{
          borderColor: "hsl(var(--s-border))",
          background: "hsl(var(--s-surface) / 0.85)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link
            href="/sales/today"
            className="text-[15px] font-semibold tracking-tight"
            style={{ color: "hsl(var(--s-fg))" }}
          >
            {UI.appName}
          </Link>

          <div className="flex-1" />

          <button
            type="button"
            aria-label={UI.commandTitle}
            title={UI.commandTitle}
            data-testid="sales-search-open"
            onClick={() => setSearchOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-full"
            style={{ color: "hsl(var(--s-fg-muted))" }}
          >
            <Search size={18} aria-hidden />
          </button>

          <Link
            href="/sales/settings"
            aria-label={NAV_LABELS.settings}
            title={NAV_LABELS.settings}
            className="grid h-10 w-10 place-items-center rounded-full"
            style={{ color: "hsl(var(--s-fg-muted))" }}
          >
            <Settings size={18} aria-hidden />
          </Link>

          {/* The phone is the primary device, and it had no way back to the
              factory at all — the bottom bar holds the three sales
              destinations, so leaving meant typing a URL. Icon-only here,
              labelled from sm up, one control either way. */}
          <Link
            href="/home"
            aria-label={UI.switchToFactory}
            title={UI.switchToFactory}
            data-testid="sales-switch-factory"
            className="grid h-10 w-10 place-items-center rounded-full sm:inline-flex sm:h-auto sm:w-auto sm:items-center sm:gap-1.5 sm:rounded-none sm:px-1 sm:text-[13px]"
            style={{ color: "hsl(var(--s-fg-muted))" }}
          >
            <ArrowLeftRight size={15} aria-hidden />
            <span className="hidden sm:inline">{UI.switchToFactory}</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-6 px-4 pt-4">
        {/* Desktop rail. Hidden on phones, where the tab bar takes over. */}
        <nav
          aria-label={UI.appName}
          className="hidden w-44 shrink-0 flex-col gap-1 md:flex"
        >
          {DESTINATIONS.map((d) => {
            const active = isActive(pathname, d.href);
            const Icon = d.icon;
            return (
              <Link
                key={d.href}
                href={d.href}
                aria-current={active ? "page" : undefined}
                data-testid={`sales-rail-${d.href}`}
                className={`s-tab justify-start ${active ? "s-tab-active" : ""}`}
              >
                <Icon size={17} aria-hidden />
                {d.label}
              </Link>
            );
          })}
          <Link
            href="/sales/settings"
            aria-current={isActive(pathname, "/sales/settings") ? "page" : undefined}
            className={`s-tab justify-start ${
              isActive(pathname, "/sales/settings") ? "s-tab-active" : ""
            }`}
          >
            <Settings size={17} aria-hidden />
            {NAV_LABELS.settings}
          </Link>
        </nav>

        <main
          id="sales-main"
          className="min-w-0 flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-10"
        >
          {children}
        </main>
      </div>

      {/* Quick add: reachable from every screen, because a lead that arrives by
          phone must be as easy to capture as one Meta delivers. */}
      <button
        type="button"
        data-testid="sales-quick-add"
        onClick={() => setAddOpen(true)}
        className="s-btn s-btn-primary fixed z-30 shadow-lg"
        style={{
          insetInlineEnd: 16,
          bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
          borderRadius: "var(--s-radius-pill)",
        }}
      >
        <Plus size={18} aria-hidden />
        {UI.quickAdd}
      </button>

      {searchOpen ? (
        <CommandK
          leads={leads.data ?? []}
          orgs={orgs.data ?? []}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}

      {addOpen ? (
        <QuickAddSheet
          busy={quickAdd.isPending}
          error={quickAdd.error?.message ?? null}
          onSubmit={(vars) =>
            quickAdd.mutate(vars, {
              onSuccess: () => {
                setAddOpen(false);
                setToast(UI.quickAddSaved);
              },
            })
          }
          onDismiss={() => setAddOpen(false)}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="sales-shell-toast"
          className="fixed inset-x-0 bottom-24 mx-auto w-fit rounded-full px-4 py-2 text-[13px]"
          style={{ background: "hsl(var(--s-fg))", color: "hsl(var(--s-bg))" }}
        >
          {toast}
        </div>
      ) : null}

      {/* Phone tab bar. Three destinations, thumb-height, safe-area aware. */}
      <nav
        aria-label={UI.appName}
        className="fixed inset-x-0 bottom-0 z-30 border-t md:hidden"
        style={{
          borderColor: "hsl(var(--s-border))",
          background: "hsl(var(--s-surface))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <ul className="mx-auto flex max-w-5xl">
          {DESTINATIONS.map((d) => {
            const active = isActive(pathname, d.href);
            const Icon = d.icon;
            return (
              <li key={d.href} className="flex-1">
                <Link
                  href={d.href}
                  aria-current={active ? "page" : undefined}
                  data-testid={`sales-tab-${d.href}`}
                  className="flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium"
                  style={{
                    color: active ? "hsl(var(--s-accent))" : "hsl(var(--s-fg-muted))",
                  }}
                >
                  <Icon size={20} aria-hidden />
                  {d.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
