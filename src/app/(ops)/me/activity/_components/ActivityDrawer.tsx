"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import type { ActivityDrawerResponse, ActivityRow } from "../_types";

export function ActivityDrawer({
  row,
  onClose,
}: {
  row: ActivityRow;
  onClose: () => void;
}) {
  const detail = useQuery<ActivityDrawerResponse>({
    queryKey: ["me", "activity", row.activity_id],
    queryFn: async () => {
      const res = await fetch(`/api/me/activity/${encodeURIComponent(row.activity_id)}`);
      if (!res.ok) throw new Error("Could not load activity detail.");
      return res.json() as Promise<ActivityDrawerResponse>;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const links = detail.data?.row.cross_links ?? [];

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
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
            <div className="text-base font-semibold text-fg">{row.summary.headline}</div>
            {row.summary.secondary ? (
              <div className="mt-1 text-sm text-fg-muted">{row.summary.secondary}</div>
            ) : null}
            <div className="mt-2 text-xs text-fg-subtle">
              {new Date(row.event_at).toLocaleString()}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            className="text-lg text-fg-muted hover:text-fg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 px-5 py-4">
          {detail.isLoading ? (
            <div className="text-sm text-fg-muted">Loading detail…</div>
          ) : detail.isError ? (
            <div className="text-sm text-danger-fg">{detail.error.message}</div>
          ) : detail.data ? (
            <>
              {links.length > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Related</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {links.map((l) => (
                      <li key={`${l.kind}:${l.target_id}`}>
                        <span className="text-fg-muted">{l.kind}:</span>{" "}
                        <span className="font-mono text-xs">{l.label}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Payload</h3>
                <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-border bg-bg-subtle p-3 text-xs font-mono">
                  {JSON.stringify(detail.data.row.raw_payload_redacted, null, 2)}
                </pre>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Audit</h3>
                <dl className="mt-2 grid grid-cols-[max-content,1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-fg-muted">Activity ID</dt>
                  <dd className="font-mono text-xs break-all">{row.activity_id}</dd>
                  <dt className="text-fg-muted">Source</dt>
                  <dd>{row.source_kind}</dd>
                  <dt className="text-fg-muted">Action</dt>
                  <dd>{row.action_kind}</dd>
                  <dt className="text-fg-muted">Status</dt>
                  <dd>{row.status}</dd>
                  {row.posted_at ? (
                    <>
                      <dt className="text-fg-muted">Posted at</dt>
                      <dd>{new Date(row.posted_at).toLocaleString()}</dd>
                    </>
                  ) : null}
                </dl>
              </section>
            </>
          ) : null}
        </div>

        <div className="border-t border-border/60 px-5 py-3 text-xs text-fg-muted">
          This is a permanent audit entry. To correct, submit a new action.
        </div>
      </div>
    </div>
  );
}
