import type { ReactNode } from "react";
import { RoleGate } from "@/lib/auth/role-gate";
import { SeedGate } from "@/lib/repositories/seed-gate";
import { AppShellChrome } from "@/components/layout/AppShellChrome";
import { AppPageShell } from "@/components/layout/AppPageShell";

// ---------------------------------------------------------------------------
// (production) route group — the operator's start-of-run materials-collection
// surface. Same shell + capability gate as (ops): stock:execute admits the
// operator, planner, and admin (the lattice grants planner stock:execute);
// viewer is blocked. Middleware carries a matching /production prefix gate as
// defense-in-depth.
// ---------------------------------------------------------------------------

export default function ProductionLayout({ children }: { children: ReactNode }) {
  return (
    <AppShellChrome>
      <RoleGate minimum="stock:execute">
        <SeedGate>
          <AppPageShell>{children}</AppPageShell>
        </SeedGate>
      </RoleGate>
    </AppShellChrome>
  );
}
