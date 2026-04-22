import type { ReactNode } from "react";
import { RoleGate } from "@/lib/auth/role-gate";
import { SeedGate } from "@/lib/repositories/seed-gate";
import { AppPageShell } from "@/components/layout/AppPageShell";

// Admin execute capability — admin ONLY. Planner was previously allowed
// here via the old allow-list; that was over-permissive relative to the
// portal-full-production-refactor plan §B.2 lattice and is corrected in
// Tranche A. Planners who need to read master data for planning context
// get that via the read-only surfaces under (planning)/*.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate minimum="admin:execute">
      <SeedGate>
        <AppPageShell>{children}</AppPageShell>
      </SeedGate>
    </RoleGate>
  );
}
