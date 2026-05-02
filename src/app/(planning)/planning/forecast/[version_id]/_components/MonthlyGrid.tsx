"use client";

// ---------------------------------------------------------------------------
// Forecast version detail — Monthly Grid (sparse).
//
// Owner: W2 Mode B-ForecastMonthly-Redesign (Wave 2 chunks 4 + 5, plan
// §Task 4.1.3).
//
// Sparse grid layout (only items the planner has added are rows):
//
//   | Item                  | May 2026         | Jun 2026         |
//   |-----------------------|------------------|------------------|
//   | DETOX 1L NO SUGAR     | [200] [editable] | [50]  [editable] |
//   | FRESH 1L              | —                | [70]  [editable] |
//
// Cell rules (Tom-locked, post-amendment 2026-05-02):
//   - Every month in the horizon is editable. No frozen-month UX. Data-layer
//     freeze (publish_at) is unchanged — but the planner can edit any draft
//     month (including current month) at any time per Tom verbatim:
//     "צריך תמיד אפשרות לעדכן ולמטב את התחזית בכל זמן נתון של כל חודש."
//   - Editable → numeric input, integer-only via min=0 step=1 + onChange
//     normalization; right-aligned; tabular-nums; transparent bg until focus
//   - Empty / zero → renders "—" when not focused
//   - Read-only fallback only when isEditable=false (e.g., published or
//     viewer role). No per-bucket read-only branch.
//
// Per-row trash icon → onItemRemove(item_id) — confirms via simple confirm()
// dialog (operator-grade; can upgrade to portal modal later).
//
// English LTR per Tom-locked global standard 2026-05-01.
// ---------------------------------------------------------------------------

import { Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatQty } from "../_lib/format";
import type { MonthBucket } from "../_lib/format";

export interface ForecastLineLite {
  line_id: string;
  item_id: string;
  period_bucket_key: string;
  forecast_quantity: string;
}

export interface ItemForGrid {
  item_id: string;
  item_name: string;
  supply_method: string;
}

interface MonthlyGridProps {
  /** Items in display order (sparse). */
  items: ItemForGrid[];
  /** All forecast lines for the version. Sparse. */
  lines: ForecastLineLite[];
  /** Locally-edited cell values keyed by `${item_id}|${bucket_key}`. */
  localCells: Record<string, string>;
  /** Items that were added in this session but have no lines yet. Highlighted. */
  freshlyAddedItemIds: Set<string>;
  /** Bucket columns. Pre-computed by parent (computeMonthBuckets). */
  buckets: MonthBucket[];
  /** Author may edit (planner / admin on draft). Every bucket is editable when this is true. */
  isEditable: boolean;
  /** Cell edit. value is the raw string (parent normalizes via auto-save). */
  onCellEdit: (itemId: string, bucketKey: string, value: string) => void;
  /** Remove an item (deletes all lines for that item; parent handles confirm + delete). */
  onItemRemove: (itemId: string) => void;
}

