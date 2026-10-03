"use client";

// "קובץ התפריט לכל קו" (D-045, tranche 205).
//
// The five lines the site's lead dialog writes, and the PDF the lead line sends for each in its
// first message. Each line shows its label, its file name and a state — "תקין" when the
// server's HEAD request reached the file (checked when the page loads, cached 10 minutes),
// "חסר קובץ" when there is none or it did not answer. Without a file the lead gets the general
// reply instead of the menu, and the area says so.
//
// Managers edit a line's label, file name and link. The link must be https on the host the
// files already live on (cdn.shopify.com): the same rule the server enforces.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, CircleHelp } from "lucide-react";
import { TEAM_UI, actorLabel } from "../_lib/labels";
import { fmtRelative } from "../_lib/format";
import type { MenuFileInput, MenuFileRow, MenuKey } from "../_lib/types";

export const MENU_FILE_HOSTS = ["cdn.shopify.com"] as const;
export type MenuField = "label" | "filename" | "pdf_url";

/** The server's rules (gt-factory-os schemas.ts menuFileSchema), said before a save is refused. */
export function validateMenuFile(f: MenuFileInput): Partial<Record<MenuField, string>> {
  const out: Partial<Record<MenuField, string>> = {};
  const label = f.label.trim();
  const filename = f.filename.trim();
  if (label.length < 1 || label.length > 60) out.label = TEAM_UI.menuLabelRequired;
  if (filename.length < 1 || filename.length > 120 || /[\\/]/.test(filename) || !/\.pdf$/i.test(filename)) out.filename = TEAM_UI.menuFilenameBad;
  let okUrl = false;
  try {
    const u = new URL(f.pdf_url.trim());
    okUrl = u.protocol === "https:" && (MENU_FILE_HOSTS as readonly string[]).includes(u.hostname) && !u.username && !u.password;
  } catch { okUrl = false; }
  if (!okUrl) out.pdf_url = TEAM_UI.menuUrlBad;
  return out;
}

export interface MenuFilesAreaProps {
  menus: MenuFileRow[] | undefined;
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  change: { actor: string; at: string } | null;
  savingKey: MenuKey | null;
  savedKey: MenuKey | null;
  error: { key: MenuKey; message: string } | null;
  onSave: (key: MenuKey, file: MenuFileInput) => void;
  history?: ReactNode;
}

const ERR = { color: "hsl(var(--s-sla-overdue))" } as const;
const STATE_ICON = { ok: CircleCheck, missing: CircleAlert, unchecked: CircleHelp } as const;

