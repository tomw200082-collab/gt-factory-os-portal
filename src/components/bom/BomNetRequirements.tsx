"use client";

// ---------------------------------------------------------------------------
// BOM net requirements / purchase assistant — Loop 4 BOM program.
//
// Shows gross requirements minus current on-hand stock, revealing what
// must be purchased to fulfill a given production quantity.
//
// Strictly read-only. Does NOT create POs or purchase recs — it surfaces
// the shortage so the operator can make an informed decision.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  HelpCircle,
  Info,
  ChevronRight,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";

type CoverageStatus = "covered" | "partial" | "not_covered" | "no_stock_data";

interface NetLine {
  line_no: number;
  component_id: string;
  component_name: string;
  component_uom: string | null;
  gross_required_qty: string;
  formula: string;
  available_qty: string;
  available_source: string;
  net_shortage_qty: string;
  coverage_status: CoverageStatus;
  coverage_pct: string;
  supplier_id: string | null;
  supplier_short: string | null;
  supplier_phone: string | null;
}

interface NetRequirementsResponse {
  bom_head_id: string;
  bom_type: string | null;
  item_name: string | null;
  active_version_id: string;
  version_label: string;
  target_qty: number;
  output_uom: string | null;
  base_output_qty: string;
  total_lines: number;
  lines_covered: number;
  lines_partial: number;
  lines_not_covered: number;
  lines_no_stock_data: number;
  availability_note: string;
  open_po_qty_note: string;
  balances_as_of: string | null;
  lines: NetLine[];
  warnings: string[];
}

function formatQty(raw: string): string {
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  return parseFloat(n.toFixed(4)).toString();
}

function CoverageIcon({
  status,
}: {
  status: CoverageStatus;
}): JSX.Element {
  if (status === "covered")
    return (
      <CheckCircle2
        className="h-3.5 w-3.5 text-success-fg"
        strokeWidth={2}
      />
    );
  if (status === "partial")
    return (
      <MinusCircle
        className="h-3.5 w-3.5 text-warning-fg"
        strokeWidth={2}
      />
    );
  if (status === "not_covered")
    return (
      <AlertTriangle
        className="h-3.5 w-3.5 text-danger-fg"
        strokeWidth={2}
      />
    );
  return (
    <HelpCircle className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
  );
}

function CoverageBadge({ status }: { status: CoverageStatus }): JSX.Element {
  const label =
    status === "covered"
      ? "Covered"
      : status === "partial"
        ? "Partial"
        : status === "not_covered"
          ? "Shortage"
          : "No data";
  const tone =
    status === "covered"
      ? "success"
      : status === "partial"
        ? "warning"
        : status === "not_covered"
          ? "danger"
          : "neutral";
  return (
    <Badge tone={tone} dotted>
      <CoverageIcon status={status} />
      <span className="ml-1">{label}</span>
    </Badge>
  );
}

interface BomNetRequirementsProps {
  headId: string;
  baseOutputQty: string;
  outputUom: string | null;
  hasActiveVersion: boolean;
  suggestedQty?: string;
}

