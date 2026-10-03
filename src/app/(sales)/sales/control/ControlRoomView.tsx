"use client";

// The control room (D-045, tranche 205): Tom only.
//
// One tile per system the sales motion runs on — lead intake, the WhatsApp line, the follow-up
// runs, the Shopify mirror, the sales report, the sleeping radar and the settings log. Each says
// its state in a word and an icon (never colour alone), when it last succeeded, and the one
// thing to do. Every number comes from the server, which reads real tables; nothing is
// computed or invented here. Meta's template approval is not stored anywhere, and the tile says
// exactly that.
//
// Below the tiles, the technical settings: the lead line's test phones (editable) and the
// intake mode (read-only).

import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, OctagonAlert } from "lucide-react";
import { TEAM_UI, actorLabel } from "../../_lib/labels";
import { fmtPhone, fmtRelative } from "../../_lib/format";
import type { ControlRoom, ControlTile } from "../../_lib/types";
import { CONTROL_UI, SETTING_KEY_LABELS } from "./copy";

const STATE_ICON = { green: CircleCheck, amber: CircleAlert, red: OctagonAlert } as const;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const str = (v: unknown) => (typeof v === "string" ? v : null);

function factsOf(t: ControlTile): string[] {
  const f = t.facts as Record<string, unknown>;
  switch (t.id) {
    case "intake": {
      const out = [CONTROL_UI.intakeMode(String(f.mode))];
      if (f.last_pulse_at) out.push(CONTROL_UI.pulse(String(f.mode), fmtRelative(str(f.last_pulse_at))));
      out.push(f.last_lead_at ? CONTROL_UI.lastLead(fmtRelative(str(f.last_lead_at))) : CONTROL_UI.lastLead("—"));
      out.push(CONTROL_UI.leads24h(num(f.leads_24h)));
      out.push(CONTROL_UI.rejects24h(num(f.rejects_24h)));
      out.push(CONTROL_UI.unalerted48h(num(f.unalerted_48h)));
      return out;
    }
    case "whatsapp": {
      const s = CONTROL_UI.waStatus;
      return [
        CONTROL_UI.waMode[String(f.mode)] ?? String(f.mode),
        `${CONTROL_UI.waWindow}: ${s.sent} ${num(f.sent)} · ${s.delivered} ${num(f.delivered)} · ${s.read} ${num(f.read)} · ${s.failed} ${num(f.failed)}`,
        `${s.dry_run}: ${num(f.dry_run)}`,
        CONTROL_UI.optOuts(num(f.opt_outs_total), num(f.opt_outs_7d)),
        CONTROL_UI.templateApproval,
      ];
    }
    case "wake": {
      const r = f.last_run as Record<string, unknown> | null;
      const out: string[] = [];
      if (r) {
        out.push(CONTROL_UI.wakeLast(fmtRelative(str(r.started_at))));
        out.push(CONTROL_UI.wakeCounts(num(r.considered), num(r.sent), num(r.dry_run), num(r.failed)));
        if (r.error) out.push(CONTROL_UI.wakeError(String(r.error)));
      }
      out.push(CONTROL_UI.wake24h(num(f.runs_24h), num(f.sent_24h)));
      const skipped = Object.entries((f.skipped_24h ?? {}) as Record<string, number>);
      if (skipped.length) out.push(`${CONTROL_UI.wakeSkipped}: ${skipped.map(([k, v]) => `${CONTROL_UI.skipReason[k] ?? k} ${v}`).join(" · ")}`);
      return out;
    }
    case "mirror":
      return [
        ...(f.last_kind ? [CONTROL_UI.mirrorLast(String(f.last_kind), String(f.last_status))] : []),
        CONTROL_UI.openExceptions(num(f.open_exceptions)),
      ];
    case "report":
      return [
        ...(f.last_kind ? [CONTROL_UI.reportLast(String(f.last_kind), String(f.last_status))] : []),
        ...(f.last_full_ok_at ? [CONTROL_UI.reportFull(fmtRelative(str(f.last_full_ok_at)))] : []),
      ];
    case "radar":
      return [CONTROL_UI.radarCounts(num(f.flagged_last_run), num(f.orgs_last_run))];
    default:
      return [];
  }
}

