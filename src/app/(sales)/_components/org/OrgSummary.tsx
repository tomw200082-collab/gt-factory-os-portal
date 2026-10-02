"use client";

// The business in numbers, only when the numbers are true: a verified link and
// published history. Unverified history is said to be unavailable, never zero;
// every money value states its basis; "as of" opens the source.

import { Info, PackageOpen } from "lucide-react";
import { fmtAgorot, fmtCount, fmtDate, fmtDateTime } from "../../_lib/format";
import { daysSinceIsrael } from "../../_lib/israelTime";
import { UI } from "../../_lib/labels";
import { historyShown, type HistoryView } from "../../_lib/orgTruth";
import type { OrgDetail } from "../../_lib/types";

export interface OrgSummaryProps {
  org: OrgDetail;
  view: HistoryView;
  onSource: () => void;
  onOpenOrder: (order: NonNullable<NonNullable<OrgDetail["counts"]>["last_order"]>) => void;
}

export function OrgSummary({ org, view, onSource, onOpenOrder }: OrgSummaryProps) {
  if (view === "prospect") {
    return (
      <section data-testid="org-summary" aria-labelledby="org-summary-title" className="s-panel s-org-block">
        <h2 id="org-summary-title" className="s-section-heading">{UI.summaryTitle}</h2>
        <p className="mt-2 text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.prospectHint}</p>
      </section>
    );
  }

  if (view === "unverified") {
    return (
      <section data-testid="org-summary" aria-labelledby="org-summary-title" className="s-panel s-org-block">
        <h2 id="org-summary-title" className="s-section-heading">{UI.summaryTitle}</h2>
        <p className="mt-2 text-[15px] font-medium" style={{ color: "hsl(var(--s-fg))" }}>{UI.historyUnavailableTitle}</p>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.historyUnavailableHint}</p>
      </section>
    );
  }

  if (!historyShown(view) || !org.counts) return null;
  const c = org.counts;
  const last = c.last_order;

  return (
    <section data-testid="org-summary" aria-labelledby="org-summary-title" className="s-panel s-org-block">
      <div className="flex items-center justify-between gap-2">
        <h2 id="org-summary-title" className="s-section-heading">{UI.summaryTitle}</h2>
        <button type="button" className="s-icon-btn" onClick={onSource} aria-label={UI.sourceOpen} aria-haspopup="dialog">
          <Info size={17} aria-hidden />
        </button>
      </div>

      {c.clean_orders === 0 ? (
        <p className="mt-2 text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.noOrdersYet}</p>
      ) : (
        <dl className="s-stats mt-3">
          <div className="s-stat s-stat-wide">
            <dt>{UI.lastOrder}</dt>
            <dd>
              {last ? (
                <button type="button" className="s-stat-link" onClick={() => onOpenOrder(last)} aria-haspopup="dialog">
                  <span className="s-nums">{fmtDate(last.created_at)}</span>
                  <span className="s-stat-sub s-nums">
                    {/* a business that moved to a distributor is not silent: no day count for it (T5) */}
                    {org.moved ? null : <>{UI.daysSince(daysSinceIsrael(last.created_at))} · </>}
                    {last.name ?? UI.orderNameless} · {UI.lastOrderLines(last.line_count)}
                  </span>
                </button>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="s-stat">
            <dt>{UI.orders12m}</dt>
            <dd className="s-nums">{fmtCount(c.orders_12m)}</dd>
          </div>
          <div className="s-stat">
            <dt>{UI.value12m}</dt>
            <dd className="s-nums">
              {fmtAgorot(c.ex_vat_12m_agorot)}
              <span className="s-stat-sub">{UI.exVat}</span>
            </dd>
          </div>
        </dl>
      )}

      {c.open_drafts > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-[13px]" style={{ color: "hsl(var(--s-review))" }}>
          <PackageOpen size={14} aria-hidden />
          {UI.openDraftsLine(c.open_drafts)}
        </p>
      ) : null}

      {org.as_of ? (
        <p className="s-nums mt-3 text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
          {UI.asOf(fmtDateTime(org.as_of))} · Shopify
        </p>
      ) : null}
    </section>
  );
}
