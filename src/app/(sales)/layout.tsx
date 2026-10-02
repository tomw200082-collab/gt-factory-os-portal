import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Rubik } from "next/font/google";
import { GTLoader } from "@/components/ui/GTLoader";
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
  title: "GT CRM",
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
 *
 * While the session loads the gate shows the sales loader, so a direct load of
 * a /sales/* URL is never a blank screen (the loader stays invisible for its
 * first 120 ms, so a fast session never shows it). It is a route-boundary loader
 * (the navigation overlay waits for it), it fades out when the session lands,
 * and after 8 s it offers a reload instead of spinning forever.
 */
export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate minimum="sales:execute" fallback={<GTLoader variant="sales" boundary slowAfterMs={8000} />}>
      <div className={rubik.variable}>
        <SalesShell>{children}</SalesShell>
      </div>
    </RoleGate>
  );
}
