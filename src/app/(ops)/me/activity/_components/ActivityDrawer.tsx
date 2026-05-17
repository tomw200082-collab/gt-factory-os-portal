"use client";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ActivityCrossLink, ActivityDrawerResponse, ActivityRow } from "../_types";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Map a cross-link kind to a portal route. Kinds that don't map to a known
// route return null and the item renders as plain text.
function crossLinkHref(link: ActivityCrossLink): string | null {
  const id = encodeURIComponent(link.target_id);
  switch (link.kind) {
    case "purchase_order":
      return `/purchase-orders/${id}`;
    case "physical_count_approval":
      return `/inbox/approvals/physical-count/${id}`;
    case "waste_approval":
      return `/inbox/approvals/waste/${id}`;
    case "credit_exception":
      return `/inbox/credit/${id}`;
    default:
      return null;
  }
}

export function ActivityDrawer({
  row,
  triggerEl,
  onClose,
}: {
  row: ActivityRow;
  triggerEl: HTMLElement | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  const detail = useQuery<ActivityDrawerResponse>({
    queryKey: ["me", "activity", row.activity_id],
    queryFn: async () => {
      const res = await fetch(`/api/me/activity/${encodeURIComponent(row.activity_id)}`);
      if (!res.ok) throw new Error("Could not load activity detail.");
      return res.json() as Promise<ActivityDrawerResponse>;
    },
    staleTime: 60_000,
  });

  // Focus the close button on mount; restore focus to the trigger on unmount.
  useEffect(() => {
    closeBtnRef.current?.focus();
    return () => {
      triggerEl?.focus?.();
    };
  }, [triggerEl]);

  // Escape + Tab focus-trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copyId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(row.activity_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — clipboard may be unavailable
    }
  }, [row.activity_id]);

  const links = detail.data?.row.cross_links ?? [];

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Activity detail"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex h-full w-full max-w-lg flex-col overflow-y-auto",
          "border-l border-border bg-bg-base shadow-xl"
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <div className="text-base font-semibold text-fg-strong">{row.summary.headline}</div>
            {row.summary.secondary ? (
              <div className="mt-1 text-sm text-fg-muted">{row.summary.secondary}</div>
            ) : null}
            <div className="mt-2 text-xs tabular-nums text-fg-faint">
              {new Date(row.event_at).toLocaleString("en-US")}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            className={cn(
              "shrink-0 rounded-md p-1.5 text-fg-muted",
              "hover:bg-bg-subtle hover:text-fg",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            )}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-5 py-4" aria-live="polite" aria-busy={detail.isLoading}>
          {detail.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              Loading detail…
            </div>
          ) : detail.isError ? (
            <div role="alert" className="rounded-md border border-danger/40 bg-danger-softer px-3 py-2 text-sm text-danger-fg">
              <div className="font-semibold">Could not load detail</div>
              <div className="mt-0.5 text-xs">{detail.error.message}</div>
              <button
                type="button"
                onClick={() => void detail.refetch()}
                className="mt-2 rounded-sm border border-danger/40 px-2 py-0.5 text-xs font-medium text-danger-fg hover:bg-danger-soft"
              >
                Retry
              </button>
            </div>
          ) : detail.data ? (
            <>
              {links.length > 0 ? (
                <section>
                  <h3 className="text-2xs font-semibold uppercase tracking-sops text-fg-muted">
                    Related
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {links.map((l) => {
                      const href = crossLinkHref(l);
                      return (
                        <li key={`${l.kind}:${l.target_id}`} className="flex items-baseline gap-2">
                          <span className="text-xs text-fg-muted">{l.kind.replace(/_/g, " ")}</span>
                          {href ? (
                            <Link
                              href={href}
                              className="truncate text-sm text-accent underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                            >
                              {l.label}
                            </Link>
                          ) : (
                            <span className="truncate text-sm text-fg">{l.label}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              <section>
                <h3 className="text-2xs font-semibold uppercase tracking-sops text-fg-muted">
                  Submitted data
                </h3>
                <details className="mt-2 rounded-md border border-border bg-bg-deep">
                  <summary
                    className={cn(
                      "cursor-pointer select-none rounded-md px-3 py-2 text-2xs font-medium uppercase tracking-sops text-fg-muted",
                      "hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    )}
                  >
                    Raw submission data (read-only)
                  </summary>
                  <pre
                    className={cn(
                      "max-h-96 overflow-auto border-t border-border bg-bg-subtle p-3",
                      "text-xs font-mono whitespace-pre-wrap break-all text-fg-muted"
                    )}
                  >
                    {JSON.stringify(detail.data.row.raw_payload_redacted, null, 2)}
                  </pre>
                </details>
              </section>

              <section>
                <h3 className="text-2xs font-semibold uppercase tracking-sops text-fg-muted">
                  Audit
                </h3>
                <dl className="mt-2 grid grid-cols-[max-content,1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-fg-muted">Activity ID</dt>
                  <dd className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-mono text-xs tabular-nums">{row.activity_id}</span>
                    <button
                      type="button"
                      onClick={() => void copyId()}
                      aria-label={copied ? "Activity ID copied" : "Copy activity ID"}
                      className={cn(
                        "shrink-0 rounded-sm p-1 text-fg-muted",
                        "hover:bg-bg-subtle hover:text-fg",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      )}
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-success-fg" strokeWidth={2.5} />
                      ) : (
                        <Copy className="h-3 w-3" strokeWidth={2} />
                      )}
                    </button>
                  </dd>
                  <dt className="text-fg-muted">Source</dt>
                  <dd>{row.source_kind.replace(/_/g, " ")}</dd>
                  <dt className="text-fg-muted">Action</dt>
                  <dd>{row.action_kind.replace(/_/g, " ")}</dd>
                  <dt className="text-fg-muted">Status</dt>
                  <dd>{row.status.replace(/_/g, " ")}</dd>
                  {row.posted_at ? (
                    <>
                      <dt className="text-fg-muted">Posted at</dt>
                      <dd className="tabular-nums">{new Date(row.posted_at).toLocaleString("en-US")}</dd>
                    </>
                  ) : null}
                </dl>
              </section>
            </>
          ) : null}
        </div>

        <div className="border-t border-border/60 bg-bg-subtle/40 px-5 py-3 text-xs leading-relaxed text-fg-muted">
          This is a permanent audit entry. To correct, submit a new action.
        </div>
      </div>
    </div>
  );
}
