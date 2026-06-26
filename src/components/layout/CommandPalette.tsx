"use client";

// Tranche 090 — global command palette (⌘K / Ctrl+K).
//
// The literal antidote to "a needle in a haystack": one keystroke jumps to any
// destination in the portal without scanning the sidebar. Sourced from the
// single nav source of truth (NAV_MANIFEST), role-filtered, so it can never
// drift from the real route surface. Renders BOTH its trigger (a search-field
// button in the TopBar) and the dialog, so the shell just drops in one element.
//
// Built on @radix-ui/react-dialog (no cmdk dependency). Keyboard: ⌘K/Ctrl+K to
// open, ↑/↓ to move, Enter to go, Esc to close.

import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "@/lib/auth/session-provider";
import { NAV_MANIFEST } from "@/lib/nav/manifest";
import type { Role } from "@/lib/contracts/enums";
import { cn } from "@/lib/cn";

const ROLE_ORDER: Record<Role, number> = {
  viewer: 1,
  operator: 2,
  planner: 3,
  admin: 4,
};

interface Dest {
  href: string;
  label: string;
  group: string;
  Icon: (typeof NAV_MANIFEST)[number]["items"][number]["icon"];
}

export function CommandPalette() {
  const router = useRouter();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Every destination the current role may reach, flattened from the manifest.
  const destinations = useMemo<Dest[]>(() => {
    const out: Dest[] = [];
    for (const group of NAV_MANIFEST) {
      for (const item of group.items) {
        if (ROLE_ORDER[session.role] < ROLE_ORDER[item.min_role]) continue;
        out.push({
          href: item.href,
          label: item.label,
          group: group.title,
          Icon: item.icon,
        });
      }
    }
    return out;
  }, [session.role]);

  const results = useMemo<Dest[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter(
      (d) =>
        d.label.toLowerCase().includes(q) ||
        d.group.toLowerCase().includes(q) ||
        d.href.toLowerCase().includes(q),
    );
  }, [destinations, query]);

  // Global ⌘K / Ctrl+K to open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Reset query + highlight whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
    }
  }, [open]);

  // Keep the highlighted row in range as the result set shrinks.
  useEffect(() => {
    setHighlight((h) => Math.min(h, Math.max(0, results.length - 1)));
  }, [results.length]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[highlight];
      if (target) go(target.href);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {/* Trigger — a search-field-styled button in the TopBar. */}
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={cn(
            "group hidden items-center gap-2 rounded-lg border border-border/70 bg-bg-subtle/60 px-3 py-1.5 text-fg-muted transition-colors md:flex",
            "hover:border-border hover:bg-bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          )}
          aria-label="Search (Command or Control + K)"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          <span className="text-[0.8125rem]">Search…</span>
          <kbd className="ml-2 hidden rounded border border-border/70 bg-bg px-1.5 py-0.5 font-mono text-3xs font-semibold text-fg-subtle lg:inline">
            ⌘K
          </kbd>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-fg-strong/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-[15vh] z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2",
            "overflow-hidden rounded-2xl border border-border bg-bg-raised shadow-overlay",
            "focus:outline-none",
          )}
          aria-label="Command palette"
        >
          <Dialog.Title className="sr-only">Search and jump to a page</Dialog.Title>
          <Dialog.Description className="sr-only">
            Type to filter destinations. Use arrow keys to move and Enter to go.
          </Dialog.Description>

          <div className="flex items-center gap-3 border-b border-border/70 px-4">
            <Search className="h-4 w-4 shrink-0 text-fg-faint" strokeWidth={1.75} aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search pages…"
              className="h-12 w-full bg-transparent text-[0.9375rem] text-fg-strong placeholder:text-fg-faint focus:outline-none"
              aria-label="Search pages"
            />
          </div>

          <ul ref={listRef} className="max-h-[min(24rem,55vh)] overflow-y-auto p-2">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-[0.8125rem] text-fg-muted">
                No pages match “{query}”.
              </li>
            ) : (
              results.map((d, i) => {
                const Icon = d.Icon;
                const active = i === highlight;
                return (
                  <li key={d.href}>
                    <button
                      type="button"
                      onClick={() => go(d.href)}
                      onMouseMove={() => setHighlight(i)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                        active ? "bg-accent/12 text-fg-strong" : "text-fg hover:bg-bg-subtle",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          active ? "text-accent" : "text-fg-faint",
                        )}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <span className="flex-1 truncate text-[0.875rem]">{d.label}</span>
                      <span className="shrink-0 text-3xs font-semibold uppercase tracking-sops text-fg-faint">
                        {d.group}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex items-center justify-end gap-3 border-t border-border/70 px-4 py-2 text-3xs text-fg-faint">
            <span>↑↓ move</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
