// ---------------------------------------------------------------------------
// Component-master classification helpers — shared across stock-event forms
// (goods receipt, waste / adjustment).
//
// componentItemType mirrors COMPONENT_CLASS_BY_ITEM_TYPE in
//   gt-factory-os/api/src/goods-receipts/handler.ts
// The waste-adjustments and physical-count handlers apply the same rule.
//
// Stock-event mutations resolve RM/PKG lines against private_core.components
// and reject (409 ITEM_TYPE_MISMATCH) any line whose item_type does not match
// the component's component_class. A form therefore cannot hard-code item_type
// — it must derive it from the component's class.
//
// Returns null for an unknown or missing class so the caller can block that
// line instead of sending a guess the API will reject. Keep in sync with the
// API map above — drift is a bug.
// ---------------------------------------------------------------------------
export function componentItemType(
  componentClass: string | null | undefined,
): "RM" | "PKG" | null {
  switch (componentClass) {
    case "INGREDIENT":
    case "PROCESS_SUPPLY":
      return "RM";
    case "PACKAGING":
    case "PACKAGING_SET":
      return "PKG";
    default:
      return null;
  }
}
