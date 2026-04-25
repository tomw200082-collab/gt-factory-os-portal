import type { ReactNode } from "react";

// Auth layout — intentionally bare. No TopBar, no SideNav.
// Login, signout, and callback pages render standalone.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
