"use client";

// "Who is this?"
//
// An unknown number rings; paste it here and the answer is immediate. Search
// runs over the already-loaded lists — 188 leads and 186 businesses fit in
// memory many times over, and a round trip would be slower than typing.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtPhone, phoneSearchKey } from "../_lib/format";
import { UI } from "../_lib/labels";
import type { OrgRow, SalesLeadRow } from "../_lib/types";
import { useReturnFocus } from "../_lib/useReturnFocus";

export interface CommandKProps {
  leads: SalesLeadRow[];
  orgs: OrgRow[];
  onClose: () => void;
}

interface Hit {
  kind: "lead" | "org";
  id: string;
  title: string;
  subtitle: string;
}

export function searchAll(leads: SalesLeadRow[], orgs: OrgRow[], query: string): Hit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const digits = phoneSearchKey(query);
  const byPhone = digits.length >= 3;

  const leadHits: Hit[] = leads
    .filter((l) =>
      byPhone && phoneSearchKey(l.phone_e164).includes(digits)
        ? true
        : [l.org_name, l.contact_name, l.email].filter(Boolean).join(" ").toLowerCase().includes(q),
    )
    .slice(0, 8)
    .map((l) => ({
      kind: "lead" as const,
      id: l.id,
      title: l.org_name,
      subtitle: [l.contact_name, fmtPhone(l.phone_e164)].filter(Boolean).join(" · "),
    }));

  const orgHits: Hit[] = orgs
    .filter((o) =>
      byPhone && phoneSearchKey(o.phone_e164).includes(digits)
        ? true
        : [o.display_name, o.email].filter(Boolean).join(" ").toLowerCase().includes(q),
    )
    .slice(0, 6)
    .map((o) => ({
      kind: "org" as const,
      id: o.id,
      title: o.display_name,
      subtitle: fmtPhone(o.phone_e164),
    }));

  return [...leadHits, ...orgHits];
}

export function CommandK({ leads, orgs, onClose }: CommandKProps) {
  useReturnFocus();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, and Tab stays inside. aria-modal hides the background from a
  // screen reader but does nothing to the tab order, so without this a keyboard
  // user tabs straight out of the palette and onto shell links that are covered
  // by the scrim — the same trap the drawer and the sheets already carry.
  useEffect(() => {
    const panel = panelRef.current;
    inputRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const hits = useMemo(() => searchAll(leads, orgs, query), [leads, orgs, query]);

  function open(hit: Hit) {
    onClose();
    router.push(
      hit.kind === "lead"
        ? `/sales/leads?lead=${encodeURIComponent(hit.id)}`
        : `/sales/orgs?org=${encodeURIComponent(hit.id)}`,
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4"
      style={{ background: "hsl(var(--s-overlay))" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={UI.commandTitle}
        dir="rtl"
        data-testid="command-k"
        className="s-card mt-[10vh] w-full max-w-lg overflow-hidden"
      >
        <input
          ref={inputRef}
          type="search"
          className="s-input"
          style={{
            // Not border: 0 — an input with no boundary fails 1.4.11 the moment
            // focus moves away. A single separator keeps the flush look and
            // still draws the edge of the field.
            borderInline: 0,
            borderBlockStart: 0,
            borderBlockEnd: "1px solid hsl(var(--s-border-field))",
            borderRadius: 0,
          }}
          placeholder={UI.commandPlaceholder}
          aria-label={UI.commandPlaceholder}
          data-testid="command-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {/* The list below changes as you type. Without this, nothing says so:
            a screen-reader user pastes a number and hears silence, then has to
            Tab into the list to find out whether it matched anyone. */}
        <p className="sr-only" role="status" aria-live="polite">
          {query.trim() ? (hits.length === 0 ? UI.searchEmpty : UI.searchResults(hits.length)) : ""}
        </p>

        {query.trim() && hits.length === 0 ? (
          <p className="px-3 py-4 text-[13px]" style={{ color: "hsl(var(--s-fg-faint))" }}>
            {UI.searchEmpty}
          </p>
        ) : null}

        <ul className="max-h-[50vh] overflow-y-auto">
          {hits.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                data-testid={`command-hit-${hit.id}`}
                onClick={() => open(hit)}
                className="flex w-full items-center justify-between gap-3 border-t px-3 py-2 text-start"
                style={{ borderColor: "hsl(var(--s-border))" }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]" style={{ color: "hsl(var(--s-fg))" }}>
                    {hit.title}
                  </span>
                  <span
                    className="s-nums block truncate text-[12px]"
                    style={{ color: "hsl(var(--s-fg-muted))" }}
                  >
                    {/* Composed from a name and a phone, so it is isolated as a
                        unit: dir="auto" picks RTL from the name when there is
                        one and LTR for a bare number. */}
                    <bdi>{hit.subtitle}</bdi>
                  </span>
                </span>
                <span className="s-badge s-badge-customer">
                  {hit.kind === "lead" ? UI.commandHintLeads : UI.commandHintOrgs}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
