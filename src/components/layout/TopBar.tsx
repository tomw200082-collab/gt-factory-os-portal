"use client";

import { ChevronDown, Eye, LogOut } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/lib/auth/session-provider";
import { useReviewMode } from "@/lib/review-mode/store";
import type { Role } from "@/lib/contracts/enums";
import { MobileNav } from "./MobileNav";
import { cn } from "@/lib/cn";

const ROLE_OPTIONS: Role[] = ["operator", "planner", "admin", "viewer"];

// The FAKE SESSION pill is a dev-shim affordance for local / e2e work. It
// must never render in production. Gate on the same env var that the
// middleware uses to allow unauthenticated-request pass-through.
const DEV_SHIM_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true";

export function TopBar() {
  const { session, setRole } = useSession();
  const { setOpen, forcedScreenState } = useReviewMode();

  return (
    <header
      className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-2 px-4 sm:gap-5 sm:px-8 xl:px-10">
        {/* Mobile hamburger — renders <md only ———————————————————————————— */}
        <MobileNav />

        {/* Brand mark ——————————————————————————————————————————————————— */}
        <div className="flex items-center gap-3">
          <BrandMark />
          <div className="hidden flex-col leading-none sm:flex">
            <div className="text-[0.8125rem] font-semibold tracking-tightish text-fg-strong">
              GT Factory OS
            </div>
            <div className="mt-0.5 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Operations portal
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          {DEV_SHIM_ENABLED ? (
            <>
              {/* Review mode button — dev-shim only; never renders in production */}
              <button
                type="button"
                className="btn btn-ghost gap-1.5"
                onClick={() => setOpen(true)}
                title="Open review-mode panel (force any screen state)"
                aria-label="Open review-mode panel"
              >
                <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span className="hidden sm:inline">Review</span>
                {forcedScreenState ? (
                  <span className="ml-0.5 rounded-xs bg-warning-soft px-1 py-px text-3xs font-semibold text-warning-fg">
                    FORCED
                  </span>
                ) : null}
              </button>
              <div className="h-6 w-px bg-border/70" aria-hidden />

              {/* Fake session pill — dev-shim only; never renders in production ——— */}
              <div
                className="group relative flex h-9 items-center gap-2 rounded border border-warning/50 bg-warning-softer pl-2 pr-1.5 shadow-raised"
                data-testid="fake-session-pill"
              >
                <span className="flex items-center gap-1">
                  <span className="dot bg-warning animate-pulse-soft" />
                  <span className="text-3xs font-bold uppercase tracking-sops text-warning-fg">
                    FAKE SESSION
                  </span>
                </span>
                <div className="h-4 w-px bg-warning/40" aria-hidden />
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-xs font-medium text-fg-strong"
                    data-testid="fake-session-name"
                  >
                    {session.display_name}
                  </span>
                  <span
                    className="font-mono text-3xs uppercase tracking-sops text-warning-fg"
                    data-testid="fake-session-role"
                  >
                    {session.role}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <ChevronDown
                    className="h-3.5 w-3.5 text-warning-fg"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <select
                    value={session.role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Fake session role switcher"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          ) : (
            /* Production: compact user indicator with sign-out */
            <UserIndicator session={session} />
          )}
        </div>
      </div>
    </header>
  );
}

interface UserIndicatorProps {
  session: { display_name: string; email: string; role: string };
}

function getInitials(name: string, email: string): string {
  const clean = name.split(" (")[0].trim();
  if (clean) {
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function UserIndicator({ session }: UserIndicatorProps) {
  const { isLoading } = useSession();
  if (isLoading) {
    return <div className="h-8 w-8 rounded-full bg-bg-subtle animate-pulse" />;
  }
  const initials = getInitials(session.display_name, session.email);
  const displayName = session.display_name.split(" (")[0] || session.email;
  return (
    <div className="flex items-center gap-2">
      <div className="hidden flex-col items-end leading-none sm:flex">
        <span className="text-[0.75rem] font-medium text-fg-strong">{displayName}</span>
        <span className="mt-0.5 font-mono text-3xs uppercase tracking-sops text-fg-muted">{session.role}</span>
      </div>
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[0.6875rem] font-bold text-accent"
        title={displayName}
        aria-label={`Signed in as ${displayName}`}
      >
        {initials}
      </div>
      <Link
        href="/auth/signout"
        className={cn(
          "hidden h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg sm:flex",
        )}
        title="Sign out"
        aria-label="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
      </Link>
    </div>
  );
}

function BrandMark() {
  return (
    <div
      className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded bg-accent text-accent-fg shadow-raised"
      aria-hidden
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M3 4.5V15.5M3 4.5L10 1L17 4.5M3 4.5L10 8L17 4.5M17 4.5V15.5M10 8V19M3 15.5L10 19L17 15.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="pointer-events-none absolute inset-0 rounded"
        style={{
          background:
            "linear-gradient(180deg, hsl(186 60% 50% / 0.25) 0%, transparent 60%)",
        }}
      />
    </div>
  );
}
