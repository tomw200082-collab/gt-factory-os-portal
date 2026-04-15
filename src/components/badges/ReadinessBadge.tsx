import { cn } from "@/lib/cn";

interface ReadinessBadgeProps {
  label: string;
  status: "ok" | "warn" | "fail" | "unknown";
  detail?: string;
}

const CONFIG = {
  ok: { dot: "bg-success", text: "text-success-fg", label: "OK" },
  warn: { dot: "bg-warning", text: "text-warning-fg", label: "WARN" },
  fail: { dot: "bg-danger", text: "text-danger-fg", label: "FAIL" },
  unknown: { dot: "bg-fg-faint", text: "text-fg-muted", label: "?" },
} as const;

export function ReadinessBadge({ label, status, detail }: ReadinessBadgeProps) {
  const c = CONFIG[status];
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm bg-transparent px-0.5 py-0.5">
      <div className="flex items-center gap-1.5">
        <span className={cn("dot", c.dot)} aria-hidden />
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-muted">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {detail ? (
          <span className="font-mono text-3xs tabular-nums text-fg-subtle">
            {detail}
          </span>
        ) : null}
        <span className={cn("font-mono text-3xs font-semibold", c.text)}>
          {c.label}
        </span>
      </div>
    </div>
  );
}
