"use client";
import { cn } from "@/lib/cn";

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}
function daysAgo(d: Date) {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (isSameDay(d, today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, yesterday)) return "Yesterday";
  const dayDiff = daysAgo(d);
  if (dayDiff > 0 && dayDiff < 7) {
    return d.toLocaleDateString(undefined, { weekday: "long" });
  }
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function DayHeader({ label, count }: { label: string; count: number }) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex items-baseline justify-between gap-2",
        "border-b border-border/60 bg-bg-base/95 px-5 py-2 backdrop-blur"
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {label}
      </span>
      <span className="text-xs text-fg-subtle">
        {count} {count === 1 ? "action" : "actions"}
      </span>
    </div>
  );
}
