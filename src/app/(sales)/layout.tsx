import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Rubik } from "next/font/google";
import { RoleGate } from "@/lib/auth/role-gate";
import { SalesShell } from "./_components/SalesShell";
import "./sales-tokens.css";

// Rubik carries real Hebrew, which the portal's Public Sans does not: the
// factory surfaces fall back to system fonts for Hebrew values, and a
// Hebrew-first workspace cannot. Scoped to this group through --font-rubik.
const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-rubik",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GT Sales",
  // Scoped manifest: only sales routes advertise the installable app, so the
  // factory portal's install behaviour is untouched.
  manifest: "/sales-manifest.webmanifest",
  icons: { apple: "/sales-icons/apple-touch-icon.png" },
};

/**
 * The sales workspace shell.
 *
 * Deliberately not the factory group layout: no AppShellChrome (this surface
 * owns its own navigation) and no SeedGate (nothing here touches the local
 * IndexedDB repositories, so gating first paint on a seed would cost a spinner
 * for nothing).
 *
 * Access is the `sales` capability, held by `sales_rep`, by `planner` (tranche
 * 175, Tom 2026-08-25) and by admin. This gate
 * plus the server-side check on every sales endpoint are the two that actually
 * hold — the middleware role table is a documented no-op until app_users.role is
 * projected into the JWT, which is exactly why changing only the API would give
 * a sales rep 2xx from every endpoint and still bounce them off the screen.
 */
export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate minimum="sales:execute">
      <div className={rubik.variable}>
        <SalesShell>{children}</SalesShell>
      </div>
    </RoleGate>
  );
}
