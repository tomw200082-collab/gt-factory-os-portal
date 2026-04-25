import type { ReactNode } from "react";
import { RoleGate } from "@/lib/auth/role-gate";
import { SeedGate } from "@/lib/repositories/seed-gate";
import { AppShellChrome } from "@/components/layout/AppShellChrome";
import { AppPageShell } from "@/components/layout/AppPageShell";

export default function PlannerLayout({ children }: { children: ReactNode }) {
  return (
    <AppShellChrome>
      <RoleGate allow={["planner", "admin", "viewer"]}>
        <SeedGate>
          <AppPageShell>{children}</AppPageShell>
        </SeedGate>
      </RoleGate>
    </AppShellChrome>
  );
}
