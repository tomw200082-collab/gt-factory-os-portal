"use client";

// ---------------------------------------------------------------------------
// Admin · Purchase Orders · Parity Check
// Calls GET /api/purchase-orders/parity-check (admin only).
// Shows drift between purchase_orders.status and the status derived from lines.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState } from "@/components/feedback/states";

interface ParityDriftRow {
  po_id: string;
  po_number: string;
  actual_status: string;
  derived_status: string | null;
  line_count: number;
  non_cancelled_count: number;
  note: string;
}

interface ParityCheckResponse {
  run_at: string;
  checked_count: number;
  drift_count: number;
  no_lines_count: number;
  drift_rows: ParityDriftRow[];
  no_lines_rows: ParityDriftRow[];
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function DriftTable({ rows, title }: { rows: ParityDriftRow[]; title: string }): JSX.Element {
  if (rows.length === 0) return <></>;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-fg px-1">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-bg-subtle/60">
              <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">PO</th>
              <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Actual</th>
              <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Derived</th>
              <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Lines</th>
              <th className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Non-cancelled</th>
              <th className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.po_id}
                className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
              >
                <td className="px-3 py-2 font-mono text-xs text-fg">{r.po_number}</td>
                <td className="px-3 py-2 text-xs">
                  <Badge tone="danger" dotted>{r.actual_status}</Badge>
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.derived_status
                    ? <Badge tone="warning">{r.derived_status}</Badge>
                    : <span className="text-fg-faint">—</span>
                  }
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-fg-muted">
                  {r.line_count}
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-fg-muted">
                  {r.non_cancelled_count}
                </td>
                <td className="px-3 py-2 font-mono text-3xs text-fg-faint">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PoParityCheckPage(): JSX.Element {
  const [result, setResult] = useState<ParityCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/purchase-orders/parity-check", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `Check failed (HTTP ${res.status})`,
        );
      }
      setResult(await res.json() as ParityCheckResponse);
    } catch (e) {
      setError((e as Error).message ?? "Check failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const allClear = result && result.drift_count === 0 && result.no_lines_count === 0;

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · Purchase Orders"
        title="PO parity check"
        description="Verifies that every non-DRAFT purchase_orders.status matches the status derived from its lines. Drift indicates a rollup trigger failure."
        meta={
          result ? (
            <>
              <Badge tone={allClear ? "success" : "danger"} dotted>
                {allClear ? "clean" : `${result.drift_count + result.no_lines_count} drift`}
              </Badge>
              <Badge tone="neutral" dotted>
                {result.checked_count} POs checked
              </Badge>
            </>
          ) : null
        }
      />

      <SectionCard>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void runCheck()}
            disabled={loading}
          >
            {loading ? "Running…" : result ? "Run again" : "Run parity check"}
          </button>
          {error && (
            <span className="text-xs text-danger-fg">{error}</span>
          )}
          {result && (
            <span className="text-xs text-fg-muted">
              Last run: {fmtDateTime(result.run_at)}
            </span>
          )}
        </div>

        {result && (
          <div className="mt-4 space-y-4">
            {allClear ? (
              <EmptyState
                title="All clear — no drift detected."
                description={`${result.checked_count} non-DRAFT POs checked. Every header status matches the derived status from its lines.`}
              />
            ) : (
              <>
                <DriftTable
                  rows={result.drift_rows}
                  title={`Status drift (${result.drift_count})`}
                />
                <DriftTable
                  rows={result.no_lines_rows}
                  title={`POs with no lines (${result.no_lines_count})`}
                />
              </>
            )}
          </div>
        )}
      </SectionCard>
    </>
  );
}
