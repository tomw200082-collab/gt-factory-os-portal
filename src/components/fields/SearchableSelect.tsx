"use client";

// ---------------------------------------------------------------------------
// SearchableSelect — accessible, keyboard-navigable combobox.
//
// Replaces native <select> for medium-to-large option lists where the user
// benefits from substring search (suppliers, items, components).
//
// Built on @radix-ui/react-popover. The popover content matches the trigger
// width via the CSS variable --radix-popover-trigger-width so the dropdown
// always lines up with the trigger.
//
// Keyboard:
//   - ArrowDown / ArrowUp move highlight
//   - Enter selects the highlighted option
//   - Escape closes
//   - Typing filters; matches against label, meta, and value
//
// Visual: matches the portal's `input` token for the trigger surface and the
// shadow-pop / bg-raised tokens for the popover panel. No new design tokens.
// ---------------------------------------------------------------------------

import * as Popover from "@radix-ui/react-popover";
import { useState, useMemo, useRef, useEffect } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Secondary text rendered in muted style under the label (SKU, ID, etc.) */
  meta?: string;
  /** Optional group label — options sharing the same group render under a heading */
  group?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  invalid?: boolean;
  className?: string;
  /** Width of the popover content — defaults to matching trigger width */
  contentWidth?: "trigger" | "auto";
  testId?: string;
  ariaLabel?: string;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "— Select —",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches",
  disabled = false,
  loading = false,
  invalid = false,
  className,
  contentWidth = "trigger",
  testId,
  ariaLabel,
}: SearchableSelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const haystack = `${o.label} ${o.meta ?? ""} ${o.value}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  // Reset highlight to top when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // When opening: focus the search input. When closing: clear query.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    setQuery("");
  }, [open]);

  // Auto-scroll active option into view
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(
      `[data-search-idx="${activeIndex}"]`,
    );
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function handleSelect(opt: SearchableSelectOption) {
    onChange(opt.value);
    setOpen(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) handleSelect(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(Math.max(0, filtered.length - 1));
    }
  }

  // Group filtered options for rendering. Preserve original order within groups.
  const grouped = useMemo(() => {
    const map = new Map<string, SearchableSelectOption[]>();
    for (const o of filtered) {
      const k = o.group ?? "";
      const arr = map.get(k) ?? [];
      arr.push(o);
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const triggerLabel = loading
    ? "Loading…"
    : selectedOption
      ? selectedOption.label
      : placeholder;

  return (
    <Popover.Root open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled || loading}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          data-testid={testId}
          className={cn(
            "input w-full flex items-center justify-between gap-2 text-left",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            invalid && "border-danger/60",
            !selectedOption && "text-fg-muted",
            className,
          )}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              "h-4 w-4 shrink-0 text-fg-muted transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className={cn(
            "z-50 rounded-md border border-border/70 bg-bg-raised shadow-pop overflow-hidden",
            "animate-fade-in-up",
            contentWidth === "trigger" &&
              "w-[var(--radix-popover-trigger-width)]",
          )}
          // Don't auto-focus content — we handle focusing the search input.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Search header */}
          <div className="relative border-b border-border/40 p-2">
            <Search
              aria-hidden
              className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder={searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              className="w-full pl-7 pr-7 h-7 text-xs bg-transparent outline-none placeholder:text-fg-faint"
              data-testid={testId ? `${testId}-search` : undefined}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Result count chip */}
          {options.length > 0 && (
            <div className="border-b border-border/30 bg-bg-subtle/30 px-3 py-1 text-3xs text-fg-faint">
              {filtered.length} of {options.length}
            </div>
          )}

          {/* Options */}
          <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-fg-muted">
                {emptyMessage}
              </div>
            ) : (
              grouped.map(([groupKey, items]) => (
                <div key={groupKey || "_default"}>
                  {groupKey && (
                    <div className="px-3 py-1 text-3xs uppercase tracking-sops text-fg-faint font-semibold">
                      {groupKey}
                    </div>
                  )}
                  {items.map((opt) => {
                    const flatIdx = filtered.indexOf(opt);
                    const isActive = flatIdx === activeIndex;
                    const isSelected = opt.value === value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        data-search-idx={flatIdx}
                        onClick={() => handleSelect(opt)}
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                        className={cn(
                          "w-full px-3 py-1.5 text-left text-xs flex items-center justify-between gap-2 transition-colors",
                          isActive ? "bg-accent/10" : "bg-transparent",
                          isSelected && "font-semibold",
                        )}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">{opt.label}</span>
                          {opt.meta && (
                            <span className="text-3xs text-fg-faint font-mono truncate">
                              {opt.meta}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <Check
                            className="h-3.5 w-3.5 shrink-0 text-accent"
                            aria-hidden
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
