import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ApprovalBannerProps {
  title: string;
  reason: string;
  threshold?: string;
  tone?: "info" | "warning";
  action?: ReactNode;
}

export function ApprovalBanner({
  title,
  reason,
  threshold,
  tone = "warning",
  action,
}: ApprovalBannerProps) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "relative flex items-start gap-3.5 overflow-hidden rounded border px-4 py-3.5",
        tone === "warning"
          ? "border-warning/40 bg-warning-softer"
          : "border-info/40 bg-info-softer"
      )}
      role="status"
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          tone === "warning" ? "bg-warning" : "bg-info"
        )}
        aria-hidden
      />
      <div
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded",
          tone === "warning"
            ? "bg-warning/15 text-warning"
            : "bg-info/15 text-info"
        )}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-sm font-semibold",
            tone === "warning" ? "text-warning-fg" : "text-info-fg"
          )}
        >
          {title}
        </div>
        <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
          {reason}
        </div>
        {threshold ? (
          <div className="mt-2 flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-fg-faint" strokeWidth={2} />
            <span className="font-mono text-3xs uppercase tracking-sops text-fg-subtle">
              Policy · {threshold}
            </span>
          </div>
        ) : null}
      </div>
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  );
}
