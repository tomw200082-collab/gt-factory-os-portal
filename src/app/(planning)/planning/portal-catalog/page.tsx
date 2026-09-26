"use client";

// ---------------------------------------------------------------------------
// Planning · Portal catalogue — /planning/portal-catalog (Tranche 180).
//
// What customers can order in the customer portal. A planner or admin marks a
// product "not available now" (the switch posts at once), says when it is
// expected back and what to offer instead, and works the list of customers who
// asked to be told when it is back: a WhatsApp link with the text typed, which
// a person sends, then "Mark notified". Nothing here messages a customer, reads
// the production plan, or touches Shopify or stock. On hand is a hint only.
//
// Every change is one appended row upstream (gt-factory-os 0357); the list is
// refetched after each, and a row re-mounts on its new changed_at, so its form
// always starts from what the server holds.
//
// Role gate: (planning)/layout.tsx admits planning:read. Controls are disabled
// without planning:execute (operator, viewer), and the Waiting list does not
// expand for them; upstream every change and the Waiting list answer 403 to
// anyone but planner and admin.
//
// English UI (portal CLAUDE.md). Product names are Shopify's; messages to
// customers are Hebrew data and render in <bdi>.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { QueryCountChip } from "@/components/feedback/QueryCountChip";
import { ErrorState, SkeletonRow } from "@/components/feedback/states";
import { useCapability } from "@/lib/auth/role-gate";
import { fetchJson } from "@/lib/http/fetchJson";
import { cn } from "@/lib/cn";
import { formatWhen } from "@/app/(admin)/admin/portal-registrations/_lib/portal-registrations";
import {
  GROUPS,
  NOTE_MAX,
  PRESETS,
  bodyOf,
  formatDay,
  groupRows,
  postCatalog,
  productName,
  restockWaLink,
  sibling,
  unavailableFor,
  type Availability,
  type CatalogRow,
  type RestockRequest,
} from "./_lib/portal-catalog";

const KEY = ["planning", "portal-catalog"] as const;
const skuPath = (sku: string) => `/api/portal/catalog/${encodeURIComponent(sku)}`;

export default function PortalCatalogPage(): JSX.Element {
  const canEdit = useCapability("planning:execute");
  const q = useQuery<{ rows: CatalogRow[] }>({
    queryKey: KEY,
    queryFn: () => fetchJson<{ rows: CatalogRow[] }>("/api/portal/catalog"),
  });
  const rows = q.data?.rows ?? [];
  const { back, groups } = groupRows(rows);

  return (
    <>
      <WorkflowHeader
        eyebrow="Planning · customer portal"
        title="Portal catalogue"
        description="What customers can order in the portal. Mark a product not available now, say when it is expected back and what to offer instead: customers see it on their next page load. On hand is a hint only; nothing changes by itself."
        meta={
          <QueryCountChip
            isLoading={q.isLoading}
            isError={q.isError}
            count={rows.filter((r) => !r.available).length}
            noun="not available now"
            tone="warning"
          />
        }
      />
      {q.isLoading ? (
        <SectionCard>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </SectionCard>
      ) : q.isError ? (
        <ErrorState title="Could not load the portal catalogue" onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-6">
          {back.length > 0 && (
            <SectionCard
              title="Back in stock — customers waiting"
              description="Tell each waiting customer, then mark them notified."
              tone="warning"
            >
              <RowList rows={back} all={rows} canEdit={canEdit} />
            </SectionCard>
          )}
          {groups.map((g) => (
            <SectionCard key={g.category} title={g.label}>
              <RowList rows={g.rows} all={rows} canEdit={canEdit} />
            </SectionCard>
          ))}
        </div>
      )}
    </>
  );
}

function RowList({ rows, all, canEdit }: { rows: CatalogRow[]; all: CatalogRow[]; canEdit: boolean }): JSX.Element {
  return (
    <ul className="-mx-5 divide-y divide-border/60">
      {rows.map((r) => (
        <ProductRow key={`${r.sku}|${r.changed_at ?? ""}`} row={r} all={all} canEdit={canEdit} />
      ))}
    </ul>
  );
}

