import type { ReactNode } from "react";
import { RoleGate } from "@/lib/auth/role-gate";
import { SeedGate } from "@/lib/repositories/seed-gate";
import { AppPageShell } from "@/components/layout/AppPageShell";

// Planning read capability — admin + planner + viewer pass. Viewer is
// read-only by lattice construction; write-path mutations are gated
// server-side on planning:execute.
export default function PlanningLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate minimum="planning:read">
      <SeedGate>
        <AppPageShell>{children}</AppPageShell>
      </SeedGate>
    </RoleGate>
  );
}
