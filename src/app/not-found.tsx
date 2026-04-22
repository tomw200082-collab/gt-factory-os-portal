// ---------------------------------------------------------------------------
// 404 — renders when a route is not matched.
//
// Server component; no client state needed. Links back to live operational
// surfaces so a mistyped URL doesn't strand the user.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { Compass } from "lucide-react";

const LIVE_LINKS: Array<{ href: string; label: string; hint: string }> = [
  { href: "/dashboard", label: "Dashboard", hint: "Overview of the portal" },
  { href: "/inbox", label: "Inbox", hint: "Exceptions + pending approvals" },
  { href: "/stock/receipts", label: "Goods Receipt", hint: "Record stock in" },
  { href: "/planning/runs", label: "Planning Runs", hint: "Review + approve recs" },
];

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl pt-8">
      <div
        className="rounded-md border border-border/70 bg-bg-subtle/50 px-4 py-6"
        data-testid="not-found"
      >
        <div className="flex items-start gap-3">
          <Compass
            className="mt-0.5 h-5 w-5 shrink-0 text-fg-muted"
            strokeWidth={2}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-fg-strong">
              We couldn&apos;t find that page.
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              The URL may be stale or the surface hasn&apos;t shipped yet. Try
              one of the live modules below.
            </p>
            <ul className="mt-4 divide-y divide-border/60 rounded-md border border-border/70 bg-bg">
              {LIVE_LINKS.map((m) => (
                <li key={m.href}>
                  <Link
                    href={m.href}
                    className="flex items-baseline justify-between gap-3 px-3 py-2.5 text-sm hover:bg-bg-subtle"
                  >
                    <span className="font-medium text-fg-strong">{m.label}</span>
                    <span className="text-xs text-fg-muted">{m.hint}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
