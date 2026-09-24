const SUPPLY_METHOD_LABELS: Record<string, string> = {
  MANUFACTURED: "Manufactured",
  REPACK: "Repack",
  BOUGHT_FINISHED: "Purchased finished",
};

export function fmtSupplyMethod(s: string | null | undefined): string {
  if (!s) return "—";
  return SUPPLY_METHOD_LABELS[s] ?? s;
}
