// Title only: the page is a client component and cannot export metadata.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "בדיקת זהות · GT CRM",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
