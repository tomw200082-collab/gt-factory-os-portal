// BomDraftEditorPage — page-level component for the DRAFT line editor at
// /admin/masters/boms/[bom_head_id]/[version_id]/edit. Composes:
//   - useQuery for the version row (filtered list + find by id)
//   - useQuery for the head row
//   - useQuery for the version's lines (the table body)
//   - useQuery for the active version's lines (for the Changes-from diff)
//   - useComponentReadinessMap for per-line pips
// Edit affordances are gated on version.status === "DRAFT".

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { BomLineRow as BomLineDataRow } from "@/components/admin/recipe-health/useTrackData";
import { useComponentReadinessMap } from "@/components/admin/recipe-health/useComponentReadinessMap";
import { ReadinessPanel } from "@/components/admin/recipe-health/ReadinessPanel";
import { QuickFixDrawer } from "@/components/admin/recipe-health/QuickFixDrawer";
import { BomLineRow } from "./BomLineRow";
import { BomLineAddDrawer } from "./BomLineAddDrawer";
import { BomLineDiff } from "./BomLineDiff";
import {
  PublishConfirmModal,
  type PublishPreview,
} from "./PublishConfirmModal";

interface BomDraftEditorPageProps {
  bomHeadId: string;
  versionId: string;
  /** Injectable navigator for tests. Defaults to next/navigation router.push. */
  onNavigate?: (href: string) => void;
}

interface VersionRow {
  bom_version_id: string;
  bom_head_id: string;
  version_label: string;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
  updated_at: string;
}

// Mirrors the upstream `bom_head` row shape from /api/v1/queries/boms/heads.
// The item id is `parent_ref_id` and the item name is `parent_name` — the
// table is parented to whatever owns the BOM (an item for v1; the schema
// keeps it generic). Earlier drafts of this page assumed `item_id` /
// `item_name`, which were never populated, so the post-publish redirect
// silently fell through to the head detail page.
interface HeadRow {
  bom_head_id: string;
  bom_kind: string;
  parent_ref_id: string | null;
  parent_name: string | null;
  active_version_id: string | null;
  status: string;
}

