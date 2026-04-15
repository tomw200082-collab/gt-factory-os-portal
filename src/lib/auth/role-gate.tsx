"use client";

import { useSession } from "./session-provider";
import type { Role } from "@/lib/contracts/enums";
import type { ReactNode } from "react";

interface RoleGateProps {
  allow: Role[];
  children: ReactNode;
}

export function RoleGate({ allow, children }: RoleGateProps) {
  const { session } = useSession();
  if (!allow.includes(session.role)) {
    return (
      <div className="card mx-auto mt-8 max-w-lg p-6 text-center">
        <div className="text-sm font-semibold text-fg">Not available for your role</div>
        <div className="mt-2 text-xs text-fg-muted">
          This surface is restricted to: {allow.join(", ")}.<br />
          Current role:{" "}
          <span className="font-mono text-fg">{session.role}</span>. Use the
          fake-session switcher in the top bar to change roles.
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function useHasRole(...roles: Role[]): boolean {
  const { session } = useSession();
  return roles.includes(session.role);
}
