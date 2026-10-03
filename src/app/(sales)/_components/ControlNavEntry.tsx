"use client";

// The control-room entry (D-045). Loaded on demand (next/dynamic in SalesShell) only when the
// server says this session has can_control, so its label is in no other session's bundle.

import Link from "next/link";
import { Gauge } from "lucide-react";

export const CONTROL_HREF = "/sales/control";
export const CONTROL_NAV_LABEL = "חדר בקרה";

export default function ControlNavEntry({ variant, active }: { variant: "icon" | "rail"; active: boolean }) {
  if (variant === "icon") {
    return (
      <Link
        href={CONTROL_HREF}
        aria-label={CONTROL_NAV_LABEL}
        title={CONTROL_NAV_LABEL}
        data-testid="sales-control-icon"
        aria-current={active ? "page" : undefined}
        className="grid h-11 w-11 place-items-center rounded-full md:hidden"
        style={{ color: "hsl(var(--s-fg-muted))" }}
      >
        <Gauge size={18} aria-hidden />
      </Link>
    );
  }
  return (
    <Link
      href={CONTROL_HREF}
      data-testid="sales-rail-control"
      aria-current={active ? "page" : undefined}
      className={`s-tab justify-start ${active ? "s-tab-active" : ""}`}
    >
      <Gauge size={17} aria-hidden />
      {CONTROL_NAV_LABEL}
    </Link>
  );
}
