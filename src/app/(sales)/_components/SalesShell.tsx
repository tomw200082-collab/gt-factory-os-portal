"use client";

// The workspace chrome: a phone-first bottom tab bar, a slim desktop rail, and
// a header that stays out of the way.
//
// Deliberately not AppShellChrome. The factory shell is a wide LTR instrument
// panel with its own nav manifest; this is a three-destination Hebrew app that
// has to work one-handed. Sharing the chrome would mean bending both.

import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Activity, ArrowLeftRight, Building2, CalendarCheck, ChartColumn, Plus, Search, Settings, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NAV_LABELS, UI } from "../_lib/labels";
import { useControlAccess, useLeads, useQuickAdd } from "../_lib/api";
import { noteSalesPath } from "../_lib/salesHistory";
import { CommandK } from "./CommandK";
import { QuickAddSheet } from "./QuickAddSheet";
import { Toast } from "./Toast";
import { useRouteReveal } from "@/components/layout/useRouteReveal";
import { useSession } from "@/lib/auth/session-provider";

interface Destination {
  href: string;
  /** the phone bar's label */
  label: string;
  /** the desktop rail's label, when there is room for more than the bar's */
  railLabel?: string;
  icon: typeof CalendarCheck;
}

// Four now, not three. v1's "three screens, no more" was decided before the
// admin console was asked for; the fourth answers the question the person
// running this asks every morning, and burying it in a tab would hide it.
const DESTINATIONS: Destination[] = [
  { href: "/sales/today", label: NAV_LABELS.today, icon: CalendarCheck },
  { href: "/sales/leads", label: NAV_LABELS.leads, icon: Users },
  { href: "/sales/orgs", label: NAV_LABELS.orgs, icon: Building2 },
  { href: "/sales/attention", label: NAV_LABELS.attention, icon: Activity },
];

// The sales report (tranche 202) is for the people who run sales, so only managers get the fifth
// destination. A rep who opens the URL still lands on the page, which says it is not theirs.
const REPORT_DESTINATION: Destination = {
  href: "/sales/report",
  label: NAV_LABELS.report,
  railLabel: NAV_LABELS.reportFull,
  icon: ChartColumn,
};

// The control room (D-045) is Tom's. The entry follows the server's can_control flag, so the
// client never carries the email it is decided by; the route itself answers 404 to anyone else.
// Loaded on demand, only for a session the server allows: the label stays out of everyone else's bundle.
const CONTROL_HREF = "/sales/control";
const ControlNavEntry = dynamic(() => import("./ControlNavEntry"), { ssr: false });

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The sales pages are Hebrew; the root layout says English for the rest of the portal (A11Y-B-003). */
export function useSalesDocumentLang() {
  useEffect(() => {
    const el = document.documentElement;
    const before = el.lang;
    el.lang = "he";
    return () => {
      el.lang = before;
    };
  }, []);
}

