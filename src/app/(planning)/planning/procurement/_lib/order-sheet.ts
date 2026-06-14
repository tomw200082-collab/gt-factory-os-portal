// Order-sheet model — a pure transform of a purchase-session PO into the
// structure the printable Hebrew order sheet renders. Mirrors the backend
// order-document generator (gt-factory-os/api/src/purchase-session/document.ts):
// per-line spec enrichment + label two-tier grouping (per-size total, then a
// per-design breakdown). Kept pure so it is unit-tested without the DOM.

import type {
  PurchaseSessionPo,
  PurchaseSessionLine,
  LineAsset,
} from "../../purchase-session/_lib/types";

export interface SheetLine {
  key: string;
  name: string;
  qty: number;
  uom: string;
  specHint: string; // "" when no spec
  printFile: string | null;
  photo: string | null;
}

export interface SheetLabelGroup {
  sizeId: string;
  sizeLabel: string;
  total: number;
  uom: string;
  designs: SheetLine[];
}

export interface OrderSheetModel {
  supplier: string;
  needDateText: string;
  totalText: string;
  items: SheetLine[];
  labelGroups: SheetLabelGroup[];
  hasItems: boolean;
  hasLabels: boolean;
  missingPrintFiles: number; // label designs without a print file
}

function fmtMoney(n: number): string {
  const fixed = (Math.round(n * 100) / 100).toFixed(2);
  const [whole, frac] = fixed.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

function assetName(assets: LineAsset[] | undefined, type: LineAsset["asset_type"]): string | null {
  return assets?.find((a) => a.asset_type === type)?.file_name ?? null;
}

function displayName(l: PurchaseSessionLine): string {
  const w = l.procurement_spec?.supplier_catalog_wording;
  return w && w.trim().length > 0 ? w.trim() : l.line_label;
}

function specHint(l: PurchaseSessionLine): string {
  const s = l.procurement_spec;
  if (!s) return "";
  const parts: string[] = [];
  if (s.material) parts.push(`חומר: ${s.material}`);
  if (s.finish) parts.push(`גימור: ${s.finish}`);
  if (s.print) parts.push(`דפוס: ${s.print}`);
  if (s.dimensions_mm) parts.push(`מידות: ${s.dimensions_mm}`);
  return parts.join(" · ");
}

function toSheetLine(l: PurchaseSessionLine): SheetLine {
  return {
    key: l.session_po_line_id,
    name: displayName(l),
    qty: l.final_qty,
    uom: l.uom,
    specHint: specHint(l),
    printFile: assetName(l.assets, "PRINT_FILE"),
    photo: assetName(l.assets, "PHOTO"),
  };
}

export function buildOrderSheetModel(po: PurchaseSessionPo): OrderSheetModel {
  const active = po.lines.filter((l) => !l.is_dropped && l.final_qty > 0);
  const labelLines = active.filter((l) => l.is_label === true);
  const itemLines = active.filter((l) => l.is_label !== true);

  // Group label lines by physical size, first-seen order preserved.
  const order: string[] = [];
  const groups = new Map<string, PurchaseSessionLine[]>();
  for (const l of labelLines) {
    const k = l.label_size?.size_id ?? "__unspecified__";
    if (!groups.has(k)) {
      groups.set(k, []);
      order.push(k);
    }
    groups.get(k)!.push(l);
  }

  const labelGroups: SheetLabelGroup[] = order.map((k) => {
    const g = groups.get(k)!;
    const total = g.reduce((sum, l) => sum + l.final_qty, 0);
    return {
      sizeId: k,
      sizeLabel: g[0].label_size?.label ?? "מדבקות — גודל לא מוגדר",
      total,
      uom: g[0].uom,
      designs: g.map(toSheetLine),
    };
  });

  const missingPrintFiles = labelLines.filter(
    (l) => !assetName(l.assets, "PRINT_FILE"),
  ).length;

  const needDateText = po.earliest_need_date
    ? `נשמח לקבל את הסחורה עד לתאריך ${po.earliest_need_date}.`
    : "נשמח לתאם מועד אספקה.";

  const currencySym = po.currency === "ILS" ? "₪" : po.currency;

  return {
    supplier: po.supplier_snapshot,
    needDateText,
    totalText: `סך הכל משוער: ${fmtMoney(po.total_cost)} ${currencySym}`,
    items: itemLines.map(toSheetLine),
    labelGroups,
    hasItems: itemLines.length > 0,
    hasLabels: labelLines.length > 0,
    missingPrintFiles,
  };
}
