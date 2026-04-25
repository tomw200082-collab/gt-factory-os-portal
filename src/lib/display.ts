const SUPPLY_METHOD_LABELS: Record<string, string> = {
  MANUFACTURED: "Manufactured",
  REPACK: "Repack",
  BOUGHT_FINISHED: "Purchased finished",
};

export function fmtSupplyMethod(s: string | null | undefined): string {
  if (!s) return "—";
  return SUPPLY_METHOD_LABELS[s] ?? s;
}

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  GR_POSTED: "Goods Receipt",
  WASTE_POSTED: "Waste / Adjustment",
  production_output: "Production Output",
  production_consumption: "Production Consumption",
  production_scrap: "Production Scrap",
};

export function fmtMovementType(s: string | null | undefined): string {
  if (!s) return "—";
  return MOVEMENT_TYPE_LABELS[s] ?? s;
}
