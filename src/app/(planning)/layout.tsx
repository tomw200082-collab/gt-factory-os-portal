import type { ReactNode } from "react";
import { RoleGate } from "@/lib/auth/role-gate";
import { SeedGate } from "@/lib/repositories/seed-gate";
import { AppShellChrome } from "@/components/layout/AppShellChrome";
import { AppPageShell } from "@/components/layout/AppPageShell";
import { PlanningSubNav } from "@/components/layout/PlanningSubNav";

// Planning read capability — admin + planner + viewer pass. Viewer is
// read-only by lattice construction; write-path mutations are gated
// server-side on planning:execute.
//
// Tranche 075 (cross-cutting skip-link): the app-level AppShellChrome already
// provides a "Skip to main content" → #main-content link that jumps past the
// top bar / side nav. Inside planning we additionally let the user skip past
// PlanningSubNav and land in the page-specific content region. Pattern is the
// same sr-only / focus:not-sr-only convention used in AppShellChrome.tsx; no
// new tokens or globals.css changes.
export default function PlanningLayout({ children }: { children: ReactNode }) {
  return (
    <AppShellChrome>
      <RoleGate minimum="planning:read">
        <SeedGate>
          <AppPageShell>
            <a
              href="#planning-main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-fg focus:shadow-raised"
              data-testid="planning-skip-link"
            >
              Skip to planning content
            </a>
            <PlanningSubNav />
            <div id="planning-main-content" tabIndex={-1} className="outline-none">
              {children}
            </div>
          </AppPageShell>
        </SeedGate>
      </RoleGate>
    </AppShellChrome>
  );
}
