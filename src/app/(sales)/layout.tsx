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
 * Access is admin-only in v1. The gate that actually holds is this one plus the
 * server-side check on every sales endpoint — the middleware role table is a
 * documented no-op until app_users.role is projected into the JWT.
 */
export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate minimum="admin:execute">
      <div className={rubik.variable}>
        <SalesShell>{children}</SalesShell>
      </div>
    </RoleGate>
  );
}