export function MonthlyGrid(props: MonthlyGridProps) {
  const {
    items,
    lines,
    localCells,
    freshlyAddedItemIds,
    buckets,
    isEditable,
    onCellEdit,
    onItemRemove,
  } = props;

  // Build a fast lookup: (item_id, bucket_key) → forecast_quantity.
  const linesByCell = new Map<string, string>();
  for (const l of lines) {
    linesByCell.set(`${l.item_id}|${l.period_bucket_key}`, l.forecast_quantity);
  }

  return (
    <div className="overflow-x-auto" data-testid="forecast-monthly-grid">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/70 bg-bg-subtle/60">
            <th
              scope="col"
              className="sticky left-0 z-[1] min-w-[260px] bg-bg-subtle/80 px-4 py-2.5 text-left text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
            >
              Item
            </th>
            {buckets.map((b) => (
              <th
                key={b.key}
                scope="col"
                className="min-w-[120px] px-3 py-2.5 text-right font-mono text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
                data-testid="forecast-grid-bucket-header"
                data-bucket={b.key}
                title={b.label}
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>{b.label}</span>
                </div>
              </th>
            ))}
            {isEditable ? (
              <th
                scope="col"
                className="w-[44px] bg-bg-subtle/80 px-2 py-2.5 text-right text-3xs font-semibold uppercase tracking-sops text-fg-subtle"
              >
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isFresh = freshlyAddedItemIds.has(item.item_id);
            return (
              <tr
                key={item.item_id}
                className={cn(
                  "border-b border-border/40 transition-colors duration-150",
                  isFresh && "bg-accent-soft/15",
                )}
                data-testid="forecast-grid-row"
                data-item-id={item.item_id}
              >
                <td className="sticky left-0 z-[1] min-w-[260px] bg-bg-raised px-4 py-2 text-xs">
                  <div className="font-medium leading-tight text-fg">
                    {item.item_name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 font-mono text-3xs text-fg-faint">
                    <span>{item.item_id}</span>
                    <SupplyMethodChip supplyMethod={item.supply_method} />
                  </div>
                </td>
                {buckets.map((b) => {
                  const cellKey = `${item.item_id}|${b.key}`;
                  const persisted = linesByCell.get(cellKey) ?? "";
                  const local = localCells[cellKey];
                  const displayValue = local !== undefined ? local : persisted;
                  const readonly = !isEditable;

                  return (
                    <td
                      key={b.key}
                      className="p-0"
                      data-testid="forecast-grid-cell"
                      data-item-id={item.item_id}
                      data-bucket={b.key}
                    >
                      {readonly ? (
                        <span className="block min-w-[100px] px-3 py-2 text-right font-mono text-sm tabular-nums text-fg transition-colors duration-150">
                          {formatQty(displayValue)}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={displayValue}
                          onChange={(e) => {
                            // Strip any decimal portion the user types (Tom-lock:
                            // integer-only display). The backend still stores
                            // qty_8dp internally; the UI just enforces integer.
                            const raw = e.target.value;
                            // Allow empty string while user clears the cell.
                            if (raw === "") {
                              onCellEdit(item.item_id, b.key, "");
                              return;
                            }
                            const n = Number(raw);
                            if (!Number.isFinite(n) || n < 0) return;
                            // Round-trip through Math.floor to enforce integer
                            // input. The backend will accept an integer string
                            // for qty_8dp without precision loss.
                            const intStr = String(Math.floor(n));
                            onCellEdit(item.item_id, b.key, intStr);
                          }}
                          placeholder="—"
                          className="h-10 w-full min-w-[100px] border-0 bg-transparent px-3 text-right font-mono text-sm tabular-nums outline-none transition-colors duration-150 focus:bg-accent-soft/30 focus:text-fg-strong"
                          data-testid="forecast-grid-input"
                          aria-label={`${item.item_name} — ${b.label}`}
                        />
                      )}
                    </td>
                  );
                })}
                {isEditable ? (
                  <td className="bg-bg-raised p-0 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        // Confirm before deleting all the item's lines. Cheap
                        // operator-grade prompt; portal-grade modal is a
                        // future polish.
                        const ok = window.confirm(
                          `Remove "${item.item_name}" from this forecast? This deletes its ${buckets.length} cell${buckets.length === 1 ? "" : "s"}.`,
                        );
                        if (!ok) return;
                        onItemRemove(item.item_id);
                      }}
                      className="m-1 inline-flex h-7 w-7 items-center justify-center rounded text-fg-faint transition-colors duration-150 hover:bg-danger-softer hover:text-danger-fg"
                      title={`Remove ${item.item_name} from forecast`}
                      data-testid="forecast-grid-row-remove"
                      aria-label={`Remove ${item.item_name} from forecast`}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supply-method chip — "Buy" (BOUGHT_FINISHED) vs "Make" (MANUFACTURED/REPACK)
// ---------------------------------------------------------------------------

function SupplyMethodChip({ supplyMethod }: { supplyMethod: string }) {
  const isMake = supplyMethod === "MANUFACTURED" || supplyMethod === "REPACK";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1 py-px font-sans text-3xs font-semibold uppercase tracking-sops",
        isMake
          ? "border-info/40 bg-info-softer text-info-fg"
          : "border-warning/40 bg-warning-softer text-warning-fg",
      )}
      title={
        isMake
          ? "Manufactured — forecasting demand here drives a production recommendation."
          : "Bought-finished — forecasting demand here drives a purchase recommendation."
      }
    >
      {isMake ? "Make" : "Buy"}
    </span>
  );
}
