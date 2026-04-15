import { AlertCircle, Info, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface DiffNoticeProps {
  title: string;
  description: string;
  tone?: "info" | "warning" | "danger";
  onReload?: () => void;
  onDismiss?: () => void;
}

export function DiffNotice({
  title,
  description,
  tone = "info",
  onReload,
  onDismiss,
}: DiffNoticeProps) {
  const Icon = tone === "danger" ? AlertCircle : tone === "warning" ? AlertCircle : Info;
  return (
    <div
      className={cn(
        "relative flex items-start gap-3.5 overflow-hidden rounded border px-4 py-3",
        tone === "info" && "border-info/40 bg-info-softer",
        tone === "warning" && "border-warning/40 bg-warning-softer",
        tone === "danger" && "border-danger/40 bg-danger-softer"
      )}
      role="status"
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          tone === "info" && "bg-info",
          tone === "warning" && "bg-warning",
          tone === "danger" && "bg-danger"
        )}
        aria-hidden
      />
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "info" && "text-info",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger"
        )}
        strokeWidth={2}
      />
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-sm font-semibold",
            tone === "info" && "text-info-fg",
            tone === "warning" && "text-warning-fg",
            tone === "danger" && "text-danger-fg"
          )}
        >
          {title}
        </div>
        <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
          {description}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {onReload ? (
          <button
            type="button"
            className="btn btn-sm gap-1.5"
            onClick={onReload}
          >
            <RefreshCw className="h-3 w-3" strokeWidth={2} />
            Reload
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
