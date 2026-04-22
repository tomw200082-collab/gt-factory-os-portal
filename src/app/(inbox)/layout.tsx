import type { ReactNode } from "react";
import { RoleGate } from "@/lib/auth/role-gate";
import { SeedGate } from "@/lib/repositories/seed-gate";
import { AppPageShell } from "@/components/layout/AppPageShell";

// Inbox is visible to all authenticated roles. Per-row actions (approve,
// resolve, acknowledge) are gated server-side by capability + approval
// kind — the listing itself is safe to read for any role.
export default function InboxLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate minimum="viewer:read">
      <SeedGate>
        <AppPageShell>{children}</AppPageShell>
      </SeedGate>
    </RoleGate>
  );
}