function ProductRow({ row, all, canEdit }: { row: CatalogRow; all: CatalogRow[]; canEdit: boolean }): JSX.Element {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Availability>(() => bodyOf(row));
  const name = productName(row);
  const sib = sibling(row, all);
  const nameOf = (sku: string | null) => {
    const r = all.find((x) => x.sku === sku);
    return r ? productName(r) : sku;
  };

  // one post per [sku, whole row]; the list is refetched either way, so the screen never shows what the server lacks
  const save = useMutation({
    mutationFn: async ([sku, body]: [string, Availability]) => {
      try {
        await postCatalog(skuPath(sku), body);
      } catch (e) {
        // "Same for …" writes the other size: its failure is named, on this row
        throw sku === row.sku ? e : new Error(`${nameOf(sku)}: ${(e as Error).message}`);
      }
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: KEY, exact: true });
      document.getElementById(`avail-${row.sku}`)?.focus();
    },
  });

  const dirty = JSON.stringify(draft) !== JSON.stringify(bodyOf(row));
  const set = (patch: Partial<Availability>) => setDraft((d) => ({ ...d, ...patch }));
  const text = (v: string) => (v.trim() === "" ? null : v);

  return (
    <li className="space-y-3 px-5 py-4" data-testid={`catalog-row-${row.sku}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-fg-strong">
            <bdi>{name}</bdi>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-muted">
            <span className="font-mono" dir="ltr">
              {row.sku}
            </span>
            <span>
              On hand <span className="font-mono tabular-nums">{row.on_hand ?? "—"}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            id={`avail-${row.sku}`}
            aria-checked={row.available}
            disabled={!canEdit || save.isPending}
            onClick={() => save.mutate([row.sku, { ...bodyOf(row), available: !row.available }])}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-2 text-sm font-medium text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid={`catalog-switch-${row.sku}`}
          >
            <span className={cn("relative block h-6 w-11 rounded-full transition-colors", row.available ? "bg-success" : "bg-bg-muted")}>
              <span
                className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", row.available ? "left-[22px]" : "left-0.5")}
                aria-hidden
              />
            </span>
            Available<span className="sr-only">: {name}</span>
          </button>
          {!row.available && <Badge tone="warning">Not available now</Badge>}
          {sib && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={!canEdit || save.isPending}
              onClick={() =>
                save.mutate([sib.sku, { ...bodyOf(row), alternative_sku: row.alternative_sku === sib.sku ? null : row.alternative_sku }])
              }
              data-testid={`catalog-both-${row.sku}`}
            >
              {sib.key.endsWith(":05") ? "Same for 500 ml" : "Same for 1 L"}
            </button>
          )}
        </div>
      </div>

      {!row.available && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`back-${row.sku}`}>
              Expected back
            </label>
            <input
              id={`back-${row.sku}`}
              type="date"
              className="input"
              value={draft.back_on ?? ""}
              disabled={!canEdit}
              onChange={(e) => set({ back_on: text(e.target.value) })}
              data-testid={`catalog-back-on-${row.sku}`}
            />
            {row.back_on_passed && (
              <p className="mt-1 text-xs font-medium text-warning-fg" data-testid={`catalog-passed-${row.sku}`}>
                Expected date passed: customers no longer see it
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor={`msg-${row.sku}`}>
              Message to customers
            </label>
            <input
              id={`msg-${row.sku}`}
              className="input"
              dir="auto"
              maxLength={NOTE_MAX}
              value={draft.return_note ?? ""}
              disabled={!canEdit}
              onChange={(e) => set({ return_note: text(e.target.value) })}
              aria-describedby={`msg-hint-${row.sku}`}
              data-testid={`catalog-note-${row.sku}`}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {PRESETS.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  className="btn btn-outline btn-xs"
                  aria-pressed={draft.return_note === p}
                  disabled={!canEdit}
                  onClick={() => set({ return_note: p })}
                  data-testid={`catalog-preset-${row.sku}-${i}`}
                >
                  <bdi>{p}</bdi>
                </button>
              ))}
              <span id={`msg-hint-${row.sku}`} className="text-xs text-fg-muted">
                One line, up to {NOTE_MAX} characters ({(draft.return_note ?? "").length}/{NOTE_MAX})
              </span>
            </div>
          </div>
          <div>
            <label className="label" htmlFor={`alt-${row.sku}`}>
              Suggest instead
            </label>
            <select
              id={`alt-${row.sku}`}
              className="input"
              value={draft.alternative_sku ?? ""}
              disabled={!canEdit}
              onChange={(e) => set({ alternative_sku: text(e.target.value) })}
              data-testid={`catalog-alt-${row.sku}`}
            >
              <option value="">None</option>
              {GROUPS.map(([category, label]) => (
                <optgroup key={category} label={label}>
                  {all
                    .filter((r) => r.category === category && r.sku !== row.sku)
                    .map((r) => (
                      <option key={r.sku} value={r.sku}>
                        {productName(r)}
                        {r.available ? "" : " (not available now)"}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`note-${row.sku}`}>
              Internal note
            </label>
            <input
              id={`note-${row.sku}`}
              className="input"
              dir="auto"
              maxLength={200}
              value={draft.note ?? ""}
              disabled={!canEdit}
              onChange={(e) => set({ note: text(e.target.value) })}
              data-testid={`catalog-internal-${row.sku}`}
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canEdit || !dirty || save.isPending}
              onClick={() => save.mutate([row.sku, draft])}
              data-testid={`catalog-save-${row.sku}`}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {save.error && (
        <p role="alert" className="text-sm text-danger-fg" data-testid={`catalog-error-${row.sku}`}>
          {save.error.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        {row.changed_by && row.changed_at && (
          <span>
            Changed by {row.changed_by} · {formatWhen(row.changed_at)}
          </span>
        )}
        {!row.available && row.unavailable_since && <span>{unavailableFor(row.unavailable_since)}</span>}
        {row.waiting > 0 && !canEdit && <span data-testid={`catalog-waiting-${row.sku}`}>Waiting: {row.waiting}</span>}
      </div>

      {row.waiting > 0 && canEdit && <Waiting row={row} name={name} />}

      {row.history.length > 0 && (
        <details className="text-xs text-fg-muted">
          <summary className="cursor-pointer">History ({row.history.length})</summary>
          <ol className="mt-2 space-y-1">
            {row.history.map((h) => (
              <li key={h.changed_at}>
                {formatWhen(h.changed_at)} · {h.changed_by} · {h.available ? "Available" : "Not available now"}
                {h.back_on && ` · back ${formatDay(h.back_on)}`}
                {h.return_note && (
                  <>
                    {" · "}
                    <bdi>{h.return_note}</bdi>
                  </>
                )}
                {h.alternative_sku && (
                  <>
                    {" · instead "}
                    <bdi>{nameOf(h.alternative_sku)}</bdi>
                  </>
                )}
                {h.note && (
                  <>
                    {" · note: "}
                    <bdi>{h.note}</bdi>
                  </>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}

// The customers who asked to be told; loaded when opened. A person sends each message and marks it done.
function Waiting({ row, name }: { row: CatalogRow; name: string }): JSX.Element {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const requestsKey = [...KEY, row.sku, "requests"];
  const q = useQuery<{ rows: RestockRequest[] }>({
    queryKey: requestsKey,
    queryFn: () => fetchJson<{ rows: RestockRequest[] }>(`${skuPath(row.sku)}/requests`),
    enabled: open,
  });
  const done = useMutation({
    mutationFn: (id: string) => postCatalog(`${skuPath(row.sku)}/requests/${encodeURIComponent(id)}/notified`, {}),
    // the count on the row and every open waiting list
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return (
    <details className="rounded-md border border-border/60 bg-bg-subtle/40" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-fg-strong" data-testid={`catalog-waiting-${row.sku}`}>
        Waiting: {row.waiting}
      </summary>
      <div className="px-3 pb-3">
        {q.isLoading ? (
          <SkeletonRow />
        ) : q.isError ? (
          <p role="alert" className="text-sm text-danger-fg">
            Could not load who is waiting. Close and open again.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {(q.data?.rows ?? []).map((w) => {
              const wa = restockWaLink(w.wa_phone, name);
              return (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid={`catalog-request-${w.id}`}>
                  <span className="min-w-0">
                    <bdi className="font-medium text-fg-strong">{w.display_name ?? "—"}</bdi>
                    {w.branch && (
                      <>
                        {" · "}
                        <bdi>{w.branch}</bdi>
                      </>
                    )}
                    {" · "}
                    <span className="font-mono" dir="ltr">
                      {w.wa_phone}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {wa && (
                      <a
                        className="btn btn-outline btn-sm"
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`catalog-wa-${w.id}`}
                      >
                        WhatsApp
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={done.isPending}
                      onClick={() => done.mutate(w.id)}
                      data-testid={`catalog-notified-${w.id}`}
                    >
                      Mark notified
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {done.error && (
          <p role="alert" className="mt-2 text-sm text-danger-fg">
            {done.error.message}
          </p>
        )}
      </div>
    </details>
  );
}