function MenuEditor({ row, saving, error, onSave, onCancel }: {
  row: MenuFileRow; saving: boolean; error: string | null;
  onSave: (f: MenuFileInput) => void; onCancel: () => void;
}) {
  const [f, setF] = useState<MenuFileInput>({ label: row.label, filename: row.filename ?? "", pdf_url: row.pdf_url ?? "" });
  const [shown, setShown] = useState<Set<MenuField>>(new Set());
  const refs = useRef<Partial<Record<MenuField, HTMLInputElement | null>>>({});
  const first = useRef<HTMLInputElement | null>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const problems = validateMenuFile(f);
  const problem = (k: MenuField) => (shown.has(k) ? problems[k] : undefined);
  const field = (k: MenuField, label: string, hint: string | null, ltr: boolean) => {
    const id = `menu-${row.key}-${k}`;
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="font-medium" style={{ color: "hsl(var(--s-fg))" }}>{label}</label>
        {hint ? <p id={`${id}-hint`} className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{hint}</p> : null}
        <input
          id={id}
          ref={(el) => { refs.current[k] = el; if (k === "label") first.current = el; }}
          data-testid={`menu-${row.key}-${k}`}
          className="s-input"
          dir={ltr ? "ltr" : undefined}
          value={f[k]}
          onChange={(e) => setF((prev) => ({ ...prev, [k]: e.target.value }))}
          onBlur={() => setShown((s) => new Set(s).add(k))}
          aria-invalid={problem(k) ? true : undefined}
          aria-describedby={`${hint ? `${id}-hint ` : ""}${id}-error`}
        />
        <p id={`${id}-error`} aria-live="polite" className="text-[12px]" style={ERR}>{problem(k) ?? ""}</p>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-2" data-testid={`menu-editor-${row.key}`}>
      {field("label", TEAM_UI.menuLabel, null, false)}
      {field("filename", TEAM_UI.menuFilename, TEAM_UI.menuFilenameHint, true)}
      {field("pdf_url", TEAM_UI.menuUrl, TEAM_UI.menuUrlHint, true)}
      {error ? <p role="alert" className="text-[13px]" style={ERR}>{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="s-btn s-btn-ghost"
          data-testid={`menu-${row.key}-save`}
          aria-busy={saving || undefined}
          disabled={saving}
          onClick={() => {
            const bad = (["label", "filename", "pdf_url"] as MenuField[]).find((k) => problems[k]);
            if (bad) {
              setShown(new Set<MenuField>(["label", "filename", "pdf_url"]));
              refs.current[bad]?.focus();
              return;
            }
            onSave({ label: f.label.trim(), filename: f.filename.trim(), pdf_url: f.pdf_url.trim() });
          }}
        >
          {TEAM_UI.menuSave}
        </button>
        <button type="button" className="s-btn s-btn-ghost" data-testid={`menu-${row.key}-cancel`} onClick={onCancel}>
          {TEAM_UI.menuCancel}
        </button>
      </div>
    </div>
  );
}

export function MenuFilesArea({ menus, loading, loadError, onRetry, change, savingKey, savedKey, error, onSave, history }: MenuFilesAreaProps) {
  const [editing, setEditing] = useState<MenuKey | null>(null);
  const editBtn = useRef<Partial<Record<MenuKey, HTMLButtonElement | null>>>({});
  // a save that landed closes its editor and returns focus to the line's edit button
  useEffect(() => {
    if (savedKey && savedKey === editing) {
      setEditing(null);
      editBtn.current[savedKey]?.focus();
    }
  }, [savedKey, editing]);
  const anyMissing = (menus ?? []).some((m) => m.state === "missing");

  return (
    <section className="s-panel flex flex-col gap-3" aria-labelledby="settings-menus-title" data-testid="settings-menus">
      <h3 id="settings-menus-title" className="s-section-heading">{TEAM_UI.menusTitle}</h3>
      <p className="text-[13px]" style={{ color: "hsl(var(--s-fg-muted))" }}>{TEAM_UI.menusHint}</p>
      <p className="text-[12px]" data-testid="menus-warn" style={{ color: anyMissing ? "hsl(var(--s-review))" : "hsl(var(--s-fg-faint))" }}>
        {TEAM_UI.menusWarn}
      </p>
      {loading ? <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{TEAM_UI.historyLoading}</p> : null}
      {loadError ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-[13px]" style={ERR}>
          {TEAM_UI.menusLoadError}
          <button type="button" className="s-btn s-btn-ghost" onClick={onRetry}>{TEAM_UI.retry}</button>
        </p>
      ) : null}
      {menus ? (
        <ul className="flex flex-col gap-2">
          {menus.map((m) => {
            const Icon = STATE_ICON[m.state];
            return (
              <li key={m.key} className="s-menu-row" data-testid={`menu-row-${m.key}`} data-state={m.state}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium" style={{ color: "hsl(var(--s-fg))" }}>{m.label}</span>
                  <span className={`s-menu-state s-menu-state-${m.state}`} data-testid={`menu-state-${m.key}`}>
                    <Icon size={14} aria-hidden />
                    {TEAM_UI.menuState[m.state]}
                  </span>
                </div>
                <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-muted))" }}>
                  {TEAM_UI.menuLine(m.line)}
                  {m.filename ? <> · <bdi dir="ltr">{m.filename}</bdi></> : null}
                </p>
                {m.state !== "ok" && TEAM_UI.menuReason(m.reason) ? (
                  <p className="text-[12px]" data-testid={`menu-reason-${m.key}`} style={{ color: "hsl(var(--s-fg-muted))" }}>
                    {TEAM_UI.menuReason(m.reason)}
                  </p>
                ) : null}
                {m.checked_at ? (
                  <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>{TEAM_UI.menuCheckedAt(fmtRelative(m.checked_at))}</p>
                ) : null}
                {editing === m.key ? (
                  <MenuEditor
                    row={m}
                    saving={savingKey === m.key}
                    error={error?.key === m.key ? error.message : null}
                    onSave={(file) => onSave(m.key, file)}
                    onCancel={() => { setEditing(null); editBtn.current[m.key]?.focus(); }}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      ref={(el) => { editBtn.current[m.key] = el; }}
                      className="s-btn s-btn-ghost"
                      data-testid={`menu-${m.key}-edit`}
                      aria-label={TEAM_UI.menuEditNamed(m.label)}
                      onClick={() => setEditing(m.key)}
                    >
                      {TEAM_UI.menuEdit}
                    </button>
                    <span role="status" className="text-[12px]" style={{ color: "hsl(var(--s-status-won))" }}>
                      {savedKey === m.key ? TEAM_UI.saved : ""}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {change ? (
        <p className="text-[12px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
          {TEAM_UI.changedBy(actorLabel(change.actor), fmtRelative(change.at))}
        </p>
      ) : null}
      {history}
    </section>
  );
}
