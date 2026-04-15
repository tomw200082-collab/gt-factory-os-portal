import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SplitListLayoutProps {
  list: ReactNode;
  detail: ReactNode;
  detailPlaceholder?: ReactNode;
  isDetailOpen: boolean;
  className?: string;
}

export function SplitListLayout({
  list,
  detail,
  detailPlaceholder,
  isDetailOpen,
  className,
}: SplitListLayoutProps) {
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
