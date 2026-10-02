// Title only. The page is a client component and cannot export metadata, so without this segment
// layout every sales route would announce the same document title.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "דוח מכירות — GT CRM",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
