"use client";

// One item of work.
//
// Four shapes, one anatomy: who it is, why it is in front of you, and the four
// things you can do about it. A conversion is the exception — it is news, not
// work, so it carries no actions at all.

import { MessageCircle, PartyPopper, Phone } from "lucide-react";
import { fmtMoney, fmtPhone, fmtRelative } from "../_lib/format";
import { UI } from "../_lib/labels";
import { telHref, templateFor, waHref, fillTemplate } from "../_lib/wa";
import type { TodayRow, WhatsappTemplates } from "../_lib/types";
import { CustomerBadge, CustomerContext } from "./CustomerBadge";
import { SlaBadge } from "./SlaBadge";

export interface TodayCardProps {
  row: TodayRow;
  templates: WhatsappTemplates | null;
  /** Called on tap, before the browser follows the tel:/wa.me link. */
  onArm: (leadId: string, channel: "call" | "whatsapp") => void;
  onPostpone: (row: TodayRow) => void;
  onLost: (row: TodayRow) => void;
}

function ConversionCard({ row }: { row: TodayRow }) {
  return (
    <article
      data-testid={`today-card-${row.lead_id}`}
      className="s-card s-enter flex items-start gap-3 p-4"
      style={{ borderColor: "hsl(var(--s-status-won) / 0.35)" }}
    >
      <PartyPopper size={20} aria-hidden style={{ color: "hsl(var(--s-status-won))" }} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
          {row.org_name}
        </h3>
        <p className="mt-0.5 text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {UI.wonBanner(row.converted_order_ref ?? "—")}
          {row.converted_amount ? (
            <>
              {" · "}
              <span className="s-nums">{fmtMoney(row.converted_amount)}</span>
            </>
          ) : null}
        </p>
      </div>
    </article>
  );
}

export function TodayCard({ row, templates, onArm, onPostpone, onLost }: TodayCardProps) {
  if (row.item_type === "conversion") return <ConversionCard row={row} />;

  const returning = row.item_type === "returning_customer";
  const name = row.contact_name ?? row.org_name;
  const tel = telHref(row.phone_e164);
  const waText = templates
    ? fillTemplate(
        templateFor(templates, {
          isExistingCustomer: row.is_existing_customer,
          alreadyTouched: Boolean(row.first_touch_at),
        }),
        name,
      )
    : "";
  const wa = waHref(row.phone_e164, waText);

  return (
    <article
      data-testid={`today-card-${row.lead_id}`}
      className="s-card s-enter p-4"
      style={
        returning
          ? { borderInlineStartWidth: 3, borderInlineStartColor: "hsl(var(--s-accent))" }
          : undefined
      }
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
            {row.org_name}
          </h3>
          <p className="mt-0.5 truncate text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
            {row.contact_name ? `${row.contact_name} · ` : ""}
            <span className="s-nums">{fmtPhone(row.phone_e164)}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {row.is_existing_customer ? <CustomerBadge /> : null}
          <SlaBadge state={row.sla_state} />
        </div>
      </div>

      {returning ? (
        <div className="mt-2">
          <CustomerContext snapshot={row.shopify_snapshot} snapshotAt={row.shopify_snapshot_at} />
        </div>
      ) : null}

      <p className="mt-2 text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
        {row.item_type === "due_follow_up" && row.next_touch_at
          ? UI.nextTouchOn(fmtRelative(row.next_touch_at))
          : fmtRelative(row.created_at)}
        {row.campaign_name ? ` · ${row.campaign_name}` : ""}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={tel ?? undefined}
          aria-disabled={!tel}
          onClick={() => tel && onArm(row.lead_id, "call")}
          className="s-btn s-btn-primary flex-1"
          style={!tel ? { opacity: 0.45, pointerEvents: "none" } : undefined}
        >
          <Phone size={16} aria-hidden />
          {UI.call}
        </a>
        <a
          href={wa ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!wa}
          onClick={() => wa && onArm(row.lead_id, "whatsapp")}
          className="s-btn s-btn-ghost flex-1"
          style={!wa ? { opacity: 0.45, pointerEvents: "none" } : undefined}
        >
          <MessageCircle size={16} aria-hidden />
          {UI.whatsapp}
        </a>
        <button type="button" className="s-btn s-btn-ghost" onClick={() => onPostpone(row)}>
          {UI.postpone}
        </button>
        <button type="button" className="s-btn s-btn-danger-quiet" onClick={() => onLost(row)}>
          {UI.markLost}
        </button>
      </div>
    </article>
  );
}
