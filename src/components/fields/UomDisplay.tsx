import type { Uom } from "@/lib/contracts/enums";

const SYMBOL: Record<Uom, string> = {
  kg: "kg",
  g: "g",
  l: "L",
  ml: "mL",
  each: "ea",
  case: "case",
  box: "box",
  bottle: "btl",
};

export function UomDisplay({ unit }: { unit: Uom }) {
  return (
    <span className="font-mono text-2xs uppercase text-fg-muted">
      {SYMBOL[unit]}
    </span>
  );
}
