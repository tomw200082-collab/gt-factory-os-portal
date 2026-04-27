"use client";

// ---------------------------------------------------------------------------
// BlockerDetailAccordion — opaque debug accordion exposing blocker_detail.
//
// Per PBR-3 (W1 self-resolved 2026-04-27): backend returns blocker_detail as
// an opaque jsonb. W2 must NOT render specific keys as primary UX; this
// accordion exists for debug surface only.
//
// Default: collapsed.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

interface BlockerDetailAccordionProps {
  detail: Record<string, unknown>;
}

export function BlockerDetailAccordion({ detail }: BlockerDetailAccordionProps) {
  const [open, setOpen] = useState(false);
  const hasContent =
    detail != null &&
    typeof detail === "object" &&
    Object.keys(detail).length > 0;
  if (!hasContent) {
    return null;
  }

  return (
    <div className="text-3xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 text-fg-faint hover:text-fg-muted"
        aria-expanded={open}
      >
        <ChevronDown
          className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          strokeWidth={2}
          aria-hidden
        />
        פרטים טכניים
      </button>
      {open ? (
        <pre
          dir="ltr"
          className="mt-1 max-h-48 overflow-auto rounded border border-border/40 bg-bg-subtle p-2 font-mono text-3xs leading-snug text-fg-muted"
        >
          {JSON.stringify(detail, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
