"use client";
import { useQuery } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";

interface ExRow { exception_id: string; category: string; severity: string; title: string; created_at: string; }

const INTEGRATIONS = [
  { key: "lionwheel", label: "LionWheel", categories: ["lionwheel_unknown_sku", "lionwheel_schema_drift", "lionwheel_auth_failure", "lionwheel_stale"] },
  { key: "shopify", label: "Shopify", categories: ["shopify_unmapped_item", "shopify_drift", "shopify_auth_failure", "shopify_stale"] },
  { key: "green_invoice", label: "Green Invoice", categories: ["gi_unmapped_supplier", "gi_stale"] },
  { key: "freshness", label: "Freshness / Heartbeat", categories: ["freshness_heartbeat", "stale_integration"] },
];

export default function AdminIntegrationsPage() {
  const { data = [], isLoading } = useQuery<ExRow[]>({
    queryKey: ["exceptions-all-open"],
    queryFn: async () => {
      const res = await fetch("/api/exceptions?statuses=open,acknowledged");
      if (!res.ok) throw new Error("Failed");
      const d = await res.json();
      return d.rows ?? [];
    },
  });

  return (
    <>
      <WorkflowHeader eyebrow="Admin" title="Integration Health" description="Derived from open exceptions. Green = no open critical/warning exceptions for this integration." />
      {isLoading && <p className="text-sm text-muted-foreground p-4">Loading…</p>}
      {INTEGRATIONS.map((intg) => {
        const relevant = data.filter(e => intg.categories.includes(e.category));
        const hasCritical = relevant.some(e => e.severity === "critical");
        const hasWarning = relevant.some(e => e.severity === "warning");
        const statusColor = hasCritical ? "text-red-700" : hasWarning ? "text-amber-700" : "text-green-700";
        const statusLabel = hasCritical ? "CRITICAL" : hasWarning ? "WARNING" : "OK";
        return (
          <SectionCard key={intg.key} eyebrow="Integration" title={intg.label}>
            <div className="flex items-center gap-3 mb-2">
              <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
              <span className="text-sm text-muted-foreground">{relevant.length} open exception{relevant.length !== 1 ? "s" : ""}</span>
            </div>
            {relevant.length > 0 && (
              <ul className="text-xs space-y-1">
                {relevant.slice(0, 5).map(e => (
                  <li key={e.exception_id} className="text-muted-foreground">
                    <span className="font-mono">{e.category}</span> — {e.title} <span className="opacity-50">({new Date(e.created_at).toLocaleDateString()})</span>
                  </li>
                ))}
                {relevant.length > 5 && <li className="opacity-50">+{relevant.length - 5} more → see Exceptions Inbox</li>}
              </ul>
            )}
          </SectionCard>
        );
      })}
    </>
  );
}
