import type { ReactNode } from "react";
import { RoleGate } from "@/lib/auth/role-gate";
import { SeedGate } from "@/lib/repositories/seed-gate";
import { AppShellChrome } from "@/components/layout/AppShellChrome";
import { AppPageShell } from "@/components/layout/AppPageShell";

// Economics route group — gated on planning:execute, which the lattice grants
// to planner + admin only (operator and viewer hold planning:read, below
// execute). Created 2026-05-17 to lift /admin/economics out of the (admin)
// group: admins still reach it, and planners now own routine component-cost
// edits and on-demand re-snapshots per Tom's request. The page URL is
// unchanged (/admin/economics); only the gating layout differs. Write-path
// mutations remain enforced server-side on the same planner+admin gate.
export default function EconomicsLayout({ children }: { children: ReactNode }) {
  return (
    <AppShellChrome>
      <RoleGate minimum="planning:execute">
        <SeedGate>
          <AppPageShell>{children}</AppPageShell>
        </SeedGate>
      </RoleGate>
    </AppShellChrome>
  );
}
