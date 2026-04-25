"use client";

import { type ReactNode } from "react";
import { Badge } from "@/components/badges/StatusBadge";

export interface CompletenessItem {
  label: string;
  status: "ok" | "warn" | "error" | "na";
  detail?: string;
}

interface MasterSummaryCardProps {
  name: string;
  code: string;
  entityType: string;
  status: string;
  completeness: CompletenessItem[];
  actions?: ReactNode;
}

function statusTone(status: string): "success" | "warning" | "neutral" {
  if (status === "ACTIVE") return "success";
  if (status === "PENDING") return "warning";
  return "neutral";
}

function statusLabel(status: string): string {
  if (status === "ACTIVE") return "Active";
  if (status === "PENDING") return "Pending review";
  if (status === "INACTIVE") return "Archived";
  return status;
}

function CompletenessIcon({ status }: { status: CompletenessItem["status"] }) {
  if (status === "ok") return <span aria-hidden>✅</span>;
  if (status === "warn") return <span aria-hidden>⚠️</span>;
  if (status === "error") return <span aria-hidden>❌</span>;
  return <span aria-hidden className="text-fg-subtle">—</span>;
}

export function MasterSummaryCard({
  name,
  code,
  entityType,
  status,
  completeness,
  actions,
}: MasterSummaryCardProps) {
  return (
    <div className="rounded-lg border border-border bg-bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <Badge tone={statusTone(status)} dotted>
              {statusLabel(status)}
            </Badge>
            <span className="text-xs text-fg-subtle">{entityType}</span>
          </div>
          <h2 className="text-lg font-semibold text-fg-strong leading-tight">{name}</h2>
          <p className="text-xs font-mono text-fg-muted mt-0.5">{code}</p>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>

      {completeness.length > 0 ? (
        <div className="border-t border-border/60 pt-3 space-y-1">
          {completeness.map((item) => (
            <div key={item.label} className="flex items-start gap-2 text-sm">
              <CompletenessIcon status={item.status} />
              <span className="text-fg-muted">
                {item.label}
                {item.detail ? (
                  <span className="text-fg-subtle"> — {item.detail}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
