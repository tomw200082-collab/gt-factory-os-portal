"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SplitListLayoutProps {
  list: ReactNode;
  detail: ReactNode;
  detailPlaceholder?: ReactNode;
  isDetailOpen: boolean;
  className?: string;
  /**
   * Optional close callback. When supplied, pressing ESC while the detail
   * panel is open invokes this callback. Pages that do not pass it keep
   * their existing behavior unchanged.
   */
  onCloseRequested?: () => void;
}

export function SplitListLayout({
  list,
  detail,
  detailPlaceholder,
  isDetailOpen,
  className,
  onCloseRequested,
}: SplitListLayoutProps) {
  useEffect(() => {
    if (!isDetailOpen || !onCloseRequested) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRequested();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isDetailOpen, onCloseRequested]);

  return (
    <div
      className={cn(
        "grid gap-6",
        isDetailOpen ? "grid-cols-1 xl:grid-cols-[1fr_420px]" : "grid-cols-1",
        className
      )}
    >
      <div className="min-w-0">{list}</div>
      {isDetailOpen ? (
        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          {detail}
        </aside>
      ) : (
        detailPlaceholder ?? null
      )}
    </div>
  );
}
