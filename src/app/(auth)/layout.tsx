import type { ReactNode } from "react";

// Auth layout — intentionally bare. No TopBar, no SideNav. Adds a soft
// off-white page background (#FAFAFA via bg-bg-subtle) plus a min-h-screen
// shell so the centered login card has a calmer surrounding. Standalone
// surfaces (login, signout, callback) render inside this.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-subtle">
      {children}
    </div>
  );
}
