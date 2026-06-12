"use client";

// ---------------------------------------------------------------------------
// <ScrollFade> — right-edge scroll affordance for horizontally scrollable
// rows (Tranche 051: FLOW-009 dashboard quick actions, FLOW-015 group chip
// rows, FLOW-019 inbox view chips).
//
// Structure:
//   <div relative (className)>
//     <div scroll-container (contentClassName + contentProps)>
//       {children}
//       <sentinel 1px/>
//     </div>
//     <fade overlay/>
//   </div>
//
// The fade is shown only while horizontal overflow exists AND the row is not
// scrolled to its end: an IntersectionObserver (root = the scroll container)
// watches a 1px in-flow sentinel appended after the last child. Sentinel
// visible → at end (or no overflow) → fade hidden. Sentinel out of view →
// hidden content to the right → fade shown.
//
// The caller owns the row layout: pass the flex classes (including
// overflow-x-auto for the breakpoints that should scroll) via
// contentClassName, and any role/aria/data-testid via contentProps. The
// initial state is "no fade", so rows that wrap (desktop) never flash a
// gradient; environments without IntersectionObserver simply never show it.
// ---------------------------------------------------------------------------

import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type ScrollContainerProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "className" | "children"
> & {
  [dataAttr: `data-${string}`]: string | undefined;
};

export interface ScrollFadeProps {
  children: ReactNode;
  /** Outer (relative) wrapper — spacing/sizing within the parent flow. */
  className?: string;
  /** The scroll container itself — the caller's flex-row classes. */
  contentClassName?: string;
  /** Extra attributes for the scroll container (role / aria-* / data-testid). */
  contentProps?: ScrollContainerProps;
  /**
   * Tailwind `from-*` token matching the surface behind the row, so the
   * gradient melts into it. Default matches the `.card` body (bg-raised).
   */
  fadeFromClassName?: string;
}

export function ScrollFade({
  children,
  className,
  contentClassName,
  contentProps,
  fadeFromClassName = "from-bg-raised",
}: ScrollFadeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // true = sentinel visible = scrolled to end (or no overflow) = no fade.
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setAtEnd(last.isIntersecting);
      },
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn("relative", className)}>
      <div ref={scrollRef} className={contentClassName} {...contentProps}>
        {children}
        {/* End-of-row sentinel — 1px, invisible, stretches the row height so
            it always has an intersectable box. */}
        <div ref={sentinelRef} className="w-px shrink-0 self-stretch" aria-hidden />
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-0 inset-y-0 w-8 bg-gradient-to-l to-transparent",
          "transition-opacity duration-150 motion-reduce:transition-none",
          fadeFromClassName,
          atEnd ? "opacity-0" : "opacity-100",
        )}
      />
    </div>
  );
}
