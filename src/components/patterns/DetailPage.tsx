"use client";

// ---------------------------------------------------------------------------
// DetailPage pattern — filled convention. Substrate for Tranche D.
//
// Renders the canonical shape every /admin/masters/<entity>/[id] and
// /purchase-orders/[po_id] detail surface adopts:
//
//   [ WorkflowHeader with eyebrow + title + meta + actions ]
//   [ tab strip ] + [ active tab content panel ]
//   [ linkage cards (right-rail on wide, stacked on narrow) ]
//
// Behavior:
//   - URL-persistent tab selection via useSearchParams + router.replace
//     (?tab=<key>); invalid / missing tab falls back to tabs[0].key.
//   - Linkages are rendered in the right-rail above lg breakpoint and
//     stacked below the tab content on narrower viewports.
//   - Empty linkage list renders a subdued "No linked entities." state.
//   - Per-tab loading and error states are the tab's responsibility; the
//     primitive exposes helper slots via the TabDescriptor.content prop.
//
// Reuses primitives already in the portal — WorkflowHeader, SectionCard,
// Badge. Authors no new styling convention.
// ---------------------------------------------------------------------------

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { WorkflowHeader } from "@/components/workflow/WorkflowHeader";
import { SectionCard } from "@/components/workflow/SectionCard";
import { Badge } from "@/components/badges/StatusBadge";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetailHeader {
  eyebrow?: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export interface TabDescriptor {
  key: string;
  label: string;
  // Optional small count / state pill on the tab label (e.g. "3" rows).
  badge?: ReactNode;
  // Tab content. Authors supply loading / error / empty states as needed.
  content: ReactNode;
}

export interface LinkageItem {
  label: string;
  href: string;
  badge?: ReactNode;
  // Optional secondary line (e.g. subtitle "3 versions · active v2").
  subtitle?: string;
}

export interface LinkageGroup {
  label: string;
  items: LinkageItem[];
  // Optional hint when items is empty.
  emptyText?: string;
}

export interface DetailPageProps {
  header: DetailHeader;
  tabs: TabDescriptor[];
  linkages?: LinkageGroup[];
  // Optional slot (rendered above tabs, below header) — e.g. role-gated
  // "Edit" button row. View-only in Tranche D; authors currently leave
  // this empty.
  subHeader?: ReactNode;
  // Optional slot (rendered below tab content, above linkages) — e.g.
  // a danger-zone section. Currently unused; available for Tranche F.
  footer?: ReactNode;
}

// ---------------------------------------------------------------------------
// Tab-key URL helpers
// ---------------------------------------------------------------------------

const TAB_QUERY_KEY = "tab";

function resolveActiveTab(
  tabs: TabDescriptor[],
  raw: string | null,
): TabDescriptor {
  if (tabs.length === 0) {
    // Empty tabs arrays are a programming error; we render a placeholder
    // rather than crash. The adopter contract forbids empty tabs.
    return {
      key: "__empty",
      label: "—",
      content: (
        <div className="p-5 text-sm text-fg-muted">
          No tabs configured for this detail page.
        </div>
      ),
    };
  }
  if (raw) {
    const match = tabs.find((t) => t.key === raw);
    if (match) return match;
  }
  return tabs[0];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DetailPage({
  header,
  tabs,
  linkages,
  subHeader,
  footer,
}: DetailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams?.get(TAB_QUERY_KEY) ?? null;

  const active = useMemo(
    () => resolveActiveTab(tabs, rawTab),
    [tabs, rawTab],
  );

  const setTab = useCallback(
    (key: string) => {
      if (!searchParams) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set(TAB_QUERY_KEY, key);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const hasLinkages = Boolean(linkages && linkages.length > 0);

  return (
    <>
      <WorkflowHeader
        eyebrow={header.eyebrow}
        title={header.title}
        description={header.description}
        meta={header.meta}
        actions={header.actions}
      />

      {subHeader ? <div className="mb-4">{subHeader}</div> : null}

      <div
        className={cn(
          "grid grid-cols-1 gap-6",
          hasLinkages ? "lg:grid-cols-[minmax(0,1fr)_320px]" : null,
        )}
      >
        {/* Main column — tabs + content */}
        <div className="min-w-0 space-y-4">
          <div
            role="tablist"
            aria-label="Detail sections"
            className="flex flex-wrap items-center gap-1 border-b border-border/70"
          >
            {tabs.map((t) => {
              const isActive = t.key === active.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-testid={`detail-tab-${t.key}`}
                  data-active={isActive ? "true" : "false"}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold tracking-tightish transition-colors duration-150",
                    isActive
                      ? "border-accent text-accent"
                      : "border-transparent text-fg-muted hover:text-fg",
                  )}
                >
                  {t.label}
                  {t.badge ? (
                    <span className="text-3xs font-normal text-fg-faint">
                      {t.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            aria-labelledby={`detail-tab-${active.key}`}
            data-active-tab={active.key}
          >
            {active.content}
          </div>

          {footer ? <div className="mt-4">{footer}</div> : null}
        </div>

        {/* Right rail — linkage cards */}
        {hasLinkages ? (
          <aside className="space-y-3" aria-label="Cross-entity linkages">
            {linkages!.map((group) => (
              <SectionCard
                key={group.label}
                eyebrow="Linked"
                title={group.label}
                density="compact"
                contentClassName="p-0"
              >
                {group.items.length === 0 ? (
                  <div className="p-3 text-xs text-fg-muted">
                    {group.emptyText ?? "No linked entities."}
                  </div>
                ) : (
                  <ul className="divide-y divide-border/40">
                    {group.items.map((it) => (
                      <li
                        key={`${it.label}|${it.href}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <Link
                            href={it.href}
                            className="truncate font-mono text-fg hover:text-accent"
                          >
                            {it.label}
                          </Link>
                          {it.subtitle ? (
                            <div className="truncate text-3xs text-fg-faint">
                              {it.subtitle}
                            </div>
                          ) : null}
                        </div>
                        {it.badge ? (
                          <div className="shrink-0">{it.badge}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            ))}
          </aside>
        ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helper building blocks used by adopting detail pages.
// Exported so the 4 Tranche-D pages share tone for "pending" placeholder
// tab bodies and "this endpoint is not yet live" messages.
// ---------------------------------------------------------------------------

export function PendingTabPlaceholder({
  reason,
}: {
  reason: string;
}): JSX.Element {
  return (
    <SectionCard density="compact">
      <div className="flex items-start gap-3">
        <Badge tone="warning" dotted>
          pending
        </Badge>
        <div className="text-sm text-fg-muted">{reason}</div>
      </div>
    </SectionCard>
  );
}

export function DetailTabError({
  message,
}: {
  message: string;
}): JSX.Element {
  return (
    <SectionCard density="compact" tone="danger">
      <div className="text-sm text-danger-fg">{message}</div>
    </SectionCard>
  );
}

export function DetailTabLoading(): JSX.Element {
  return (
    <SectionCard density="compact">
      <div className="text-sm text-fg-muted">Loading…</div>
    </SectionCard>
  );
}

export function DetailTabEmpty({
  message,
}: {
  message: string;
}): JSX.Element {
  return (
    <SectionCard density="compact">
      <div className="text-sm text-fg-muted">{message}</div>
    </SectionCard>
  );
}

// Field grid for "overview" tabs. Renders label/value pairs in a 2-column
// grid with monospace values. Keeps the 4 detail pages visually consistent
// without hand-rolling CSS per page.
export interface FieldRow {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

export function DetailFieldGrid({
  rows,
}: {
  rows: FieldRow[];
}): JSX.Element {
  return (
    <SectionCard density="compact" contentClassName="p-0">
      <dl className="divide-y divide-border/40">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-1 gap-1 px-4 py-2 text-xs sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center sm:gap-3"
          >
            <dt className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              {r.label}
            </dt>
            <dd
              className={cn(
                "text-fg",
                r.mono ? "font-mono text-xs" : "text-xs",
              )}
            >
              {r.value ?? <span className="text-fg-faint">—</span>}
            </dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}
