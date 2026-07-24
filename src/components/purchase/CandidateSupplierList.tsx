"use client";

// ---------------------------------------------------------------------------
// CandidateSupplierList — the ranked supplier chooser for a raw material
// (tranche 140). Renders the candidate suppliers for one line/PO: the current
// supplier is marked and non-selectable; every alternative is a radio option
// showing its rank badges (primary), per-unit cost, lead time, and a
// click-to-call link. Presentational — selection state is owned by the parent
// (SwitchSupplierControl).
// ---------------------------------------------------------------------------

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatIls } from "@/lib/utils/format-money";
import { cn } from "@/lib/cn";
import { SupplierCallLink } from "./SupplierCallLink";

export interface SupplierCandidate {
  supplier_id: string;
  supplier_name: string;
  phone: string | null;
  is_primary: boolean;
  is_current: boolean;
  unit_cost: number;
  lead_time_days: number | null;
  moq: number | null;
}

interface CandidateSupplierListProps {
  candidates: SupplierCandidate[];
  /** Currently-selected switch target (a non-current supplier_id), or null. */
  selectedId: string | null;
  onSelect: (supplierId: string) => void;
  /** Radio group name — unique per line so multiple lists coexist. */
  groupName: string;
  disabled?: boolean;
}

function meta(c: SupplierCandidate): string {
  const parts: string[] = [];
  // unit_cost is 0 for whole-PO candidates (per-unit cost is undefined across a
  // multi-material basket) — omit it there rather than show "0.00 ₪".
  if (c.unit_cost > 0) parts.push(formatIls(c.unit_cost) + " ליח׳");
  if (c.lead_time_days != null) parts.push(`אספקה ${c.lead_time_days} ימים`);
  if (c.moq != null && c.moq > 0) parts.push(`מ' הזמנה ${c.moq}`);
  return parts.join(" · ");
}

export function CandidateSupplierList({
  candidates,
  selectedId,
  onSelect,
  groupName,
  disabled = false,
}: CandidateSupplierListProps) {
  return (
    <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label="בחירת ספק">
      {candidates.map((c) => {
        const isTarget = selectedId === c.supplier_id;
        const selectable = !c.is_current && !disabled;
        return (
          <li key={c.supplier_id}>
            <label
              className={cn(
                // min-h keeps the whole row a comfortable touch target; the
                // radio is sr-only, so surface its keyboard focus on the label
                // (focus-within) — otherwise keyboard users get no focus cue.
                "flex min-h-[44px] items-start gap-2 rounded-lg border px-3 py-2 transition",
                "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/50",
                c.is_current
                  ? "border-border bg-bg-muted/60"
                  : "cursor-pointer border-border hover:border-accent/60 hover:bg-accent/5",
                isTarget && "border-accent ring-1 ring-accent/40 bg-accent/5",
                disabled && "opacity-60",
              )}
            >
              <input
                type="radio"
                name={groupName}
                className="sr-only"
                checked={isTarget}
                disabled={!selectable}
                onChange={() => selectable && onSelect(c.supplier_id)}
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  isTarget
                    ? "border-accent bg-accent text-white"
                    : "border-border",
                  c.is_current && "opacity-0",
                )}
              >
                {isTarget ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-fg">
                    {c.supplier_name}
                  </span>
                  {c.is_current ? (
                    <Badge tone="neutral" size="xs">
                      נוכחי
                    </Badge>
                  ) : null}
                  {c.is_primary ? (
                    <Badge tone="accent" size="xs" variant="outline">
                      ראשי
                    </Badge>
                  ) : null}
                </span>
                {meta(c) ? (
                  <span className="text-3xs text-fg-muted">{meta(c)}</span>
                ) : null}
                <SupplierCallLink
                  phone={c.phone}
                  supplierName={c.supplier_name}
                  className="mt-0.5"
                />
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
