// SBtnSpinner — the 14px inline spinner for a pending sales button (tranche 206).
//
//   <button className="s-btn s-btn-primary" disabled={m.isPending}
//           aria-busy={m.isPending || undefined}>
//     {m.isPending ? <SBtnSpinner /> : null}
//     {label}
//   </button>
//
// Put it first inside the button. A leading icon that follows it is hidden by
// CSS (sales-tokens.css), and the label stays. Pair it with `disabled` so a
// second tap cannot fire; to keep the width, use useLockedWidth from
// @/components/ui/useLockedWidth.
export function SBtnSpinner() {
  return <span className="s-btn-spinner" aria-hidden="true" />;
}
