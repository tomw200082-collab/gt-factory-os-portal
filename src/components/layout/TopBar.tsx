"use client";

import { ChevronDown, Eye, LogOut, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/lib/auth/session-provider";
import { useReviewMode } from "@/lib/review-mode/store";
import { useTheme } from "@/lib/theme";
import type { Role } from "@/lib/contracts/enums";
import { MobileNav } from "./MobileNav";
import { cn } from "@/lib/cn";
import { getUserInitials } from "@/lib/user-initials";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_OPTIONS: Role[] = ["operator", "planner", "admin", "viewer"];

// The FAKE SESSION pill is a dev-shim affordance for local / e2e work. It
// must never render in production. Gate on the same env var that the
// middleware uses to allow unauthenticated-request pass-through.
const DEV_SHIM_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_DEV_SHIM_AUTH === "true";

// Non-production environment chip. We show a STAGING / PREVIEW pill on
// Vercel preview deploys and on local-with-real-auth so the operator can
// never confuse the staging portal for production at a glance. In actual
// production (`NEXT_PUBLIC_VERCEL_ENV === "production"`) we render no chip
// — the absence IS the signal. In dev-shim mode the FAKE SESSION pill
// already covers the warning so we don't double up.
const VERCEL_ENV = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "";
const NON_PROD_LABEL =
  VERCEL_ENV === "preview"
    ? "PREVIEW"
    : VERCEL_ENV === "development"
    ? "DEV"
    : VERCEL_ENV === "" || VERCEL_ENV === "production"
    ? null
    : VERCEL_ENV.toUpperCase();

export function TopBar() {
  const { session, setRole } = useSession();
  const { setOpen, forcedScreenState } = useReviewMode();

  return (
    <header
      className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-2 px-4 sm:gap-4 sm:px-8 xl:px-10">
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

        {/* Non-prod env chip — small visual safety so the operator never
            confuses staging for prod. Hidden in production and in dev-shim. */}
        {!DEV_SHIM_ENABLED && NON_PROD_LABEL ? (
          <span
            className="ml-2 hidden items-center gap-1 rounded-full border border-warning/40 bg-warning-softer px-2 py-0.5 text-3xs font-bold uppercase tracking-sops text-warning-fg sm:inline-flex"
            data-testid="topbar-env-chip"
            aria-label={`Environment: ${NON_PROD_LABEL}`}
            title="You're not on production. Changes here will not affect live data."
          >
            <span className="dot bg-warning" aria-hidden />
            {NON_PROD_LABEL}
          </span>
        ) : null}

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

              {/* Compact UserMenu — also exposes Dark Mode toggle in dev-shim */}
              <UserMenu compact />
            </>
          ) : (
            <UserMenu />
          )}
        </div>
      </div>
    </header>
  );
}

interface UserMenuProps {
  compact?: boolean;
}

function UserMenu({ compact = false }: UserMenuProps) {
  const { session, isLoading } = useSession();
  const { theme, toggle } = useTheme();

  if (isLoading && !compact) {
    return (
      <div
        className="h-8 w-8 rounded-full bg-bg-subtle animate-pulse"
        aria-label="Loading user"
      />
    );
  }

  const initials = getUserInitials(session.display_name, session.email);
  const displayName = session.display_name.split(" (")[0] || session.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <button
            type="button"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg",
              "focus-visible:outline-none",
            )}
            aria-label="Open user menu"
            title="User menu"
          >
            {theme === "dark" ? (
              <Moon className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : (
              <Sun className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors",
              "hover:bg-bg-subtle focus-visible:outline-none",
            )}
            aria-label="Open user menu"
          >
            <div className="hidden flex-col items-end leading-none sm:flex">
              <span className="text-[0.75rem] font-medium text-fg-strong">
                {displayName}
              </span>
              <span className="mt-0.5 font-mono text-3xs uppercase tracking-sops text-fg-muted">
                {session.role}
              </span>
            </div>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[0.6875rem] font-bold text-accent"
              title={displayName}
            >
              {initials}
            </div>
            <ChevronDown
              className="h-3.5 w-3.5 text-fg-muted"
              strokeWidth={2}
              aria-hidden
            />
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        {!compact && (
          <>
            <DropdownMenuLabel className="normal-case tracking-normal">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-fg-strong">
                  {displayName}
                </span>
                <span className="text-xs font-normal text-fg-muted">
                  {session.email}
                </span>
                <span className="mt-0.5 font-mono text-3xs uppercase tracking-sops text-fg-subtle">
                  {session.role}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem
          onSelect={(e) => {
            // Keep menu open after toggle — the change is visible behind it.
            e.preventDefault();
            toggle();
          }}
          className="justify-between"
        >
          <span className="flex items-center gap-2">
            {theme === "dark" ? (
              <Moon className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : (
              <Sun className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            Dark Mode
          </span>
          <span
            className={cn(
              "ml-3 inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors",
              theme === "dark"
                ? "border-accent bg-accent"
                : "border-border bg-bg-subtle",
            )}
            aria-hidden
          >
            <span
              className={cn(
                "h-3 w-3 rounded-full bg-bg-raised shadow-raised transition-transform",
                theme === "dark" ? "translate-x-3.5" : "translate-x-0.5",
              )}
            />
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/auth/signout" className="flex items-center gap-2">
            <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
            Sign out
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BrandMark() {
  // GT Everyday brand logo. Source asset at /public/brand/logo.png is
  // white-on-transparent. Tailwind `invert dark:invert-0` flips the colors:
  //   light theme → invert(100%) → renders BLACK on the page background
  //   dark  theme → invert(0)    → stays WHITE
  // (Tom-locked 2026-04-28: white in dark, black in light — logo only.)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo.png"
      alt="GT Everyday"
      width={40}
      height={40}
      className="h-10 w-10 object-contain invert dark:invert-0"
    />
  );
}