export function BomNetRequirements({
  headId,
  baseOutputQty,
  outputUom,
  hasActiveVersion,
  suggestedQty,
}: BomNetRequirementsProps): JSX.Element {
  const [targetQty, setTargetQty] = useState<string>(baseOutputQty);
  const [result, setResult] = useState<NetRequirementsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const runNetReqForQty = useCallback(
    async (qty: number) => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/boms/heads/${encodeURIComponent(headId)}/net-requirements?qty=${qty}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        const json = await res.json();
        if (!res.ok) {
          setError(
            `${(json as { reason_code?: string }).reason_code ?? "ERROR"}: ${(json as { detail?: string }).detail ?? JSON.stringify(json)}`,
          );
        } else {
          setResult(json as NetRequirementsResponse);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
      } finally {
        setLoading(false);
      }
    },
    [headId],
  );

  // Auto-trigger coverage check when the simulator fires a suggestedQty.
  useEffect(() => {
    if (!suggestedQty) return;
    const qty = parseFloat(suggestedQty);
    if (isNaN(qty) || qty <= 0) return;
    setTargetQty(suggestedQty);
    void runNetReqForQty(qty);
  }, [suggestedQty, runNetReqForQty]);

  async function runNetReq() {
    const qty = parseFloat(targetQty);
    if (isNaN(qty) || qty <= 0) {
      setError("Target quantity must be a positive number.");
      return;
    }
    await runNetReqForQty(qty);
  }

  const isStale =
    result !== null &&
    !loading &&
    parseFloat(targetQty) !== result.target_qty;

  if (!hasActiveVersion) {
    return (
      <SectionCard
        eyebrow="Purchase assistant"
        title="Net requirements"
        tone="warning"
        contentClassName="px-4 py-3"
      >
        <p className="text-sm text-warning-fg">
          No active BOM version — net requirements require an active version.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      eyebrow="Purchase assistant"
      title="Net requirements"
      contentClassName="p-4 space-y-4"
    >
      <p className="text-xs text-fg-muted">
        Subtracts current on-hand stock from gross component requirements.
        Shows what is covered and what needs to be purchased.
      </p>

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
              if (e.key === "Enter") void runNetReq();
            }}
            className="input h-9 w-40 font-mono tabular-nums"
            placeholder={baseOutputQty}
          />
        </div>
        <button
          type="button"
          className="btn-primary inline-flex h-9 items-center gap-1.5"
          onClick={() => void runNetReq()}
          disabled={loading}
        >
          <ShoppingCart className="h-3.5 w-3.5" strokeWidth={2} />
          {loading ? "Calculating…" : "Check coverage"}
        </button>
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <ChevronRight className="h-3 w-3 text-fg-faint" strokeWidth={2} />
          Base batch: {baseOutputQty} {outputUom ?? "units"}
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger-softer p-3 text-sm text-danger-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Results */}
      {result ? (
        <div className={`space-y-3 ${isStale ? "opacity-60" : ""}`}>
          {/* Staleness banner */}
          {isStale ? (
            <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning-softer px-3 py-2 text-xs text-warning-fg">
              <RefreshCw className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Quantity changed — click Check coverage to update.
            </div>
          ) : null}
          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/70 bg-bg-subtle/50 px-3 py-2">
            {result.item_name ? (
              <span className="text-sm font-semibold text-fg">
                {result.item_name}
              </span>
            ) : null}
            <Badge tone="info" dotted>
              {result.target_qty} {result.output_uom ?? "units"}
            </Badge>
            <Badge tone="success" dotted>
              v{result.version_label}
            </Badge>
            <span className="text-xs font-semibold text-fg">
              {result.total_lines} components:
            </span>
            {result.lines_covered > 0 && (
              <Badge tone="success" dotted>
                {result.lines_covered} covered
              </Badge>
            )}
            {result.lines_partial > 0 && (
              <Badge tone="warning" dotted>
                {result.lines_partial} partial
              </Badge>
            )}
            {result.lines_not_covered > 0 && (
              <Badge tone="danger" dotted>
                {result.lines_not_covered} short
              </Badge>
            )}
            {result.lines_no_stock_data > 0 && (
              <Badge tone="neutral" dotted>
                {result.lines_no_stock_data} no data
              </Badge>
            )}
          </div>

          {/* All-covered confirmation */}
          {result.lines_not_covered === 0 &&
            result.lines_partial === 0 &&
            result.lines_no_stock_data === 0 &&
            result.total_lines > 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success-softer px-3 py-2 text-xs text-success-fg">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              All materials covered — ready to produce.
            </div>
          ) : null}

          {/* Purchase Orders shortcut when shortages exist */}
          {(result.lines_not_covered > 0 || result.lines_partial > 0) ? (
            <div className="flex items-center justify-between rounded-md border border-border/50 bg-bg-subtle/50 px-3 py-2">
              <span className="text-xs text-fg-muted">
                Need to purchase missing materials?
              </span>
              <Link
                href="/purchase-orders"
                className="btn-secondary inline-flex items-center gap-1.5 text-xs"
              >
                <ShoppingCart className="h-3.5 w-3.5" strokeWidth={2} />
                Purchase Orders
              </Link>
            </div>
          ) : null}

          {/* No-stock-data notice */}
          {result.lines_no_stock_data > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-softer/60 px-3 py-2 text-xs text-warning-fg">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              {result.lines_no_stock_data} component{result.lines_no_stock_data === 1 ? "" : "s"} have no stock data — verify on-hand quantities manually before starting production.
            </div>
          ) : null}

          {/* Warnings */}
          {result.warnings.length > 0 ? (
            <div className="rounded-md border border-warning/40 bg-warning-softer p-3 text-xs text-warning-fg">
              {result.warnings.map((w, i) => (
                <div key={i}>{w}</div>
              ))}
            </div>
          ) : null}

          {/* Caveats */}
          <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info-softer/50 px-3 py-2 text-xs text-info-fg">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            <div className="space-y-0.5">
              <div>{result.availability_note}</div>
              {result.balances_as_of ? (
                <div className="text-fg-muted">
                  Stock data as of:{" "}
                  <span className="font-mono">
                    {new Date(result.balances_as_of).toLocaleString()}
                  </span>
                </div>
              ) : null}
              <div>{result.open_po_qty_note}</div>
            </div>
          </div>

          {/* Copy shortage list */}
          {(result.lines_not_covered > 0 || result.lines_partial > 0) ? (
            <div className="flex justify-end">
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-1.5 text-xs"
                onClick={() => {
                  const shortLines = result.lines.filter(
                    (l) => l.coverage_status === "not_covered" || l.coverage_status === "partial",
                  );
                  const header = `Shortage list — ${result.item_name ?? result.bom_head_id} (v${result.version_label}) — ${result.target_qty} ${result.output_uom ?? "units"}`;
                  const rows = shortLines.map((l) => {
                    const shortage = parseFloat(l.net_shortage_qty) > 0
                      ? `short ${formatQty(l.net_shortage_qty)} ${l.component_uom ?? ""}`
                      : "partial";
                    const supplier = l.supplier_short
                      ? `— ${l.supplier_short}${l.supplier_phone ? ` ${l.supplier_phone}` : ""}`
                      : "";
                    return `  • ${l.component_name}: need ${formatQty(l.gross_required_qty)} ${l.component_uom ?? ""}, have ${formatQty(l.available_qty)} ${l.component_uom ?? ""}, ${shortage} ${supplier}`;
                  });
                  const text = [header, "", ...rows].join("\n");
                  void navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-success-fg" strokeWidth={2} />
                ) : (
                  <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                )}
                {copied ? "Copied!" : "Copy shortage list"}
              </button>
            </div>
          ) : null}

          {/* Lines table */}
          {result.lines.length === 0 ? (
            <p className="text-sm text-warning-fg">
              No component lines to evaluate.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/50">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-bg-subtle/60">
                    <Th>#</Th>
                    <Th>Component</Th>
                    <Th align="right">Required</Th>
                    <Th align="right">On-hand</Th>
                    <Th align="right">Net shortage</Th>
                    <Th>Unit</Th>
                    <Th>Coverage</Th>
                    <Th>Supplier</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...result.lines]
                    .sort((a, b) => {
                      const order: Record<CoverageStatus, number> = {
                        not_covered: 0,
                        partial: 1,
                        no_stock_data: 2,
                        covered: 3,
                      };
                      return order[a.coverage_status] - order[b.coverage_status];
                    })
                    .map((line) => (
                      <NetRequirementsRow key={line.line_no} line={line} />
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !loading && !error ? (
        <p className="text-xs text-fg-muted">
          Enter a production quantity and click Check coverage to see
          component availability.
        </p>
      ) : null}
    </SectionCard>
  );
}

