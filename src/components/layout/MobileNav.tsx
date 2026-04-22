"use client";

// ---------------------------------------------------------------------------
// MobileNav — hamburger button + slide-in drawer, visible on <md only.
//
// Responsibility:
//   - Render a hamburger icon button (aria-label "Open navigation") when the
//     drawer is closed; switch to an X icon when open.
//   - Render a backdrop + slide-in panel containing the same <SideNav /> that
//     the desktop shell renders. Navigation logic stays in SideNav; this
//     component only manages visibility.
//
// Close triggers:
//   1. Link click (SideNav's onNavigate callback).
//   2. Backdrop click.
//   3. Escape keypress.
//   4. Viewport resize to md+ (matchMedia listener — so a user rotating a
//      tablet from portrait (<md) to landscape (>=md) doesn't end up with
//      a hidden-but-still-"open" drawer state that mis-locks scroll).
//
// Scroll lock:
//   Locks body scroll while open so background content doesn't scroll under
//   the drawer. Restores on close.
//
// A11y:
//   - Button exposes aria-label.
//   - Panel has role="dialog", aria-modal="true", aria-labelledby pointing
//     at a visually-hidden title inside the panel.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { SideNav } from "./SideNav";
import { cn } from "@/lib/cn";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  // Close on viewport >= md.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border/70 bg-bg text-fg hover:bg-bg-subtle"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        ) : (
          <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
        )}
      </button>

      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 md:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden
        onClick={() => setOpen(false)}
      />

      {/* Slide-in panel */}
      <aside
        id="mobile-nav-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-nav-title"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(288px,85vw)] flex-col border-r border-border/70 bg-bg shadow-raised transition-transform duration-200 ease-out md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <h2 id="mobile-nav-title" className="sr-only">
          Portal navigation
        </h2>
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border/70 px-4">
          <span className="text-sm font-semibold text-fg-strong">Menu</span>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-bg-subtle hover:text-fg"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SideNav onNavigate={() => setOpen(false)} />
        </div>
      </aside>
    </div>
  );
}
