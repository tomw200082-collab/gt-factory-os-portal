"use client";

// ---------------------------------------------------------------------------
// SupplierCallLink — the one click-to-call affordance for the procurement +
// placement-queue surfaces (tranche 140, raw-material-first).
//
// The buyer works the queue by phone: each material shows its current
// supplier, and this is how she calls them in one tap. Renders a `tel:` link
// (digits only) with a phone glyph; degrades to a muted "no phone" hint when
// the supplier record carries no number, so a broken/empty tel: link never
// ships. Mirrors the sole prior tel: precedent (BomNetRequirements).
// ---------------------------------------------------------------------------

import { Phone, PhoneOff } from "lucide-react";
import { cn } from "@/lib/cn";

interface SupplierCallLinkProps {
  phone: string | null | undefined;
  /** Supplier name, used only for the screen-reader label. */
  supplierName?: string;
  /** Compact variant drops the visible number to just the glyph (dense rows). */
  compact?: boolean;
  className?: string;
}

export function SupplierCallLink({
  phone,
  supplierName,
  compact = false,
  className,
}: SupplierCallLinkProps) {
  if (!phone || phone.trim().length === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-3xs text-fg-subtle",
          className,
        )}
        title="לא הוזן מספר טלפון לספק"
      >
        <PhoneOff className="h-3 w-3" aria-hidden />
        {compact ? null : <span>אין טלפון</span>}
      </span>
    );
  }

  const dial = phone.replace(/[^\d+]/g, "");
  const label = supplierName
    ? `התקשר ל${supplierName} — ${phone}`
    : `התקשר — ${phone}`;

  return (
    <a
      href={`tel:${dial}`}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      dir="ltr"
      className={cn(
        "inline-flex items-center gap-1 rounded font-mono text-xs text-accent",
        "hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        className,
      )}
    >
      <Phone className="h-3 w-3 shrink-0" aria-hidden />
      {compact ? null : <span>{phone}</span>}
    </a>
  );
}
