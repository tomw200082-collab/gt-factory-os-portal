import type { ReactNode } from "react";
import { RoleGate } from "@/lib/auth/role-gate";
import { SeedGate } from "@/lib/repositories/seed-gate";
import { AppPageShell } from "@/components/layout/AppPageShell";

// Purchase orders — read-visible to any authenticated role. Create and
// transition actions are gated server-side on planning:execute.
export default function PurchaseOrdersLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RoleGate minimum="viewer:read">
      <SeedGate>
        <AppPageShell>{children}</AppPageShell>
      </SeedGate>
    </RoleGate>
  );
}
