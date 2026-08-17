import type { ReactNode } from "react";
import { Rubik } from "next/font/google";
import { RoleGate } from "@/lib/auth/role-gate";
import "../(sales)/sales-tokens.css";

// The switchboard is the first screen after login, so it must not depend on
// either workspace's chrome. It borrows the sales token layer for its two
// cards and nothing else.
const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-rubik",
  display: "swap",
});

export default function AppsLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate minimum="viewer:read">
      <div className={rubik.variable}>{children}</div>
    </RoleGate>
  );
}
