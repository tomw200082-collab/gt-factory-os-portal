import type { ReactNode } from "react";
import { RoleGate } from "@/lib/auth/role-gate";
import { SeedGate } from "@/lib/repositories/seed-gate";
import { AppShellChrome } from "@/components/layout/AppShellChrome";
import { AppPageShell } from "@/components/layout/AppPageShell";

// Shared surfaces — dashboard, profile. Any authenticated role passes.
export default function SharedLayout({ children }: { children: ReactNode }) {
  return (
    <AppShellChrome>
      <RoleGate minimum="viewer:read">
        <SeedGate>
          <AppPageShell>{children}</AppPageShell>
        </SeedGate>
      </RoleGate>
    </AppShellChrome>
  );
}
