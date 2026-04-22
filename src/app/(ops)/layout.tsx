import type { ReactNode } from "react";
import { RoleGate } from "@/lib/auth/role-gate";
import { SeedGate } from "@/lib/repositories/seed-gate";
import { AppPageShell } from "@/components/layout/AppPageShell";

// Stock execute capability — admin + operator pass; planner does NOT
// inherit this per portal-full-production-refactor plan §B.2 lattice lock.
export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate minimum="stock:execute">
      <SeedGate>
        <AppPageShell>{children}</AppPageShell>
      </SeedGate>
    </RoleGate>
  );
}
