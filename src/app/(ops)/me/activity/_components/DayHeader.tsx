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
    return d.toLocaleDateString("en-US", { weekday: "long" });
  }
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export function DayHeader({
  id,
  label,
  count,
}: {
  id?: string;
  label: string;
  count: number;
}) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex items-baseline justify-between gap-2",
        "border-b border-border/60 bg-bg-raised/95 px-5 py-2 backdrop-blur"
      )}
    >
      <h3
        id={id}
        className="text-2xs font-semibold uppercase tracking-sops text-fg-muted"
      >
        {label}
      </h3>
      <span
        className="rounded-sm border border-border bg-bg-subtle px-1.5 py-0.5 text-2xs tabular-nums text-fg-subtle"
        aria-label={`${count} ${count === 1 ? "action" : "actions"}`}
      >
        {count}
      </span>
    </div>
  );
}
