"use client";

// The business's story, newest first: orders, what happened to the business,
// and the contact with its leads that this person may read. Not an audit log:
// every row is a sentence, open drafts wait on top with their age, and
// cancelled orders and drafts sit behind their own chips.

import { Building2, MessageSquareText, PackageOpen, ShoppingBag } from "lucide-react";
import { fmtAgorot, fmtDateTime } from "../../_lib/format";
import { RIVER_CHIP_LABELS, UI, actorLabel, riverEventLabel } from "../../_lib/labels";
import type { OrderRow, PendingDraft, RiverChip, RiverItem } from "../../_lib/types";
import { QueueError } from "../EmptyStates";
import { SBtnSpinner } from "../SBtnSpinner";
import { orderKindLabel } from "./OrderSheet";

const CHIPS: RiverChip[] = ["all", "orders", "contact", "cancelled", "drafts"];

/** A person is shown by name, not by mailbox: the part before @ for an email actor. */
function who(actor: string): string {
  const label = actorLabel(actor);
  return label.includes("@") ? label.split("@")[0] : label;
}

export interface OrderRiverProps {
  chip: RiverChip;
  onChip: (chip: RiverChip) => void;
  /** Orders exist on this screen only when history is shown; otherwise only events. */
  withOrders: boolean;
  items: RiverItem[];
  counts: { cancelled: number; drafts: number } | null;
  pending: PendingDraft[];
  loading: boolean;
  refetching: boolean;
  error: boolean;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onOpenOrder: (order: OrderRow) => void;
}

export function OrderRiver(p: OrderRiverProps) {
  const chips = p.withOrders ? CHIPS : (["all", "contact"] as RiverChip[]);
  return (
    <section data-testid="org-river" aria-labelledby="org-river-title" className="s-panel s-org-block">
      <h2 id="org-river-title" className="s-section-heading">{UI.riverTitle}</h2>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={UI.riverChipsLabel}>
        {chips.map((c) => {
          const n = c === "cancelled" ? p.counts?.cancelled : c === "drafts" ? p.counts?.drafts : undefined;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={p.chip === c}
              className={`s-tab s-chip ${p.chip === c ? "s-tab-active" : ""}`}
              onClick={() => p.onChip(c)}
            >
              {RIVER_CHIP_LABELS[c]}
              {n !== undefined ? <span className="s-nums"> ({n})</span> : null}
            </button>
          );
        })}
      </div>

      {p.pending.length > 0 && (p.chip === "all" || p.chip === "drafts") ? (
        <div data-testid="pending-drafts" className="s-pending mt-3">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "hsl(var(--s-review))" }}>
            <PackageOpen size={15} aria-hidden />
            {UI.pendingDraftsTitle}
          </h3>
          <ul className="mt-1 flex flex-col">
            {p.pending.map((d) => (
              <li key={d.gid}>
                <button
                  type="button"
                  className="s-river-row"
                  aria-haspopup="dialog"
                  onClick={() => p.onOpenOrder({ gid: d.gid, name: d.name, created_at: d.created_at, class: "draft", draft_status: d.draft_status, ex_vat_agorot: null, line_count: 0 })}
                >
                  <span className="s-river-main">{d.name ?? UI.orderNameless} · {orderKindLabel({ class: "draft", draft_status: d.draft_status })}</span>
                  <span className="s-river-meta s-nums">{UI.draftAge(d.age_days)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.loading ? (
        <div className="mt-3 flex flex-col gap-2" aria-busy="true">
          <span className="sr-only">{UI.loading}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="h-12 animate-pulse rounded-[var(--s-radius)]" style={{ background: "hsl(var(--s-surface-sunken))" }} />
          ))}
        </div>
      ) : null}
      {p.error && p.items.length === 0 ? (
        <div className="mt-3">
          <QueueError onRetry={p.onRetry} what={UI.riverTitle} />
        </div>
      ) : null}
      {!p.loading && !p.error && p.items.length === 0 ? (
        <p className="mt-3 text-[14px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{UI.riverEmpty}</p>
      ) : null}

      {p.items.length > 0 ? (
        <ol className={`s-river mt-3 ${p.refetching ? "s-refetching" : ""}`} aria-busy={p.refetching || undefined}>
          {p.items.map((item) => (
            <li key={item.id} className="s-river-item" data-kind={item.kind}>
              <RiverRow item={item} onOpenOrder={p.onOpenOrder} />
            </li>
          ))}
        </ol>
      ) : null}

      {p.hasMore ? (
        <div className="mt-3 flex justify-center">
          <button type="button" className="s-btn s-btn-ghost" disabled={p.loadingMore} aria-busy={p.loadingMore || undefined} onClick={p.onMore}>
            {p.loadingMore ? <SBtnSpinner /> : null}
            {p.loadingMore ? UI.loading : UI.riverMore}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function RiverRow({ item, onOpenOrder }: { item: RiverItem; onOpenOrder: (o: OrderRow) => void }) {
  const when = <time dateTime={item.at} className="s-river-meta s-nums">{fmtDateTime(item.at)}</time>;
  if (item.kind === "order") {
    const o = item.order;
    return (
      <button type="button" className="s-river-row" onClick={() => onOpenOrder(o)} aria-haspopup="dialog" aria-label={`${UI.orderOpen(o.name ?? UI.orderNameless)}, ${orderKindLabel(o)}`}>
        <ShoppingBag size={16} aria-hidden className="s-river-icon" data-class={o.class} />
        <span className="s-river-main">
          <span>{orderKindLabel(o)} {o.name ?? ""}</span>
          <span className="s-river-meta s-nums">
            {UI.lastOrderLines(o.line_count)}
            {o.ex_vat_agorot !== null ? ` · ${fmtAgorot(o.ex_vat_agorot)} ${UI.exVat}` : ""}
          </span>
        </span>
        {when}
      </button>
    );
  }
  if (item.kind === "org_event") {
    return (
      <div className="s-river-row">
        <Building2 size={16} aria-hidden className="s-river-icon" />
        <span className="s-river-main">
          <span>{riverEventLabel(item.type)}</span>
          <span className="s-river-meta">{UI.byActor(who(item.actor))}</span>
        </span>
        {when}
      </div>
    );
  }
  return (
    <div className="s-river-row">
      <MessageSquareText size={16} aria-hidden className="s-river-icon" />
      <span className="s-river-main">
        <span>{riverEventLabel(item.type)}</span>
        <span className="s-river-meta">
          {item.lead_name ? UI.forLead(item.lead_name) : null}
          {item.lead_name ? " · " : null}
          {UI.byActor(who(item.actor))}
        </span>
      </span>
      {when}
    </div>
  );
}