export function SalesShell({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const canManageSales = session?.role === "admin" || session?.role === "planner";
  const destinations = canManageSales ? [...DESTINATIONS, REPORT_DESTINATION] : DESTINATIONS;
  const showControl = useControlAccess(canManageSales).data === true;
  const pathname = usePathname() ?? "";
  const mainRef = useRouteReveal<HTMLElement>();
  // The report's month tables are the widest thing in the workspace: its body takes the room the page has
  // beyond the usual column, toward the far edge. The rail and the app bar stay exactly where they are on
  // every screen, so moving between screens never moves the navigation.
  const wide = pathname === REPORT_DESTINATION.href;
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useSalesDocumentLang();
  useEffect(() => noteSalesPath(pathname), [pathname]);

  // Confirmation should not outstay its welcome above the tab bar. Without
  // this the quick-add toast sits there for the rest of the session, still
  // announcing a lead created ten minutes and three screens ago.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  // The leads list is already cached for the screens; the palette reuses it.
  // Businesses are searched on the server (CommandK).
  const leads = useLeads();
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

      <header className="s-appbar sticky top-0 z-30 backdrop-blur-md">
        <div className={`mx-auto flex h-14 max-w-5xl items-center gap-3 px-4`}>
          <Link
            href="/sales/today"
            className="s-brand inline-flex min-h-[44px] items-center text-[15px] font-semibold tracking-tight"
            style={{ color: "hsl(var(--s-fg))" }}
          >
            <span className="s-brand-mark" aria-hidden />
            {UI.appName}
          </Link>

          <div className="flex-1" />

          <button
            type="button"
            aria-label={UI.commandTitle}
            title={UI.commandTitle}
            data-testid="sales-search-open"
            onClick={() => setSearchOpen(true)}
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{ color: "hsl(var(--s-fg-muted))" }}
          >
            <Search size={18} aria-hidden />
          </button>

          {canManageSales ? <Link
            href="/sales/settings"
            aria-label={NAV_LABELS.settings}
            title={NAV_LABELS.settings}
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{ color: "hsl(var(--s-fg-muted))" }}
          >
            <Settings size={18} aria-hidden />
          </Link> : null}

          {/* Phones only: on desktop the rail carries the entry. */}
          {showControl ? <ControlNavEntry variant="icon" active={isActive(pathname, CONTROL_HREF)} /> : null}

          {/* The phone is the primary device, and it had no way back to the
              factory at all — the bottom bar holds the three sales
              destinations, so leaving meant typing a URL. Icon-only here,
              labelled from sm up, one control either way. A sales rep has no
              factory surface, so the link would be a dead end (D11). */}
          {session?.role !== "sales_rep" ? <Link
            href="/home"
            aria-label={UI.switchToFactory}
            title={UI.switchToFactory}
            data-testid="sales-switch-factory"
            className="grid h-11 w-11 place-items-center rounded-full sm:inline-flex sm:h-auto sm:min-h-[44px] sm:w-auto sm:items-center sm:gap-1.5 sm:rounded-none sm:px-1 sm:text-[13px]"
            style={{ color: "hsl(var(--s-fg-muted))" }}
          >
            <ArrowLeftRight size={15} aria-hidden />
            <span className="hidden sm:inline">{UI.switchToFactory}</span>
          </Link> : null}
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-6 px-4 pt-4">
        {/* Desktop rail. Hidden on phones, where the tab bar takes over. */}
        <nav
          aria-label={UI.navMain}
          className="hidden w-44 shrink-0 flex-col gap-1 md:flex"
        >
          {destinations.map((d) => {
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
                {d.railLabel ?? d.label}
              </Link>
            );
          })}
          {canManageSales ? <Link
            href="/sales/settings"
            aria-current={isActive(pathname, "/sales/settings") ? "page" : undefined}
            className={`s-tab justify-start ${
              isActive(pathname, "/sales/settings") ? "s-tab-active" : ""
            }`}
          >
            <Settings size={17} aria-hidden />
            {NAV_LABELS.settings}
          </Link> : null}
          {showControl ? <ControlNavEntry variant="rail" active={isActive(pathname, CONTROL_HREF)} /> : null}
        </nav>

        <main
          ref={mainRef}
          id="sales-main"
          className="gt-reveal min-w-0 flex-1 pb-[calc(9rem+env(safe-area-inset-bottom,0px))] md:pb-24"
          style={wide ? { marginInlineEnd: "calc(-1 * clamp(0px, (100vw - 1024px) / 2 - 16px, 360px))" } : undefined}
        >
          {children}
        </main>
      </div>

      {/* Quick add: reachable from every screen, because a lead that arrives by
          phone must be as easy to capture as one Meta delivers. */}
      {/* Not on settings: the one floating action is "add a lead", which is
          not a thing you do from a settings form — and it sat on top of the
          add-a-reason button, which is a floating action obscuring a real one. */}
      {/* Nor on a business page: there the first viewport ends on the call and
          WhatsApp buttons, and the floating disc sat on top of them. */}
      {/* Nor on the report: it is something you read, and the disc sat over the numbers in the corner. */}
      {pathname === "/sales/settings" || pathname === CONTROL_HREF || pathname === REPORT_DESTINATION.href || /^\/sales\/orgs\/[^/]+/.test(pathname) ? null : (
      <button
        type="button"
        data-testid="sales-quick-add"
        // Round on a phone, so the one floating action hides as little of the
        // list under it as possible; the name stays for assistive tech.
        aria-label={UI.quickAdd}
        onClick={() => setAddOpen(true)}
        className="s-btn s-btn-primary s-fab fixed z-30"
        style={{
          // insetInlineStart resolves to the physical right in RTL, which is
          // the thumb arc of a right-handed phone grip. insetInlineEnd put the
          // one floating action on the far side of the screen from the thumb.
          insetInlineStart: 16,
          // Above the floating tab bar (56px row, 4px inset, 10px lift).
          bottom: "calc(5.75rem + env(safe-area-inset-bottom, 0px))",
          borderRadius: "var(--s-radius-pill)",
        }}
      >
        <Plus size={22} aria-hidden />
        <span className="hidden md:inline">{UI.quickAdd}</span>
      </button>
      )}

      {searchOpen ? (
        <CommandK
          leads={leads.data ?? []}
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

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}

      {/* Phone tab bar. Three destinations, thumb-height, safe-area aware. */}
      <nav
        aria-label={UI.navBar}
        className="s-tabbar fixed inset-x-0 bottom-0 z-30 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="mx-auto flex max-w-5xl">
          {destinations.map((d) => {
            const active = isActive(pathname, d.href);
            const Icon = d.icon;
            return (
              <li key={d.href} className="flex-1">
                <Link
                  href={d.href}
                  aria-current={active ? "page" : undefined}
                  data-testid={`sales-tab-${d.href}`}
                  className="s-tabbar-link flex min-h-[56px] flex-col items-center justify-center gap-1 text-[12px] font-medium"
                >
                  <span className="s-tabbar-icon" aria-hidden>
                    <Icon size={20} />
                  </span>
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
