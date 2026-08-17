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
          {UI.wonBannerPrefix} <bdi dir="ltr">{row.converted_order_ref ?? "—"}</bdi>
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
            {/* A phone is the one string here that must never be reordered by
                the bidi algorithm: fmtPhone falls through to raw E.164 for any
                number it cannot parse, and a leading "+" in an RTL paragraph
                lands on the wrong side. <bdi> makes that independent of which
                branch fmtPhone took. Same at every other phone render site. */}
            <bdi dir="ltr" className="s-nums">
              {fmtPhone(row.phone_e164)}
            </bdi>
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
        {/* Without a phone number there is no call to make. A disabled button
            says so honestly; an anchor with no href would look identical and
            behave like text. */}
        {tel ? (
          <a
            href={tel}
            onClick={() => onArm(row.lead_id, "call")}
            className="s-btn s-btn-primary flex-1"
          >
            <Phone size={16} aria-hidden />
            {UI.call}
          </a>
        ) : (
          <button type="button" disabled title={UI.noPhone} className="s-btn s-btn-primary flex-1" style={{ opacity: 0.45 }}>
            <Phone size={16} aria-hidden />
            {UI.call}
          </button>
        )}
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onArm(row.lead_id, "whatsapp")}
            className="s-btn s-btn-ghost flex-1"
          >
            <MessageCircle size={16} aria-hidden />
            {UI.whatsapp}
          </a>
        ) : (
          <button type="button" disabled title={UI.noPhone} className="s-btn s-btn-ghost flex-1" style={{ opacity: 0.45 }}>
            <MessageCircle size={16} aria-hidden />
            {UI.whatsapp}
          </button>
        )}
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
