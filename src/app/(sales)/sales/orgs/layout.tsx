// Title only. The page itself is a client component and cannot export metadata,
// so without this segment layout all four sales routes shipped the same
// document title and a screen reader announced no change on navigation.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "עסקים — GT מכירות",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
