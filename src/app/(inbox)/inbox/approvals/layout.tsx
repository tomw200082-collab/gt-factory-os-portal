import type { ReactNode } from "react";
import { RoleGate } from "@/lib/auth/role-gate";

// Approval detail screens (waste + physical-count) render Approve / Reject
// buttons. The underlying mutations are planner:execute only; viewer or
// operator clicks would 403 on the server. Tightening the UI gate here gives
// viewers + operators a proper "not for your role" card instead of a
// client-side 403 after clicking, which closes the orphan-approval pattern
// flagged by the flow-continuity audit.
export default function InboxApprovalsLayout({ children }: { children: ReactNode }) {
  return <RoleGate allow={["planner", "admin"]}>{children}</RoleGate>;
}
