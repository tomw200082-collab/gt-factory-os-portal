"use client";

import Link from "next/link";
import { useState } from "react";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { fmtRelative } from "../_lib/format";
import { UI } from "../_lib/labels";
import { mailtoHref, telHref, waHref } from "../_lib/wa";
import type { SalesLeadRow, SalesTaskRow } from "../_lib/types";

export interface TaskCardProps {
  task: SalesTaskRow;
  lead?: SalesLeadRow | null;
  manager: boolean;
  onArm: (leadId: string, channel: "call" | "whatsapp" | "email", taskId?: string) => void;
  onComplete: (taskId: string, note: string) => Promise<unknown>;
  onResolveContact: (leadId: string, details: { phone?: string; email?: string; provenance: string }) => Promise<unknown>;
}

export function TaskCard({ task, lead, manager, onArm, onComplete, onResolveContact }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [provenance, setProvenance] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contactGap = task.kind === "contact_resolution";
  const actionable = Boolean(task.lead_id && !task.needs_assignment && !contactGap);
  const tel = actionable ? telHref(lead?.phone_e164 ?? null) : null;
  const wa = actionable ? waHref(lead?.phone_e164 ?? null, "") : null;
  const mail = actionable ? mailtoHref(lead?.email ?? null) : null;
  const leadHref = task.lead_id
    ? `/sales/leads?lead=${encodeURIComponent(task.lead_id)}${task.source_event_id ? `&event=${encodeURIComponent(task.source_event_id)}` : ""}`
    : null;

  async function submit(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      setExpanded(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : UI.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article data-testid="task-card" className="s-card s-enter min-w-0 p-4" style={{ borderInlineStartWidth: 3, borderInlineStartColor: "hsl(var(--s-accent))" }}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold" style={{ color: "hsl(var(--s-fg))" }}>
            {task.lead_context?.org_name ?? lead?.org_name ?? task.title}
          </h3>
          <p className="text-sm" style={{ color: "hsl(var(--s-fg-muted))" }}>{task.title}</p>
        </div>
        <time className="s-nums shrink-0 text-xs" dateTime={task.due_at} style={{ color: "hsl(var(--s-fg-muted))" }}>
          {fmtRelative(task.due_at)}
        </time>
      </div>
      {task.reason && task.reason !== task.title ? <p className="mt-2 text-xs" style={{ color: "hsl(var(--s-fg-muted))" }}>
        {UI.taskWhy}: {task.reason}
      </p> : null}
      {leadHref ? <Link href={leadHref} className="mt-2 inline-flex min-h-[44px] items-center text-sm underline" style={{ color: "hsl(var(--s-accent))" }}>
        {task.source_event_id ? UI.taskSource : UI.taskOpenLead}
      </Link> : null}

      {task.needs_assignment && !contactGap ? (
        <p className="text-sm" style={{ color: "hsl(var(--s-fg-muted))" }}>
          {UI.queueUnassigned} · {manager && leadHref ? <Link href={leadHref} className="underline">{UI.assignAction}</Link> : null}
        </p>
      ) : null}

      {/* The owner resolves its own contact gap; unowned ones stay with a manager (D8). */}
      {contactGap && task.lead_id && (manager || !task.needs_assignment) ? (
        <form className="mt-2 grid gap-2" onSubmit={(event) => {
          event.preventDefault();
          if ((!phone.trim() && !email.trim()) || !provenance.trim()) return;
          void submit(() => onResolveContact(task.lead_id!, {
            phone: phone.trim() || undefined, email: email.trim() || undefined, provenance: provenance.trim(),
          }));
        }}>
          <strong className="text-sm">{UI.taskContactGap}</strong>
          <label className="text-sm">{UI.phone}<input className="s-input mt-1 w-full" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
          <label className="text-sm">{UI.email}<input className="s-input mt-1 w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="text-sm">{UI.taskContactSource}<input className="s-input mt-1 w-full" value={provenance} onChange={(e) => setProvenance(e.target.value)} /></label>
          <button className="s-btn s-btn-primary" disabled={busy || (!phone.trim() && !email.trim()) || !provenance.trim()}>{UI.taskContactSave}</button>
        </form>
      ) : null}

      {actionable ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {tel && task.lead_id ? <a href={tel} className="s-btn s-btn-primary flex-1" onClick={() => onArm(task.lead_id!, "call", task.id)}><Phone size={16} aria-hidden />{UI.call}</a> : null}
          {wa && task.lead_id ? <a href={wa} target="_blank" rel="noopener noreferrer" className="s-btn s-btn-ghost flex-1" onClick={() => onArm(task.lead_id!, "whatsapp", task.id)}><MessageCircle size={16} aria-hidden />{UI.whatsapp}</a> : null}
          {mail && task.lead_id ? <a href={mail} className="s-btn s-btn-ghost flex-1" onClick={() => onArm(task.lead_id!, "email", task.id)}><Mail size={16} aria-hidden />{UI.email}</a> : null}
          {task.kind !== "wait_review" ? <button type="button" className="s-btn s-btn-ghost" onClick={() => setExpanded((v) => !v)}>{UI.taskComplete}</button> : null}
        </div>
      ) : null}
      {expanded ? <form className="mt-2 grid gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (note.trim().length < 5) return;
        void submit(() => onComplete(task.id, note.trim()));
      }}>
        <label className="text-sm">{UI.taskNote}<textarea className="s-input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="s-btn s-btn-primary" disabled={busy || note.trim().length < 5}>{UI.taskComplete}</button>
      </form> : null}
      {error ? <p role="alert" className="mt-2 text-sm" style={{ color: "hsl(var(--s-danger-quiet))" }}>{error}</p> : null}
    </article>
  );
}
