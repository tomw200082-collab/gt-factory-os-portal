// Title only (the page is a client component). The page is Tom's (D-045): the server answers
// 404 to every other session, and the page then shows "not found" with no data.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "חדר בקרה — GT CRM",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
