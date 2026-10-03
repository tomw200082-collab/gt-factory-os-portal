// /sales/control is Tom's (D-045). This server layout answers 404 — the portal's own not-found,
// the same status, title and text as an unknown route — to every other session before the page
// renders (UX gate P1-1). No title is set for anyone else: the not-found keeps the portal's.
// The backend stays the guard; this only makes the portal say the same thing.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { controlAllowed } from "./access";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await controlAllowed())) return {};
  return { title: "חדר בקרה — GT CRM", robots: { index: false, follow: false } };
}

export default async function ControlLayout({ children }: { children: React.ReactNode }) {
  if (!(await controlAllowed())) notFound();
  return children;
}
