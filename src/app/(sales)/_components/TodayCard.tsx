"use client";

// One item of work.
//
// Four shapes, one anatomy: who it is, why it is in front of you, and the four
// things you can do about it. A conversion is the exception — it is news, not
// work, so it carries no actions at all.

import { MiniRail } from "./MiniRail";
import { Mail, PartyPopper, Phone } from "lucide-react";
import { fmtMoney, fmtPhone, fmtRelative } from "../_lib/format";
import { UI } from "../_lib/labels";
import { mailtoHref, telHref } from "../_lib/wa";
import { agedTone } from "../_lib/queue";
import type { AssigneeEntry, SalesSettings, TodayRow, WhatsappTemplates } from "../_lib/types";
import { WhatsAppQuick } from "./WhatsAppQuick";
import { assigneeName } from "./AssigneePicker";
import { CustomerBadge, CustomerContext } from "./CustomerBadge";
import { SlaBadge, SlaTimeLeft } from "./SlaBadge";

export interface TodayCardProps {
  row: TodayRow;
  /** Turns an assignee email into a name. Empty until settings load. */
  roster?: AssigneeEntry[];
  /** The live SLA parameter — the threshold the age tint respects, so the line
   *  Tom sets on the settings screen is the line the colour uses. */
  slaHours: number;
  /** Legacy: the old three templates. The WhatsApp button reads `settings` (D-042). */
  templates?: WhatsappTemplates | null;
  /** The quick messages, the sender's signer, and the old templates as a fallback. */
  settings?: SalesSettings | null;
  /** Called on tap, before the browser follows the tel:/wa.me link. */
  onArm: (leadId: string, channel: "call" | "whatsapp" | "email") => void;
  onPostpone: (row: TodayRow) => void;
  onLost: (row: TodayRow) => void;
}

function ConversionCard({ row }: { row: TodayRow }) {
  return (
    <article
      data-testid={`today-card-${row.lead_id}`}
      className="s-card s-card-won s-enter flex items-start gap-3 p-4"
      // A 35%-opacity hairline was the only thing separating the best news in
      // the product from an ordinary card. The tint does the work the border
      // was being asked to do alone.
      style={{
        background: "hsl(var(--s-status-won-soft))",
        borderColor: "hsl(var(--s-status-won) / 0.35)",
      }}
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

export function TodayCard({
  row,
  roster = [],
  slaHours,
  settings = null,
  onArm,
  onPostpone,
  onLost,
}: TodayCardProps) {
  if (row.item_type === "conversion") return <ConversionCard row={row} />;

  const returning = row.item_type === "returning_customer";
  const aged = agedTone(row.age_days, slaHours);
  const tel = telHref(row.phone_e164);
  const mail = mailtoHref(row.email);

  return (
    <article
      data-testid={`today-card-${row.lead_id}`}
      className={`s-card s-enter p-4${returning ? " s-card-accent" : ""}`}
      // A returning customer is the most urgent card in the queue and has to
      // read as different before anything is read at all. A 3px edge alone
      // does not carry that across a scroll — and when no Shopify snapshot
      // exists there is nothing else distinguishing it from a new lead.
      style={returning ? { background: "hsl(var(--s-accent-soft))" } : undefined}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {/* Wraps, never truncates (tranche 204): the business name and the phone are what the
              rep acts on, and at 320px an ellipsis ate both. */}
          <h3 className="break-words font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
            {row.org_name}
          </h3>
          <p className="mt-0.5 break-words text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
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
          <MiniRail row={row} />
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

      {/* Muted, not faint: this line also sits on the returning-customer card's
          tinted background, where faint ink drops below AA. Past the SLA it
          turns red — the queue has to make age impossible to ignore, and the
          same relative phrase in the same ink made a 19-day-old lead look like
          a fresh one (audit P1-14). */}
      <p
        data-testid="today-age"
        // The tone is also an attribute so it can be asserted without reading
        // a computed style: jsdom rejects hsl(var(--token)) outright and drops
        // the declaration, so a style-based assertion tests nothing.
        data-tone={aged}
        className="mt-2 text-[12px]"
        style={{
          color:
            aged === "overdue" ? "hsl(var(--s-sla-overdue))" : "hsl(var(--s-fg-muted))",
        }}
      >
        {row.item_type === "due_follow_up" && row.next_touch_at
          ? UI.nextTouchOn(fmtRelative(row.next_touch_at))
          : `${fmtRelative(row.created_at)} · ${UI.ageInDays(row.age_days)}`}
        {row.campaign_name ? ` · ${row.campaign_name}` : ""}
        {/* Whose lead this is, on the card itself — with two people working the
            same queue, a card with no owner reads as "anyone's", which is how
            the same prospect gets called twice. */}
        {row.assignee ? ` · ${assigneeName(row.assignee, roster)}` : ""}
        {/* D-043: the working time left, quiet, in the meta line rather than in the pill */}
        <SlaTimeLeft state={row.sla_state} minutesLeft={row.sla_minutes_left} separator />
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Offer only a channel that exists; a contact gap opens the lead. */}
        {tel ? (
          <a
            href={tel}
            onClick={() => onArm(row.lead_id, "call")}
            className="s-btn s-btn-primary flex-1"
          >
            <Phone size={16} aria-hidden />
            {UI.call}
          </a>
        ) : mail ? (
          <a href={mail} onClick={() => onArm(row.lead_id, "email")}
            className="s-btn s-btn-primary flex-1"><Mail size={16} aria-hidden />{UI.email}</a>
        ) : (
          <a href={`/sales/leads?lead=${encodeURIComponent(row.lead_id)}`}
            className="s-btn s-btn-primary flex-1">{UI.taskOpenLead}</a>
        )}
        {/* D-042: the message for the lead's situation, signed by the sender; disabled,
            with the reason, for a lead who opted out. The call above stays. */}
        <WhatsAppQuick
          leadId={row.lead_id}
          phone={row.phone_e164}
          lead={row}
          settings={settings}
          onArm={onArm}
          testId={`today-whatsapp-${row.lead_id}`}
          tone={returning ? "ghost-on-tint" : "ghost"}
        />
      </div>

      {/* Demoted out of the button row on purpose. Both of these are exits from
          the loop, and rendering them at the same weight as the call meant the
          most visually salient control on a card repeated 149 times a morning
          was the one that ends the conversation. They are still one tap; they
          just stop competing. */}
      <div className="mt-2 flex items-center gap-3 text-[13px]">
        <button
          type="button"
          data-testid="card-postpone"
          className="min-h-[44px] underline"
          style={{ color: "hsl(var(--s-fg-muted))" }}
          onClick={() => onPostpone(row)}
        >
          {UI.postpone}
        </button>
        <span aria-hidden style={{ color: "hsl(var(--s-fg-faint))" }}>
          ·
        </span>
        <button
          type="button"
          data-testid="card-lost"
          className="min-h-[44px] underline"
          style={{ color: "hsl(var(--s-danger-quiet))" }}
          onClick={() => onLost(row)}
        >
          {UI.markLost}
        </button>
      </div>
    </article>
  );
}
