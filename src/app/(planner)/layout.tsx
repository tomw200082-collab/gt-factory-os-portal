import type { ReactNode } from "react";
import { RoleGate } from "@/lib/auth/role-gate";
import { SeedGate } from "@/lib/repositories/seed-gate";
import { AppShellChrome } from "@/components/layout/AppShellChrome";
import { AppPageShell } from "@/components/layout/AppPageShell";

// planning:read — all four roles pass (operator has planning:read in lattice).
// Write-path mutations (forecast edits, run approvals) are gated server-side
// on planning:execute. Using the capability minimum keeps this aligned with
// the nav manifest and avoids a broken state where the nav shows planning
// items as accessible to operators but the layout blocks them.
export default function PlannerLayout({ children }: { children: ReactNode }) {
  return (
    <AppShellChrome>
      <RoleGate minimum="planning:read">
        <SeedGate>
          <AppPageShell>{children}</AppPageShell>
        </SeedGate>
      </RoleGate>
    </AppShellChrome>
  );
}