function NetRequirementsRow({ line }: { line: NetLine }): JSX.Element {
  const isShort =
    line.coverage_status === "partial" ||
    line.coverage_status === "not_covered";
  const noData = line.coverage_status === "no_stock_data";

  return (
    <tr
      className={`border-b border-border/30 last:border-b-0 ${
        isShort
          ? "bg-danger-softer/20 hover:bg-danger-softer/40"
          : "hover:bg-bg-subtle/30"
      }`}
    >
      <td className="px-3 py-2 text-xs tabular-nums text-fg-muted">
        {line.line_no}
      </td>
      <td className="px-3 py-2">
        <div className="min-w-0 max-w-[200px]">
          <div className="truncate font-medium text-fg" title={line.component_name}>
            {line.component_name}
          </div>
          <div className="truncate text-3xs font-mono text-fg-subtle">
            {line.component_id}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-fg">
        {formatQty(line.gross_required_qty)}
      </td>
      <td
        className={`px-3 py-2 text-right font-mono text-xs tabular-nums ${
          noData ? "text-fg-muted italic" : "text-fg"
        }`}
      >
        {noData ? "—" : formatQty(line.available_qty)}
      </td>
      <td
        className={`px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums ${
          parseFloat(line.net_shortage_qty) > 0
            ? "text-danger-fg"
            : "text-fg-muted"
        }`}
      >
        {parseFloat(line.net_shortage_qty) > 0 ? (
          <>
            {formatQty(line.net_shortage_qty)}
            {line.component_uom ? (
              <span className="ml-1 font-sans text-3xs font-normal text-danger-fg/70">
                {line.component_uom}
              </span>
            ) : null}
          </>
        ) : "—"}
      </td>
      <td className="px-3 py-2 text-xs text-fg-muted">
        {line.component_uom ?? "—"}
      </td>
      <td className="px-3 py-2">
        <CoverageBadge status={line.coverage_status} />
      </td>
      <td className="px-3 py-2">
        {line.supplier_short ? (
          <div>
            <div className="text-xs text-fg">{line.supplier_short}</div>
            {line.supplier_phone ? (
              <a
                href={`tel:${line.supplier_phone.replace(/\s/g, "")}`}
                className="text-3xs font-mono text-accent hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {line.supplier_phone}
              </a>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-fg-muted">—</span>
        )}
      </td>
    </tr>
  );
}

function Th({
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
