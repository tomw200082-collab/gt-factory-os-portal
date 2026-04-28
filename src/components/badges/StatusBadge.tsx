import { cn } from "@/lib/cn";
import type { SubmissionState } from "@/lib/contracts/enums";

/**
 * Submission-state badge: dot + compact uppercase label.
 *
 * The dot color is the semantic signal; the pill is low-chrome so many
 * of these can sit in a row without competing.
 */
const STYLE_FOR_STATE: Record<
  SubmissionState,
  { label: string; dot: string; text: string; bg: string; border: string }
> = {
  queued: {
    label: "Queued",
    dot: "bg-fg-faint",
    text: "text-fg-muted",
    bg: "bg-bg-subtle",
    border: "border-border/80",
  },
  submitting: {
    label: "Submitting",
    dot: "bg-info animate-pulse-soft",
    text: "text-info-fg",
    bg: "bg-info-softer",
    border: "border-info/40",
  },
  committed: {
    label: "Committed",
    dot: "bg-success",
    text: "text-success-fg",
    bg: "bg-success-softer",
    border: "border-success/40",
  },
  pending_approval: {
    label: "Pending approval",
    dot: "bg-warning animate-pulse-soft",
    text: "text-warning-fg",
    bg: "bg-warning-softer",
    border: "border-warning/40",
  },
  approved: {
    label: "Approved",
    dot: "bg-success",
    text: "text-success-fg",
    bg: "bg-success-softer",
    border: "border-success/40",
  },
  rejected: {
    label: "Rejected",
    dot: "bg-danger",
    text: "text-danger-fg",
    bg: "bg-danger-softer",
    border: "border-danger/40",
  },
  failed_retriable: {
    label: "Retry pending",
    dot: "bg-warning",
    text: "text-warning-fg",
    bg: "bg-warning-softer",
    border: "border-warning/40",
  },
  failed_terminal: {
    label: "Failed",
    dot: "bg-danger",
    text: "text-danger-fg",
    bg: "bg-danger-softer",
    border: "border-danger/40",
  },
  discarded: {
    label: "Discarded",
    dot: "bg-fg-faint",
    text: "text-fg-subtle line-through",
    bg: "bg-bg-subtle",
    border: "border-border/70",
  },
};

interface StatusBadgeProps {
  state: SubmissionState;
}

export function StatusBadge({ state }: StatusBadgeProps) {
  const s = STYLE_FOR_STATE[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops",
        s.bg,
        s.text,
        s.border
      )}
    >
      <span className={cn("dot", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

interface GenericBadgeProps {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
  variant?: "soft" | "outline" | "solid";
  children: React.ReactNode;
  className?: string;
  dotted?: boolean;
}

const TONE_CLASSES: Record<
  NonNullable<GenericBadgeProps["tone"]>,
  { soft: string; outline: string; solid: string; dot: string }
> = {
  neutral: {
    soft: "bg-bg-muted text-fg-muted border-border/70",
    outline: "bg-transparent text-fg-muted border-border/80",
    solid: "bg-fg/10 text-fg-strong border-border/70",
    dot: "bg-fg-faint",
  },
  accent: {
    soft: "bg-accent-soft text-accent border-accent/30",
    outline: "bg-transparent text-accent border-accent/40",
    solid: "bg-accent text-accent-fg border-accent",
    dot: "bg-accent",
  },
  success: {
    soft: "bg-success-softer text-success-fg border-success/30",
    outline: "bg-transparent text-success-fg border-success/40",
    solid: "bg-success text-fg-inverted border-success",
    dot: "bg-success",
  },
  warning: {
    soft: "bg-warning-softer text-warning-fg border-warning/30",
    outline: "bg-transparent text-warning-fg border-warning/40",
    solid: "bg-warning text-fg-inverted border-warning",
    dot: "bg-warning",
  },
  danger: {
    soft: "bg-danger-softer text-danger-fg border-danger/30",
    outline: "bg-transparent text-danger-fg border-danger/40",
    solid: "bg-danger text-fg-inverted border-danger",
    dot: "bg-danger",
  },
  info: {
    soft: "bg-info-softer text-info-fg border-info/30",
    outline: "bg-transparent text-info-fg border-info/40",
    solid: "bg-info text-fg-inverted border-info",
    dot: "bg-info",
  },
};

export function Badge({
  tone = "neutral",
  variant = "soft",
  children,
  className,
  dotted,
}: GenericBadgeProps) {
  const c = TONE_CLASSES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-sops",
        c[variant],
        className
      )}
    >
      {dotted ? <span className={cn("dot", c.dot)} aria-hidden /> : null}
      {children}
    </span>
  );
}
