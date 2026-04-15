import { AlertTriangle, XOctagon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface ValidationIssue {
  field?: string;
  message: string;
  level: "blocker" | "warning";
}

interface ValidationSummaryProps {
  issues: ValidationIssue[];
  title?: string;
}

export function ValidationSummary({ issues, title }: ValidationSummaryProps) {
  if (issues.length === 0) return null;
  const blockers = issues.filter((i) => i.level === "blocker");
  const warnings = issues.filter((i) => i.level === "warning");
  const dominant = blockers.length > 0 ? "blocker" : "warning";
  const Icon = dominant === "blocker" ? XOctagon : AlertTriangle;

  return (
    <div
      className={cn(
        "relative flex gap-3 overflow-hidden rounded border px-4 py-3.5 text-sm reveal",
        dominant === "blocker"
          ? "border-danger/40 bg-danger-softer text-danger-fg"
          : "border-warning/40 bg-warning-softer text-warning-fg"
      )}
      role={dominant === "blocker" ? "alert" : "status"}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          dominant === "blocker" ? "bg-danger" : "bg-warning"
        )}
        aria-hidden
      />
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          dominant === "blocker" ? "text-danger" : "text-warning"
        )}
        strokeWidth={2}
      />
      <div className="min-w-0 flex-1">
        <div className="text-3xs font-semibold uppercase tracking-sops">
          {title ??
            (dominant === "blocker"
              ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"} must be resolved`
              : `${warnings.length} warning${warnings.length === 1 ? "" : "s"}`)}
        </div>
        <ul className="mt-1.5 space-y-0.5 text-xs leading-relaxed">
          {blockers.map((i, idx) => (
            <li key={`b${idx}`} className="flex gap-2">
              <span className="mt-[5px] dot bg-danger" aria-hidden />
              <span>
                {i.field ? (
                  <span className="font-mono text-3xs uppercase tracking-sops opacity-70">
                    {i.field} ·{" "}
                  </span>
                ) : null}
                {i.message}
              </span>
            </li>
          ))}
          {warnings.map((i, idx) => (
            <li key={`w${idx}`} className="flex gap-2">
              <span className="mt-[5px] dot bg-warning" aria-hidden />
              <span>
                {i.field ? (
                  <span className="font-mono text-3xs uppercase tracking-sops opacity-70">
                    {i.field} ·{" "}
                  </span>
                ) : null}
                {i.message}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
