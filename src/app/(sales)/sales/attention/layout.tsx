// Title only. The page itself is a client component and cannot export metadata,
// so without this segment layout the route would ship the shell's title and a
// screen reader would announce no change on navigation.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "מצב — GT מכירות",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
