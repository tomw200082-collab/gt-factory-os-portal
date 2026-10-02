// What the business workspace may claim about Shopify history (design §4).
//
// Gate 4 first: nothing derived from Shopify is true for an org whose link is
// not verified, whatever the payload carries. Then publication: verified
// history shows only while the latest reconcile passed; a pass older than 36
// hours is shown as stale, and no pass at all is "unavailable", never zero.

import type { OrgDetail } from "./types";

export type HistoryView = "ok" | "stale" | "unverified" | "identity" | "prospect" | "retired";

export function historyView(d: Pick<OrgDetail, "link_status" | "history_status">): HistoryView {
  if (d.link_status === "retired") return "retired";
  if (d.link_status === "review" || d.link_status === "disputed") return "identity";
  if (d.link_status !== "verified") return "prospect";
  if (d.history_status === "ok") return "ok";
  if (d.history_status === "stale") return "stale";
  return "unverified";
}

/** History numbers may be drawn only in these two views. */
export function historyShown(view: HistoryView): boolean {
  return view === "ok" || view === "stale";
}
