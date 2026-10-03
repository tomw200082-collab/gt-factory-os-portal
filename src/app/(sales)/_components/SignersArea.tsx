"use client";

// "אנשי מכירות ושמות חתימה" (D-045, tranche 205).
//
// The roster is read, not edited, here: people are added and deactivated in /admin/users (D6),
// and this area says so. What it edits is each person's Hebrew signer — the name that signs the
// automatic follow-up messages and the quick messages — and it is linked to the person's
// ACCOUNT (email), not to a display name. Before 0378 the signer was looked up by the display
// name, so renaming somebody silently stopped their follow-ups. A person with no signer is
// said out loud: their leads get no automatic follow-up.
//
// One save for the area. Only what changed is sent; the server merges it, and an emptied
// field takes that person's signer away.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TEAM_UI, UI, actorLabel } from "../_lib/labels";
import { fmtRelative } from "../_lib/format";
import type { AssigneeEntry, SignerEntry } from "../_lib/types";

export const SIGNER_MAX = 30;

export interface SignersAreaProps {
  assignees: AssigneeEntry[];
  /** from the server (0378); an older API sends none, and every person shows as unsigned */
  signers?: SignerEntry[];
  openLeadsByAssignee?: Record<string, number>;
  change: { actor: string; at: string } | null;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: (map: Record<string, string | null>) => void;
  history?: ReactNode;
}

const ERR = { color: "hsl(var(--s-sla-overdue))" } as const;

export function SignersArea({
  assignees, signers, openLeadsByAssignee = {}, change, saving, saved, error, onSave, history,
}: SignersAreaProps) {
  const rows: SignerEntry[] = useMemo(() => assignees.map((a) =>
    signers?.find((s) => s.email.toLowerCase() === a.email.toLowerCase())
      ?? { email: a.email, name: a.name, signer: null, source: null }), [assignees, signers]);
  const initial = useMemo(() => Object.fromEntries(rows.map((r) => [r.email, r.signer ?? ""])), [rows]);
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [shown, setShown] = useState(false);
  useEffect(() => { setDraft(initial); setShown(false); }, [initial]);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // what a save would send: a changed name, a removal, or a name still read by display name
  // (the legacy map) — saving links it to the account
  const pending = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const r of rows) {
      const v = (draft[r.email] ?? "").trim();
      if (r.source === "account") {
        if (v !== (r.signer ?? "")) out[r.email.toLowerCase()] = v === "" ? null : v;
      } else if (r.source === "legacy") {
        // emptied: null, so the old name map stops signing for this person too (UX gate #10)
        out[r.email.toLowerCase()] = v === "" ? null : v;
      } else if (v !== "") {
        out[r.email.toLowerCase()] = v;
      }
    }
    return out;
  }, [rows, draft]);
  const tooLong = (email: string) => (draft[email] ?? "").trim().length > SIGNER_MAX;
  const dirty = rows.some((r) => (draft[r.email] ?? "").trim() !== (r.signer ?? ""));
  const canSave = Object.keys(pending).length > 0;

  return (
    <section className="s-panel flex flex-col gap-3" aria-labelledby="settings-signers-title" data-testid="settings-signers">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="settings-signers-title" className="s-section-heading">{TEAM_UI.signersTitle}</h3>
        {dirty ? <span className="s-quick-dirty" data-testid="signers-dirty">{TEAM_UI.unsaved}</span> : null}
      </div>
      <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{TEAM_UI.signersHint}</p>
      <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }} data-testid="settings-people">
        {UI.peopleDerived}{" "}
        <a href="/admin/users" data-testid="people-registry-link" className="underline" style={{ color: "hsl(var(--s-accent))" }}>
          {UI.peopleRegistryLink}
        </a>
      </p>

      {rows.length === 0 ? (
        <p data-testid="people-empty" className="text-[13px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{UI.peopleEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const open = openLeadsByAssignee[r.email] ?? 0;
            const value = draft[r.email] ?? "";
            const id = `signer-${r.email}`;
            const bad = shown && tooLong(r.email);
            const note = value.trim() === "" ? TEAM_UI.signerNone(r.name)
              : r.source === "legacy" && value.trim() === (r.signer ?? "") ? TEAM_UI.signerLegacy : "";
            return (
              <li key={r.email} data-testid={`person-${r.email}`} className="s-signer-row">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <label htmlFor={id} className="font-medium" style={{ color: "hsl(var(--s-fg))" }}>
                    {r.name}
                    <span className="sr-only"> · {TEAM_UI.signerLabel(r.name)}</span>
                  </label>
                  <bdi dir="ltr" className="text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{r.email}</bdi>
                  {open > 0 ? (
                    <span data-testid={`person-open-${r.email}`} className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
                      {UI.personOpenLeads(open)}
                    </span>
                  ) : null}
                </div>
                <input
                  id={id}
                  ref={(el) => { inputs.current[r.email] = el; }}
                  data-testid={`signer-input-${r.email}`}
                  className="s-input"
                  style={{ maxWidth: 220 }}
                  value={value}
                  placeholder={TEAM_UI.signerPlaceholder}
                  maxLength={SIGNER_MAX + 10}
                  aria-invalid={bad || undefined}
                  aria-describedby={`${id}-note ${id}-error`}
                  onChange={(e) => setDraft((d) => ({ ...d, [r.email]: e.target.value }))}
                  onBlur={() => { if (tooLong(r.email)) setShown(true); }}
                />
                <p id={`${id}-note`} data-testid={`signer-note-${r.email}`} className="text-[12px]"
                  style={{ color: value.trim() === "" ? "hsl(var(--s-review))" : "hsl(var(--s-fg-faint))" }}>
                  {note}
                </p>
                <p id={`${id}-error`} aria-live="polite" className="text-[12px]" style={ERR}>{bad ? TEAM_UI.signerTooLong : ""}</p>
              </li>
            );
          })}
        </ul>
      )}

      {error ? <p role="alert" data-testid="signers-error" className="text-[13px]" style={ERR}>{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="signers-save"
          className="s-btn s-btn-ghost"
          aria-busy={saving || undefined}
          disabled={saving || !canSave}
          onClick={() => {
            const firstBad = rows.find((r) => tooLong(r.email));
            if (firstBad) {
              setShown(true);
              inputs.current[firstBad.email]?.focus();
              return;
            }
            onSave(pending);
          }}
        >
          {TEAM_UI.signersSave}
        </button>
        <span role="status" data-testid={saved ? "signers-saved" : undefined} className="text-[12px]" style={{ color: "hsl(var(--s-status-won))" }}>
          {saved ? TEAM_UI.saved : ""}
        </span>
        {change ? (
          <span className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
            {TEAM_UI.changedBy(actorLabel(change.actor), fmtRelative(change.at))}
          </span>
        ) : null}
      </div>
      {history}
    </section>
  );
}