function Tile({ t }: { t: ControlTile }) {
  const Icon = STATE_ICON[t.state];
  const isLog = t.id === "settings";
  const recent = isLog ? ((t.facts as { recent?: Array<{ key: string; actor: string; at: string }> }).recent ?? []) : [];
  return (
    <li className="s-panel s-tile" data-state={isLog ? undefined : t.state} data-testid={`tile-${t.id}`} aria-labelledby={`tile-${t.id}-title`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`tile-${t.id}-title`} className="s-section-heading">{CONTROL_UI.tile[t.id]}</h2>
        {/* the settings log is a record, not a system with a health: no state pill */}
        {isLog ? null : (
          <span className={`s-tile-state s-tile-state-${t.state}`} data-testid={`tile-${t.id}-state`}>
            <Icon size={14} aria-hidden />
            {CONTROL_UI.state[t.state]}
          </span>
        )}
      </div>
      <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }} data-testid={`tile-${t.id}-when`}>
        {isLog
          ? ((t.last_success_at ?? recent[0]?.at) ? CONTROL_UI.lastChange(fmtRelative(t.last_success_at ?? recent[0]?.at)) : CONTROL_UI.settingsNone)
          : (t.last_success_at ? CONTROL_UI.lastSuccess(fmtRelative(t.last_success_at)) : CONTROL_UI.noSuccess)}
      </p>
      {isLog ? null : (
        <p className="s-tile-action" data-testid={`tile-${t.id}-action`}>
          {CONTROL_UI.action[t.action] ?? CONTROL_UI.fallbackAction(t.state)}
        </p>
      )}
      {isLog ? (
        recent.length === 0 ? null : (
          <ul className="s-tile-facts" aria-label={CONTROL_UI.settingsRecent}>
            {recent.map((r, i) => (
              <li key={`${r.key}-${r.at}-${i}`}>
                {SETTING_KEY_LABELS[r.key] ?? r.key} · {actorLabel(r.actor)} · {fmtRelative(r.at)}
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className="s-tile-facts">
          {factsOf(t).map((line) => <li key={line}><bdi>{line}</bdi></li>)}
        </ul>
      )}
    </li>
  );
}

/** Israeli phone digits as lead_line compares them ("97250…"), or null. Mirrors the server. */
export function normalizeTestPhone(input: string): string | null {
  let d = input.replace(/^whatsapp:/i, "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (/^[2-9]\d{7,8}$/.test(d)) d = `972${d}`;
  return /^972[2-9]\d{7,8}$/.test(d) ? d : null;
}

export interface TestPhonesProps {
  phones: string[];
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: (phones: string[]) => void;
}

export function TestPhonesEditor({ phones, saving, saved, error, onSave }: TestPhonesProps) {
  const [list, setList] = useState<string[]>(phones);
  const [draft, setDraft] = useState("");
  const [bad, setBad] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setList(phones), [phones]);
  const dirty = JSON.stringify(list) !== JSON.stringify(phones);
  return (
    <section className="s-panel flex flex-col gap-2" aria-labelledby="control-phones-title" data-testid="control-test-phones">
      <h3 id="control-phones-title" className="s-section-heading">{CONTROL_UI.testPhonesTitle}</h3>
      <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{CONTROL_UI.testPhonesHint}</p>
      {list.length === 0 ? (
        <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{CONTROL_UI.testPhonesEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.map((p) => (
            <li key={p} className="flex items-center gap-3">
              <bdi dir="ltr" className="s-nums" style={{ color: "hsl(var(--s-fg))" }}>{fmtPhone(`+${p}`)}</bdi>
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center px-3 underline"
                style={{ color: "hsl(var(--s-danger-quiet))" }}
                aria-label={CONTROL_UI.testPhoneRemove(fmtPhone(`+${p}`))}
                data-testid={`test-phone-remove-${p}`}
                onClick={() => setList((l) => l.filter((x) => x !== p))}
              >
                {CONTROL_UI.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-start gap-2">
        <span className="flex flex-col gap-1">
          <label htmlFor="test-phone-new" className="sr-only">{CONTROL_UI.testPhoneNew}</label>
          <input
            id="test-phone-new"
            ref={input}
            data-testid="test-phone-new"
            className="s-input"
            dir="ltr"
            inputMode="tel"
            placeholder={CONTROL_UI.testPhoneNew}
            value={draft}
            aria-invalid={bad || undefined}
            aria-describedby="test-phone-error"
            onChange={(e) => { setDraft(e.target.value); setBad(false); }}
          />
          <span id="test-phone-error" aria-live="polite" className="text-[12px]" style={{ color: "hsl(var(--s-sla-overdue))" }}>
            {bad ? CONTROL_UI.testPhoneBad : ""}
          </span>
        </span>
        <button
          type="button"
          className="s-btn s-btn-ghost"
          data-testid="test-phone-add"
          disabled={!draft.trim()}
          onClick={() => {
            const p = normalizeTestPhone(draft);
            if (!p) { setBad(true); input.current?.focus(); return; }
            setList((l) => (l.includes(p) ? l : [...l, p]));
            setDraft("");
          }}
        >
          {CONTROL_UI.testPhoneAdd}
        </button>
      </div>
      {error ? <p role="alert" className="text-[13px]" style={{ color: "hsl(var(--s-sla-overdue))" }}>{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="s-btn s-btn-ghost"
          data-testid="test-phones-save"
          aria-busy={saving || undefined}
          disabled={saving || !dirty}
          onClick={() => onSave(list)}
        >
          {CONTROL_UI.testPhonesSave}
        </button>
        <span role="status" className="text-[12px]" style={{ color: "hsl(var(--s-status-won))" }}>{saved ? TEAM_UI.saved : ""}</span>
      </div>
    </section>
  );
}

export function ControlRoomView({ room, phones }: { room: ControlRoom; phones: TestPhonesProps }) {
  const im = room.technical.intake_mode;
  return (
    <div className="flex flex-col gap-4">
      <ul className="s-tiles" data-testid="control-tiles">
        {room.tiles.map((t) => <Tile key={t.id} t={t} />)}
      </ul>
      <section className="flex flex-col gap-3" aria-labelledby="control-technical-title" data-testid="control-technical">
        <h2 id="control-technical-title" className="s-section-heading px-1">{CONTROL_UI.technicalTitle}</h2>
        <TestPhonesEditor {...phones} />
        <section className="s-panel flex flex-col gap-1" aria-labelledby="control-intake-title" data-testid="control-intake-mode">
          <h3 id="control-intake-title" className="s-section-heading">{CONTROL_UI.intakeModeTitle}</h3>
          <p style={{ color: "hsl(var(--s-fg))" }}>{CONTROL_UI.intakeModeValue(im.mode)}</p>
          {str(im.reason) ? <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}><bdi>{im.reason}</bdi></p> : null}
          {im.pulse_expected ? <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{CONTROL_UI.intakePulseExpected(im.pulse_expected)}</p> : null}
          {im.changed_at ? <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{CONTROL_UI.intakeModeChanged(fmtRelative(im.changed_at))}</p> : null}
          <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{CONTROL_UI.intakeModeReadOnly}</p>
        </section>
      </section>
    </div>
  );
}
