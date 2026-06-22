"use client";

// ---------------------------------------------------------------------------
// <InlineEditSelectCell> — dropdown variant of <InlineEditCell>.
//
// Click-to-edit single-scalar cell that constrains the value to a finite set
// of options. Used wherever consistency across items matters more than free
// text (item.family, item.product_group, item.item_type, item.pack_size,
// item.sales_uom). The free-text <InlineEditCell> remains the right tool for
// item.item_name and other naturally-open fields.
//
// Behavior:
//   - Display mode: rendered label (or "—" placeholder) with a dashed
//     underline and pencil affordance, identical to <InlineEditCell> so the
//     two read as the same control family.
//   - Click → opens a <SearchableSelect> popover anchored to the cell.
//   - Selecting an option calls onSave(value); spinner during save.
//   - "+ Add new value…" footer (admins only, opt-in via allowAdHoc) lets a
//     curator extend the set inline. The new value is treated as the chosen
//     value and persisted via the same onSave path.
//   - onSave throws or rejects → revert to original value + show error
//     tooltip. The component does not know about server mechanics; the
//     caller wires the PATCH + invalidation + if-match header.
//
// Why a popover combobox and not a native <select>?
//   - The portal already uses Radix popovers everywhere; native selects look
//     foreign next to them and lack substring search.
//   - Substring search matters at GT scale: even 30-row option sets benefit
//     from "type 3 letters and Enter" muscle memory (we already see this in
//     the supplier picker).
//   - Empty / "no value yet" states render cleanly with a visible
//     placeholder, where native <select> requires a sentinel option.
// ---------------------------------------------------------------------------

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Popover from "@radix-ui/react-popover";
import { Loader2, Check, ChevronDown, Search, X, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

export interface InlineEditSelectOption {
  /** Persisted value. */
  value: string;
  /** Human label shown in the trigger and dropdown. */
  label: string;
  /** Optional secondary hint (e.g. "used by 14 items"). */
  meta?: string;
  /** Optional group label — rows sharing the same group render under a heading. */
  group?: string;
}

export interface InlineEditSelectCellProps {
  /** Current persisted value. Empty string ("") and null both render as the placeholder. */
  value: string | null;
  /** Full list of options to choose from. May be empty while loading. */
  options: InlineEditSelectOption[];
  /**
   * Save handler. Receives the new persisted value (or `null` if the user
   * cleared the field and `allowClear` is true). Should throw on non-2xx.
   */
  onSave: (newValue: string | null) => Promise<void>;
  /** Field label, used in the popover header for orientation. */
  fieldLabel: string;
  /** Placeholder rendered in display mode when value is empty. */
  placeholder?: string;
  /** Optional concurrency token; opaque, only re-render hint. */
  ifMatchUpdatedAt?: string;
  /** Disable click-to-edit (still displays). */
  disabled?: boolean;
  /** Allow clearing the value to null. Default true. */
  allowClear?: boolean;
  /**
   * Permit the user to commit a value that is not in `options`. Reserved for
   * admin curation paths. Off by default — most fields should converge on
   * the canonical option set, not diverge.
   */
  allowAdHoc?: boolean;
  /** ARIA label for SR users when the rendered value is cryptic. */
  ariaLabel?: string;
  /** Empty-options message. */
  emptyMessage?: string;
  /**
   * Optional adornment rendered after the label in display mode (e.g. a
   * count badge "(used by 14)"). Hidden in edit mode.
   */
  trailingHint?: ReactNode;
  /** Optional test hook. */
  testId?: string;
}

export function InlineEditSelectCell({
  value,
  options,
  onSave,
  fieldLabel,
  placeholder = "— Select —",
  ifMatchUpdatedAt: _ifMatchUpdatedAt,
  disabled,
  allowClear = true,
  allowAdHoc = false,
  ariaLabel,
  emptyMessage = "No options yet",
  trailingHint,
  testId,
}: InlineEditSelectCellProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [adHocDraft, setAdHocDraft] = useState<string>("");
  const [adHocActive, setAdHocActive] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const adHocInputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
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

  const grouped = useMemo(() => {
    const map = new Map<string, InlineEditSelectOption[]>();
    for (const o of filtered) {
      const k = o.group ?? "";
      const arr = map.get(k) ?? [];
      arr.push(o);
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    setQuery("");
    setAdHocDraft("");
    setAdHocActive(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(
      `[data-search-idx="${activeIndex}"]`,
    );
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => {
    if (adHocActive) {
      const t = window.setTimeout(() => adHocInputRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [adHocActive]);

  const commit = useCallback(
    async (next: string | null) => {
      if ((next ?? "") === (value ?? "")) {
        setOpen(false);
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await onSave(next);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [onSave, value],
  );

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
      if (opt) void commit(opt.value);
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

  // --- Display mode --------------------------------------------------------
  return (
    <Popover.Root open={open} onOpenChange={(o) => !disabled && !saving && setOpen(o)}>
      <Popover.Trigger asChild>
        <span
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={ariaLabel ?? `Edit ${fieldLabel}: ${selected?.label ?? value ?? "empty"}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          data-testid={testId}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!disabled && !saving) setOpen(true);
            }
          }}
          className={cn(
            "group inline-flex max-w-full items-center gap-1 rounded-sm px-1 py-0.5",
            disabled
              ? "cursor-not-allowed text-fg-faint"
              : "cursor-pointer border-b border-dashed border-accent/40 hover:border-accent hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
            error && "text-danger-fg",
          )}
          title={error ? error : disabled ? undefined : `Click to change ${fieldLabel}`}
        >
          <span className={cn("truncate", !selected && "italic text-fg-faint")}>
            {selected ? selected.label : (value && value !== "" ? value : placeholder)}
          </span>
          {trailingHint ? (
            <span className="ml-1 text-3xs text-fg-faint">{trailingHint}</span>
          ) : null}
          {saving ? (
            <Loader2 className="h-3 w-3 animate-spin text-fg-faint" strokeWidth={2} />
          ) : disabled ? null : (
            <ChevronDown className="h-3 w-3 text-accent/60 opacity-60 transition-opacity duration-150 group-hover:opacity-100" strokeWidth={2} />
          )}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="z-50 w-[260px] overflow-hidden rounded-md border border-border/70 bg-bg-raised shadow-pop animate-fade-in-up"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header — orients the user inside a tightly-scoped dropdown */}
          <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-bg-subtle/40 px-3 py-1.5">
            <span className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              {fieldLabel}
            </span>
            {selected && allowClear ? (
              <button
                type="button"
                onClick={() => void commit(null)}
                className="text-3xs font-medium text-fg-muted hover:text-danger-fg"
              >
                Clear
              </button>
            ) : null}
          </div>

          {/* Search */}
          <div className="relative border-b border-border/40 p-2">
            <Search aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder={`Search ${fieldLabel.toLowerCase()}…`}
              aria-label={`Search ${fieldLabel}`}
              autoComplete="off"
              spellCheck={false}
              dir="auto"
              className="w-full pl-7 pr-7 h-7 text-xs bg-transparent outline-none placeholder:text-fg-faint"
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

          {options.length > 0 && (
            <div className="border-b border-border/30 bg-bg-subtle/30 px-3 py-1 text-3xs text-fg-faint">
              {filtered.length} of {options.length}
            </div>
          )}

          {/* Options */}
          <div ref={listRef} role="listbox" aria-label={fieldLabel} className="max-h-72 overflow-y-auto py-1">
            {options.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-fg-muted">
                {emptyMessage}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-fg-muted">
                No matches for “{query}”.
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
                        onClick={() => void commit(opt.value)}
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                        className={cn(
                          "w-full px-3 py-1.5 text-left text-xs flex items-center justify-between gap-2 transition-colors",
                          isActive ? "bg-accent/10" : "bg-transparent",
                          isSelected && "font-semibold",
                        )}
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate" dir="auto">{opt.label}</span>
                          {opt.meta && (
                            <span className="text-3xs text-fg-faint truncate">
                              {opt.meta}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Ad-hoc footer (admin-only path) */}
          {allowAdHoc ? (
            <div className="border-t border-border/40 bg-bg-subtle/40">
              {adHocActive ? (
                <div className="flex items-center gap-1 p-2">
                  <input
                    ref={adHocInputRef}
                    value={adHocDraft}
                    onChange={(e) => setAdHocDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = adHocDraft.trim();
                        if (v) void commit(v);
                      } else if (e.key === "Escape") {
                        setAdHocActive(false);
                        setAdHocDraft("");
                      }
                    }}
                    placeholder="New value…"
                    dir="auto"
                    className="input h-7 flex-1 px-2 py-0.5 text-xs"
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setAdHocActive(false);
                      setAdHocDraft("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!adHocDraft.trim()}
                    onClick={() => {
                      const v = adHocDraft.trim();
                      if (v) void commit(v);
                    }}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-fg-muted hover:bg-accent/5 hover:text-fg"
                  onClick={() => setAdHocActive(true)}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Add a new {fieldLabel.toLowerCase()}…
                </button>
              )}
            </div>
          ) : null}

          {error ? (
            <div className="border-t border-danger/40 bg-danger-softer px-3 py-1.5 text-3xs text-danger-fg">
              {error}
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// Tiny helper: turn a list of strings into select options where label and
// value coincide. Useful for distinct-value-derived option sets.
export function stringsToOptions(
  values: Array<string | null | undefined>,
  countByValue?: Record<string, number>,
): InlineEditSelectOption[] {
  const seen = new Set<string>();
  const out: InlineEditSelectOption[] = [];
  for (const v of values) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    const count = countByValue?.[t];
    out.push({
      value: t,
      label: t,
      meta:
        typeof count === "number"
          ? `used by ${count} item${count === 1 ? "" : "s"}`
          : undefined,
    });
  }
  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return out;
}
