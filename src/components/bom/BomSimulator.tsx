"use client";

// ---------------------------------------------------------------------------
// BOM production quantity simulator — Loop 3 BOM program.
//
// Usage: embed below the lines table on the BOM version detail page.
// The component is display-only — it fires a GET request to the simulator
// endpoint and renders the exploded component requirements with visible math.
//
// Props:
//   headId      — bom_head_id (e.g. "BOM-BASE-AME-REG")
//   baseOutputQty  — head.final_bom_output_qty (string numeric)
//   outputUom      — head.final_bom_output_uom (string | null)
//   versionLabel   — active version label for display
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Calculator, AlertTriangle, ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";

interface SimulatorLine {
  line_no: number;
  component_id: string;
  component_name: string;
  component_uom: string | null;
  base_component_qty: string;
  unit_ratio: string;
  required_qty: string;
  formula: string;
}

interface SimulateResponse {
  bom_head_id: string;
  item_name: string | null;
  active_version_id: string;
  version_label: string;
  base_output_qty: string;
  output_uom: string | null;
  target_qty: number;
  math_note: string;
  lines: SimulatorLine[];
  warnings: string[];
}

interface SimulateError {
  reason_code: string;
  detail: string;
}

function formatQty(raw: string): string {
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  // Up to 4 decimal places, strip trailing zeros
  return parseFloat(n.toFixed(4)).toString();
}

interface BomSimulatorProps {
  headId: string;
  baseOutputQty: string;
  outputUom: string | null;
  hasActiveVersion: boolean;
}

export function BomSimulator({
  headId,
  baseOutputQty,
  outputUom,
  hasActiveVersion,
}: BomSimulatorProps): JSX.Element {
  const [targetQty, setTargetQty] = useState<string>(baseOutputQty);
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runSimulation() {
    const qty = parseFloat(targetQty);
    if (isNaN(qty) || qty <= 0) {
      setError("Target quantity must be a positive number.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const url = `/api/boms/heads/${encodeURIComponent(headId)}/simulate?qty=${qty}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const json = await res.json();
      if (!res.ok) {
        const e = json as SimulateError;
        setError(`${e.reason_code}: ${e.detail}`);
      } else {
        setResult(json as SimulateResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  if (!hasActiveVersion) {
    return (
      <SectionCard
        eyebrow="Simulator"
        title="Production quantity simulator"
        tone="warning"
        contentClassName="px-4 py-3"
      >
        <p className="text-sm text-warning-fg">
          No active BOM version — publish a draft version to enable the
          simulator.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      eyebrow="Simulator"
      title="Production quantity simulator"
      contentClassName="p-4 space-y-4"
    >
      {/* Input row */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
            Target production qty ({outputUom ?? "units"})
          </label>
          <input
            type="number"
            min="0.001"
            step="any"
            value={targetQty}
            onChange={(e) => setTargetQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSimulation();
            }}
            className="input h-9 w-40 font-mono tabular-nums"
            placeholder={baseOutputQty}
          />
        </div>
        <button
          type="button"
          className="btn-primary inline-flex h-9 items-center gap-1.5"
          onClick={() => void runSimulation()}
          disabled={loading}
        >
          <Calculator className="h-3.5 w-3.5" strokeWidth={2} />
          {loading ? "Calculating…" : "Simulate"}
        </button>
        {result ? (
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <ChevronRight className="h-3 w-3 text-fg-faint" strokeWidth={2} />
            Base BOM output: {baseOutputQty} {outputUom ?? ""}
          </div>
        ) : null}
      </div>

      {/* Error */}
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Warnings */}
      {result && result.warnings.length > 0 ? (
        <div className="rounded-md border border-warning/40 bg-warning-softer p-3 text-xs text-warning-fg">
          {result.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      ) : null}

      {/* Results */}
      {result ? (
        <div className="space-y-2">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/70 bg-bg-subtle/50 px-3 py-2">
            <Badge tone="info" dotted>
              {result.target_qty} {result.output_uom ?? "units"} of output
            </Badge>
            <span className="text-3xs font-mono text-fg-muted">
              {result.math_note}
            </span>
          </div>

          {/* Lines table */}
          {result.lines.length === 0 ? (
            <p className="text-sm text-warning-fg">
              No component lines found on the active version.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/50">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-bg-subtle/60">
                    <SimTh>#</SimTh>
                    <SimTh>Component</SimTh>
                    <SimTh align="right">
                      BOM qty (per {baseOutputQty} {outputUom ?? ""})
                    </SimTh>
                    <SimTh align="right">Required qty</SimTh>
                    <SimTh>Unit</SimTh>
                    <SimTh>Formula</SimTh>
                  </tr>
                </thead>
                <tbody>
                  {result.lines.map((line) => (
                    <tr
                      key={line.line_no}
                      className="border-b border-border/30 last:border-b-0 hover:bg-bg-subtle/30"
                    >
                      <td className="px-3 py-2 text-xs tabular-nums text-fg-muted">
                        {line.line_no}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-fg">
                          {line.component_name}
                        </div>
                        <div className="text-3xs font-mono text-fg-subtle">
                          {line.component_id}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg-muted">
                        {formatQty(line.base_component_qty)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums text-fg">
                        {formatQty(line.required_qty)}
                      </td>
                      <td className="px-3 py-2 text-xs text-fg-muted">
                        {line.component_uom ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="cursor-help rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-3xs text-fg-subtle"
                          title={`unit rate = ${line.unit_ratio}`}
                        >
                          {line.formula}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !loading && !error ? (
        <p className="text-xs text-fg-muted">
          Enter a production quantity and click Simulate to see exploded
          component requirements.
        </p>
      ) : null}
    </SectionCard>
  );
}

function SimTh({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}): JSX.Element {
  return (
    <th
      className={`px-3 py-2 text-3xs font-semibold uppercase tracking-sops text-fg-subtle ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
