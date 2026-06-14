"use client";

// ---------------------------------------------------------------------------
// Admin · Purchase Orders · Parity Check  (iters 17-20)
// Calls GET /api/purchase-orders/parity-check (admin only).
// Shows drift between purchase_orders.status and the status derived from lines.
//
// Iter 17 — audit: drift summary header + two table sections mapped.
// Iter 18 — health card: "X POs with status drift" (danger / success) +
//           "Y POs with no lines" (warning / success) rendered as KPI chips
//           before the tables; run metadata line.
// Iter 19 — drift table: PO ID links to /admin/purchase-orders/[po_id];
//           actual vs derived rendered as two Badges with → arrow between;
//           note column present; no-lines table gets its own card.
// Iter 20 — TypeCheck clean.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { useState } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { EmptyState, ErrorState } from "@/components/feedback/states";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
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

function statusTone(s: string): "success" | "danger" | "warning" | "neutral" {
  const l = s.toLowerCase();
  if (l === "closed" || l === "received" || l === "completed") return "success";
  if (l === "cancelled" || l === "canceled") return "neutral";
  if (l === "open" || l === "partial") return "warning";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Iter 18 — Health summary chips
// ---------------------------------------------------------------------------

interface HealthSummaryProps {
  result: ParityCheckResponse;
}

function HealthSummary({ result }: HealthSummaryProps) {
  const hasDrift = result.drift_count > 0;
  const hasNoLines = result.no_lines_count > 0;
  const allClear = !hasDrift && !hasNoLines;

  return (
    <div className="flex flex-wrap gap-2">
      {/* Drift chip */}
      <div
        className={cn(
          "flex min-w-[9rem] flex-1 flex-col gap-0.5 rounded-md border px-3 py-2",
          hasDrift
            ? "border-danger/40 bg-danger-softer"
            : "border-success/40 bg-success-softer",
        )}
      >
        <div className="flex items-center gap-1.5">
          {hasDrift ? (
            <AlertOctagon className="h-3.5 w-3.5 shrink-0 text-danger-fg" strokeWidth={2} />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success-fg" strokeWidth={2} />
          )}
          <span
            className={cn(
              "text-lg font-bold tabular-nums leading-none",
              hasDrift ? "text-danger-fg" : "text-success-fg",
            )}
          >
            {result.drift_count}
          </span>
        </div>
        <span
          className={cn(
            "text-3xs font-semibold uppercase tracking-sops",
            hasDrift ? "text-danger-fg/80" : "text-success-fg/80",
          )}
        >
          {result.drift_count === 1 ? "PO with status drift" : "POs with status drift"}
        </span>
      </div>

      {/* No-lines chip */}
      <div
        className={cn(
          "flex min-w-[9rem] flex-1 flex-col gap-0.5 rounded-md border px-3 py-2",
          hasNoLines
            ? "border-warning/40 bg-warning-softer"
            : "border-success/40 bg-success-softer",
        )}
      >
        <div className="flex items-center gap-1.5">
          {hasNoLines ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-fg" strokeWidth={2} />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success-fg" strokeWidth={2} />
          )}
          <span
            className={cn(
              "text-lg font-bold tabular-nums leading-none",
              hasNoLines ? "text-warning-fg" : "text-success-fg",
            )}
          >
            {result.no_lines_count}
          </span>
        </div>
        <span
          className={cn(
            "text-3xs font-semibold uppercase tracking-sops",
            hasNoLines ? "text-warning-fg/80" : "text-success-fg/80",
          )}
        >
          {result.no_lines_count === 1 ? "PO with no lines" : "POs with no lines"}
        </span>
      </div>

      {/* Checked chip */}
      <div className="flex min-w-[9rem] flex-1 flex-col gap-0.5 rounded-md border border-border/40 bg-bg-subtle/40 px-3 py-2">
        <span className="text-lg font-bold tabular-nums leading-none text-fg-strong">
          {result.checked_count}
        </span>
        <span className="text-3xs font-semibold uppercase tracking-sops text-fg-muted">
          POs checked
        </span>
      </div>

      {/* All-clear banner */}
      {allClear && (
        <div className="flex w-full items-center gap-2 rounded-md border border-success/40 bg-success-softer px-3 py-2 text-sm text-success-fg">
          <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span className="font-medium">All clear — every PO status matches its derived status from lines.</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Iter 19 — Drift table (linked PO, two-badge status comparison, note column)
// ---------------------------------------------------------------------------

function DriftTable({ rows }: { rows: ParityDriftRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/70 bg-bg-subtle/60">
            <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              PO
            </th>
            <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Actual → Derived
            </th>
            <th scope="col" className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Lines
            </th>
            <th scope="col" className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Non-cancelled
            </th>
            <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Note
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.po_id}
              className="border-b border-border/40 last:border-b-0 hover:bg-bg-subtle/40"
            >
              {/* PO column — linked */}
              <td className="px-3 py-2">
                <Link
                  href={`/purchase-orders/${r.po_id}`}
                  className="font-mono text-xs font-medium text-accent-fg underline-offset-2 hover:underline"
                >
                  {r.po_number}
                </Link>
              </td>

              {/* Iter 19 — actual → derived as two badges with arrow */}
              <td className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  <Badge tone={statusTone(r.actual_status)} dotted>
                    {r.actual_status}
                  </Badge>
                  <span className="text-fg-faint text-xs" aria-hidden="true">→</span>
                  {r.derived_status ? (
                    <Badge tone={statusTone(r.derived_status)}>
                      {r.derived_status}
                    </Badge>
                  ) : (
                    <span className="text-fg-faint text-xs italic">no derived</span>
                  )}
                </div>
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
  );
}

// No-lines table: simpler — just PO link + line_count + note
function NoLinesTable({ rows }: { rows: ParityDriftRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/70 bg-bg-subtle/60">
            <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              PO
            </th>
            <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Status
            </th>
            <th scope="col" className="px-3 py-2 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Lines
            </th>
            <th scope="col" className="px-3 py-2 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              Note
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.po_id}
              className="border-b border-border/40 last:border-b-0 bg-warning-softer/20 hover:bg-warning-softer/40"
            >
              <td className="px-3 py-2">
                <Link
                  href={`/purchase-orders/${r.po_id}`}
                  className="font-mono text-xs font-medium text-accent-fg underline-offset-2 hover:underline"
                >
                  {r.po_number}
                </Link>
              </td>
              <td className="px-3 py-2 text-xs">
                <Badge tone={statusTone(r.actual_status)} dotted>
                  {r.actual_status}
                </Badge>
              </td>
              <td className="px-3 py-2 text-right text-xs tabular-nums text-fg-muted">
                {r.line_count}
              </td>
              <td className="px-3 py-2 font-mono text-3xs text-fg-faint">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Parity check failed. Check your connection and try again.");
      }
      setResult(await res.json() as ParityCheckResponse);
    } catch (e) {
      setError((e as Error).message ?? "Check failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const totalIssues = result ? result.drift_count + result.no_lines_count : 0;

  return (
    <>
      <WorkflowHeader
        eyebrow="Admin · Purchase Orders"
        title="PO Parity Check"
        description="Verifies that each purchase order's header status matches what its receipt lines indicate. Any mismatch requires investigation."
        meta={
          result ? (
            <>
              <Badge tone={totalIssues > 0 ? "danger" : "success"} dotted>
                {totalIssues > 0 ? `${totalIssues} issue${totalIssues === 1 ? "" : "s"}` : "clean"}
              </Badge>
              <Badge tone="neutral" dotted>
                {result.checked_count} {result.checked_count === 1 ? "PO" : "POs"} checked
              </Badge>
              <Badge tone="neutral" variant="outline">
                {fmtDateTime(result.run_at)}
              </Badge>
            </>
          ) : null
        }
        actions={
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void runCheck()}
            disabled={loading}
          >
            {loading ? "Running…" : result ? "Run again" : "Run parity check"}
          </button>
        }
      />

      {/* Pre-run state */}
      {!result && !loading && !error && (
        <SectionCard>
          <EmptyState
            title="No parity check run yet"
            description='Click "Run parity check" to verify purchase order status consistency. This is a read-only diagnostic — no data is changed.'
            action={
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void runCheck()}
                disabled={loading}
              >
                Run parity check
              </button>
            }
          />
        </SectionCard>
      )}

      {/* Error state */}
      {error && (
        <SectionCard tone="danger">
          <ErrorState
            title="Parity check failed"
            description={error}
            action={
              <button
                type="button"
                onClick={() => void runCheck()}
                disabled={loading}
                className="btn btn-sm"
              >
                Retry
              </button>
            }
          />
        </SectionCard>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Iter 18 — health summary chips */}
          <SectionCard contentClassName="p-3 sm:p-4">
            <HealthSummary result={result} />
            {totalIssues === 0 && (
              <div className="mt-3">
                <Link href="/purchase-orders" className="btn btn-sm">
                  Back to Purchase Orders
                </Link>
              </div>
            )}
          </SectionCard>

          {/* Iter 19 — drift table */}
          {result.drift_rows.length > 0 && (
            <SectionCard
              tone="danger"
              eyebrow="Status drift"
              title={`${result.drift_count} ${result.drift_count === 1 ? "PO" : "POs"} with status drift`}
              description="The header status does not match the status derived from its receipt lines. Review and correct each PO."
              contentClassName="p-0"
            >
              <DriftTable rows={result.drift_rows} />
            </SectionCard>
          )}

          {/* Iter 19 — no-lines table */}
          {result.no_lines_rows.length > 0 && (
            <SectionCard
              tone="warning"
              eyebrow="No lines"
              title={`${result.no_lines_count} ${result.no_lines_count === 1 ? "PO" : "POs"} with no lines`}
              description="These POs have no receipt lines attached. They may have been created without line items or had lines deleted."
              contentClassName="p-0"
            >
              <NoLinesTable rows={result.no_lines_rows} />
            </SectionCard>
          )}
        </div>
      )}
    </>
  );
}
