import { Activity, UserCircle2 } from "lucide-react";
import type { AuditMeta } from "@/lib/contracts/dto";

function formatWhen(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AuditSnippet({ audit }: { audit: AuditMeta }) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded border border-border/60 bg-bg-subtle/50 p-3">
      <AuditRow
        icon={<UserCircle2 className="h-3 w-3" strokeWidth={2} />}
        label="Created"
        value={formatWhen(audit.created_at)}
        who={audit.created_by}
      />
      <AuditRow
        icon={<Activity className="h-3 w-3" strokeWidth={2} />}
        label="Updated"
        value={formatWhen(audit.updated_at)}
        who={audit.updated_by}
      />
      <div>
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Version
        </div>
        <div className="mt-0.5 font-mono text-2xs text-fg-strong">
          v{audit.version}
        </div>
      </div>
      <div>
        <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
          Status
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-fg-strong">
          <span
            className={
              "dot " + (audit.active ? "bg-success" : "bg-fg-faint")
            }
            aria-hidden
          />
          {audit.active ? "Active" : "Archived"}
        </div>
      </div>
    </div>
  );
}

function AuditRow({
  icon,
  label,
  value,
  who,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  who: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-2xs text-fg-strong">{value}</div>
      <div className="text-3xs text-fg-subtle">by {who}</div>
    </div>
  );
}
