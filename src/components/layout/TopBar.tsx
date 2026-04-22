"use client";

import { ChevronDown, Eye } from "lucide-react";
import { useSession } from "@/lib/auth/session-provider";
import { useReviewMode } from "@/lib/review-mode/store";
import type { Role } from "@/lib/contracts/enums";
import { MobileNav } from "./MobileNav";

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
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur-md">
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
          <span
            className="ml-2 hidden items-center gap-1.5 rounded-sm border border-border/70 bg-bg-subtle px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops text-fg-muted sm:inline-flex"
            title="This is a shell build — no backend yet."
          >
            <span className="dot bg-fg-faint" />
            Shell build
          </span>
        </div>

        {/* Global status strip ————————————————————————————————————————— */}
        <div className="ml-4 hidden items-center gap-3 text-3xs text-fg-muted lg:flex">
          <span className="flex items-center gap-1.5">
            <span className="dot bg-success" />
            Ledger OK
          </span>
          <span className="text-fg-faint">·</span>
          <span className="flex items-center gap-1.5">
            <span className="dot bg-warning animate-pulse-soft" />
            Jobs 2 warn
          </span>
          <span className="text-fg-faint">·</span>
          <span className="flex items-center gap-1.5 font-mono">
            v0.1.0
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          {/* Review mode button ————————————————————————————————————————— */}
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

          {DEV_SHIM_ENABLED ? (
            <>
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
          ) : null}
        </div>
      </div>
    </header>
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
