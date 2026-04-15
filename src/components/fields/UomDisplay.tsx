import type { Uom } from "@/lib/contracts/enums";

// Phase A reconciliation: keys reconciled to the uppercase UOM constants
// from enums.ts (sourced from 0001_domains_and_schemas.sql). Full 13-code
// set. Display strings remain lowercase for operational density; only
// the map keys changed.
const SYMBOL: Record<Uom, string> = {
  KG: "kg",
  L: "L",
  UNIT: "ea",
  G: "g",
  MG: "mg",
  TON: "t",
  ML: "mL",
  PCS: "pcs",
  BAG: "bag",
  CASE: "case",
  BOX: "box",
  BOTTLE: "btl",
  TIN: "tin",
};

export function UomDisplay({ unit }: { unit: Uom }) {
  return (
    <span className="font-mono text-2xs uppercase text-fg-muted">
      {SYMBOL[unit]}
    </span>
  );
}