export function BomDraftEditorPage({
  bomHeadId,
  versionId,
  onNavigate,
}: BomDraftEditorPageProps): JSX.Element {
  const router = useRouter();
  const navigate = onNavigate ?? ((href: string) => router.push(href));
  const versionListQuery = useQuery({
    queryKey: ["boms", "versions", bomHeadId],
    queryFn: async (): Promise<VersionRow[]> => {
      const url = `/api/boms/versions?bom_head_id=${encodeURIComponent(bomHeadId)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `versions list — HTTP ${res.status} from ${url}\n${body.slice(0, 400)}`,
        );
      }
      const body = await res.json();
      return (body.rows ?? []) as VersionRow[];
    },
  });
  const versions = versionListQuery.data ?? [];
  const version = versions.find((v) => v.bom_version_id === versionId) ?? null;
  const activeVersion = versions.find((v) => v.status === "ACTIVE") ?? null;

  const headQuery = useQuery({
    queryKey: ["boms", "head", bomHeadId],
    queryFn: async (): Promise<HeadRow | null> => {
      const url = `/api/boms/heads?bom_head_id=${encodeURIComponent(bomHeadId)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `head — HTTP ${res.status} from ${url}\n${body.slice(0, 400)}`,
        );
      }
      const body = await res.json();
      const rows = (body.rows ?? []) as HeadRow[];
      return rows.find((h) => h.bom_head_id === bomHeadId) ?? rows[0] ?? null;
    },
  });

  // Lines query is intentionally TOLERANT — a failure here must not block
  // editing the version metadata (header) or the supplier readiness panel.
  // We surface the upstream error in a banner instead of stalling the page.
  const linesQuery = useQuery({
    queryKey: ["boms", "lines", versionId],
    queryFn: async (): Promise<{
      rows: BomLineDataRow[];
      warning: string | null;
    }> => {
      const url = `/api/boms/lines?bom_version_id=${encodeURIComponent(versionId)}&limit=500`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // Tolerant: return empty rows + warning so the editor still renders.
        return {
          rows: [],
          warning: `Could not load BOM lines — HTTP ${res.status}. Upstream said: ${text.slice(0, 300) || "(no body)"}`,
        };
      }
      const body = await res.json();
      return {
        rows: (body.rows ?? []) as BomLineDataRow[],
        warning: null,
      };
    },
  });

  const activeLinesQuery = useQuery({
    queryKey: ["boms", "lines", activeVersion?.bom_version_id ?? null],
    queryFn: async (): Promise<BomLineDataRow[]> => {
      const url = `/api/boms/lines?bom_version_id=${encodeURIComponent(activeVersion!.bom_version_id)}&limit=500`;
      const res = await fetch(url);
      if (!res.ok) {
        // Soft fail: diff vs active is a nice-to-have, not a blocker.
        return [];
      }
      const body = await res.json();
      return (body.rows ?? []) as BomLineDataRow[];
    },
    enabled:
      activeVersion !== null && activeVersion.bom_version_id !== versionId,
  });

  const lines = linesQuery.data?.rows;
  const linesWarning = linesQuery.data?.warning ?? null;
  const componentIds = useMemo(
    () =>
      Array.from(new Set((lines ?? []).map((l) => l.final_component_id))),
    [lines],
  );
  const readiness = useComponentReadinessMap(componentIds);

  const [addOpen, setAddOpen] = useState(false);
  const [fixComponentId, setFixComponentId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const previewQuery = useQuery({
    queryKey: ["boms", "publish-preview", versionId],
    queryFn: async (): Promise<PublishPreview> => {
      const res = await fetch(
        `/api/boms/versions/${encodeURIComponent(versionId)}/publish-preview`,
      );
      if (!res.ok) throw new Error(`preview: ${res.status}`);
      return (await res.json()) as PublishPreview;
    },
    enabled: previewOpen,
  });

  function publishKey(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  }

  const publishMutation = useMutation({
    mutationFn: async (args: { confirmOverride: boolean }) => {
      const res = await fetch(
        `/api/boms/versions/${encodeURIComponent(versionId)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            if_match_updated_at: version?.updated_at,
            idempotency_key: publishKey(),
            confirm_override: args.confirmOverride,
          }),
        },
      );
      if (!res.ok) throw new Error(`publish: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      const itemId = headQuery.data?.parent_ref_id;
      if (itemId) {
        navigate(`/admin/masters/items/${itemId}`);
      } else {
        navigate(`/admin/masters/boms/${bomHeadId}`);
      }
    },
  });

  // Distinct page states — loading / error / version-not-in-list /
  // missing-head — never collapsed into one indistinguishable spinner.
  const anyLoading =
    versionListQuery.isLoading || headQuery.isLoading || linesQuery.isLoading;
  if (anyLoading) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <div className="rounded-md border border-border bg-bg-raised p-6 text-sm text-fg-muted">
          Loading recipe…
        </div>
      </div>
    );
  }
  const errMsg =
    versionListQuery.error?.message || headQuery.error?.message || null;
  if (errMsg) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <div className="rounded-md border border-danger-border bg-danger-soft p-5">
          <p className="text-sm font-semibold text-danger-fg">
            Could not load recipe
          </p>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs text-danger-fg/90">
            {errMsg}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                void versionListQuery.refetch();
                void headQuery.refetch();
                void linesQuery.refetch();
              }}
              className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!version) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <div className="rounded-md border border-warning-border bg-warning-soft p-5 text-sm">
          <p className="font-semibold text-warning-fg">
            Version not found in list
          </p>
          <p className="mt-1 text-warning-fg/90">
            The draft may have just been created. Refresh to retry, or
            return to the product page and click <em>Edit recipe</em> again.
          </p>
          <button
            type="button"
            onClick={() => versionListQuery.refetch()}
            className="mt-3 rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-fg hover:bg-bg-subtle"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }
  if (!headQuery.data) {
    return (
      <div className="mx-auto max-w-5xl p-8 text-sm text-fg-muted">
        BOM head not found.
      </div>
    );
  }

  const head = headQuery.data;
  const trackLabel = head.bom_kind === "BASE" ? "Base formula" : "Pack BOM";
  const editable = version.status === "DRAFT";
  const itemName = head.parent_name ?? head.parent_ref_id ?? bomHeadId;
  const safeLines = lines ?? [];

  // UI-only warnings (supplier/price gaps) projected from the readiness map.
  // Backend hard-blockers come from the publish-preview response.
  const uiWarnings: string[] = [];
  for (const c of readiness.map.values()) {
    if (c.primary_supplier_id === null)
      uiWarnings.push(`${c.component_name}: no primary supplier`);
    if (c.active_price_value === null)
      uiWarnings.push(`${c.component_name}: no active price`);
  }

  const STATUS_PILL_CLASS: Record<VersionRow["status"], string> = {
    DRAFT: "bg-warning-soft text-warning-fg border-warning-border",
    ACTIVE: "bg-success-soft text-success-fg border-success-border",
    SUPERSEDED: "bg-bg-subtle text-fg-muted border-border",
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-10 border-b border-border bg-bg-raised/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-3xs font-semibold uppercase tracking-sops text-fg-subtle">
              {trackLabel} · Version {version.version_label}
            </div>
            <h1 className="truncate text-base font-semibold text-fg-strong">
              {itemName}
            </h1>
          </div>
          <span
            className={`rounded-sm border px-2 py-0.5 text-3xs font-semibold uppercase tracking-sops ${STATUS_PILL_CLASS[version.status]}`}
          >
            {version.status}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => navigate(`/admin/masters/items/${head.parent_ref_id ?? ""}`)}
              className="rounded-sm border border-border bg-bg-raised px-3 py-1.5 text-sm text-fg hover:bg-bg-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!editable}
              onClick={() => setPreviewOpen(true)}
              className="rounded-sm border border-accent-border bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Publish
            </button>
          </div>
        </div>
      </header>

      {!editable && (
        <div className="border-b border-warning-border bg-warning-soft px-6 py-2 text-sm text-warning-fg">
          This version is {version.status} — read-only. Only DRAFT versions can be edited.
        </div>
      )}
      {linesWarning && (
        <div className="border-b border-danger-border bg-danger-soft px-6 py-2 text-sm">
          <span className="font-semibold text-danger-fg">Lines unavailable. </span>
          <span className="text-danger-fg/90">{linesWarning}</span>
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <section className="rounded-md border border-border bg-bg-raised">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-fg-strong">
                Components
              </h2>
              {editable && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="rounded-sm border border-border bg-bg px-2.5 py-1 text-xs text-fg hover:bg-bg-subtle"
                >
                  + Add component
                </button>
              )}
            </div>
            {activeVersion && activeVersion.bom_version_id !== versionId && (
              <div className="border-b border-border px-4 py-3">
                <BomLineDiff
                  draftLines={safeLines}
                  activeLines={activeLinesQuery.data ?? []}
                  activeVersionLabel={activeVersion.version_label}
                />
              </div>
            )}
            {safeLines.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-fg-muted">
                  {linesWarning
                    ? "Lines could not be loaded. See banner above."
                    : "No components on this version yet."}
                </p>
                {editable && !linesWarning && (
                  <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="mt-3 rounded-sm border border-accent-border bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
                  >
                    Add the first component
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg-subtle/60 text-3xs uppercase tracking-sops text-fg-subtle">
                    <th className="px-4 py-2 text-left font-semibold">
                      Component
                    </th>
                    <th className="px-2 py-2 text-left font-semibold">Qty</th>
                    <th className="px-2 py-2 text-left font-semibold">UOM</th>
                    <th className="px-2 py-2 text-left font-semibold">
                      Readiness
                    </th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {safeLines.map((line) => (
                    <BomLineRow
                      key={line.bom_line_id}
                      line={line}
                      versionId={versionId}
                      readiness={
                        readiness.map.get(line.final_component_id) ?? null
                      }
                      editable={editable}
                      onOpenQuickFix={(cid) => setFixComponentId(cid)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <aside className="hidden lg:block">
            <ReadinessPanel
              readinessMap={readiness.map}
              nowMs={Date.now()}
              onFix={setFixComponentId}
            />
          </aside>
        </div>
        {/* Mobile-only bottom drawer with the same readiness data. */}
        <div className="lg:hidden">
          <ReadinessPanel
            readinessMap={readiness.map}
            nowMs={Date.now()}
            onFix={setFixComponentId}
            mobileMode
          />
        </div>
        <BomLineAddDrawer
          versionId={versionId}
          open={addOpen}
          onClose={() => setAddOpen(false)}
        />
        {fixComponentId && (
          <QuickFixDrawer
            componentId={fixComponentId}
            open
            onClose={() => setFixComponentId(null)}
          />
        )}
        {previewOpen && previewQuery.data && (
          <PublishConfirmModal
            preview={previewQuery.data}
            uiWarnings={uiWarnings}
            nextVersionLabel={version.version_label}
            onCancel={() => setPreviewOpen(false)}
            onConfirm={(confirmOverride) =>
              publishMutation.mutate({ confirmOverride })
            }
          />
        )}
      </main>
    </div>
  );
}
